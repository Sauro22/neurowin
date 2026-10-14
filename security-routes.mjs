import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";

const TOKEN_TTL_SECONDS = 60 * 60 * 12;
const PASSWORD_ROUNDS = 12;

function isoNow() {
  return new Date().toISOString();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket?.remoteAddress || "unknown";
}

function getUserAgent(req) {
  return String(req.headers["user-agent"] || "unknown").slice(0, 400);
}

function publicUser(row) {
  return {
    id: row.id,
    neurowinId: row.neurowin_id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

function createNeuroWinId() {
  const code = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `NW-${code}`;
}

function logSecurityEvent(db, { userId = null, type, req, detail = null }) {
  try {
    db.prepare(`
      INSERT INTO security_events (
        id, user_id, event_type, ip_address, user_agent, detail, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      userId,
      type,
      getClientIp(req),
      getUserAgent(req),
      detail ? JSON.stringify(detail) : null,
      isoNow()
    );
  } catch (error) {
    console.warn("Não foi possível registar evento de segurança:", error?.message || error);
  }
}

export function setupSecurityRoutes(app) {
  const jwtSecret = String(process.env.AUTH_JWT_SECRET || "").trim();

  if (jwtSecret.length < 32) {
    throw new Error("AUTH_JWT_SECRET não está configurado corretamente. Usa pelo menos 32 caracteres.");
  }

  const dataDir = path.resolve("data");
  fs.mkdirSync(dataDir, { recursive: true });

  const db = new Database(path.join(dataDir, "neurowin.sqlite"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      neurowin_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_jti TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      ip_address TEXT,
      user_agent TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS security_events (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      event_type TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      detail TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_jti ON sessions(token_jti);
    CREATE INDEX IF NOT EXISTS idx_security_created ON security_events(created_at DESC);
  `);

  const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL);
  const adminPassword = String(process.env.ADMIN_PASSWORD || "");

  if (adminEmail && adminPassword.length >= 8) {
    const existing = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();

    if (!existing) {
      const now = isoNow();
      db.prepare(`
        INSERT INTO users (
          id, neurowin_id, name, email, password_hash, role, status,
          created_at, updated_at, last_login_at
        ) VALUES (?, ?, ?, ?, ?, 'admin', 'active', ?, ?, NULL)
      `).run(
        crypto.randomUUID(),
        createNeuroWinId(),
        "Administrador NeuroWin",
        adminEmail,
        bcrypt.hashSync(adminPassword, PASSWORD_ROUNDS),
        now,
        now
      );
      console.log("✓ Conta Admin criada a partir do .env.");
    }
  }

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  function signToken(user) {
    const jti = crypto.randomUUID();
    const token = jwt.sign(
      {
        sub: user.id,
        role: user.role,
        jti,
      },
      jwtSecret,
      {
        expiresIn: TOKEN_TTL_SECONDS,
        issuer: "neurowin",
        audience: "neurowin-web",
      }
    );

    return { token, jti };
  }

  function requireAuth(req, res, next) {
    const header = String(req.headers.authorization || "");
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

    if (!token) {
      return res.status(401).json({ ok: false, error: "Autenticação necessária." });
    }

    try {
      const payload = jwt.verify(token, jwtSecret, {
        issuer: "neurowin",
        audience: "neurowin-web",
      });

      const session = db.prepare(`
        SELECT * FROM sessions
        WHERE token_jti = ? AND revoked_at IS NULL
        LIMIT 1
      `).get(payload.jti);

      if (!session || new Date(session.expires_at).getTime() <= Date.now()) {
        return res.status(401).json({ ok: false, error: "Sessão expirada." });
      }

      const user = db.prepare("SELECT * FROM users WHERE id = ? LIMIT 1").get(payload.sub);

      if (!user || user.status !== "active") {
        return res.status(403).json({ ok: false, error: "Conta indisponível." });
      }

      req.auth = {
        token,
        payload,
        session,
        user,
      };
      next();
    } catch {
      return res.status(401).json({ ok: false, error: "Sessão inválida." });
    }
  }

  function requireAdmin(req, res, next) {
    requireAuth(req, res, () => {
      if (req.auth.user.role !== "admin") {
        return res.status(403).json({ ok: false, error: "Acesso de administrador necessário." });
      }
      next();
    });
  }

  app.post("/api/auth/register", loginLimiter, (req, res) => {
    const name = String(req.body?.name || "").trim();
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (name.length < 2) {
      return res.status(400).json({ ok: false, error: "Indica um nome válido." });
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ ok: false, error: "Indica um email válido." });
    }

    if (password.length < 8) {
      return res.status(400).json({ ok: false, error: "A palavra-passe deve ter pelo menos 8 caracteres." });
    }

    const exists = db.prepare("SELECT id FROM users WHERE email = ? LIMIT 1").get(email);
    if (exists) {
      return res.status(409).json({ ok: false, error: "Já existe uma conta com este email." });
    }

    const id = crypto.randomUUID();
    const now = isoNow();
    const user = {
      id,
      neurowin_id: createNeuroWinId(),
      name,
      email,
      role: "user",
      status: "active",
      created_at: now,
      last_login_at: null,
    };

    db.prepare(`
      INSERT INTO users (
        id, neurowin_id, name, email, password_hash, role, status,
        created_at, updated_at, last_login_at
      ) VALUES (?, ?, ?, ?, ?, 'user', 'active', ?, ?, NULL)
    `).run(
      id,
      user.neurowin_id,
      name,
      email,
      bcrypt.hashSync(password, PASSWORD_ROUNDS),
      now,
      now
    );

    logSecurityEvent(db, { userId: id, type: "register_success", req });

    return res.status(201).json({ ok: true, user: publicUser(user) });
  });

  app.post("/api/auth/login", loginLimiter, (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    const user = db.prepare("SELECT * FROM users WHERE email = ? LIMIT 1").get(email);

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      logSecurityEvent(db, { type: "login_failed", req, detail: { email } });
      return res.status(401).json({ ok: false, error: "Email ou palavra-passe incorretos." });
    }

    if (user.status !== "active") {
      logSecurityEvent(db, { userId: user.id, type: "login_blocked", req });
      return res.status(403).json({ ok: false, error: "Esta conta está bloqueada." });
    }

    const { token, jti } = signToken(user);
    const createdAt = isoNow();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();

    db.prepare(`
      INSERT INTO sessions (
        id, user_id, token_jti, created_at, expires_at, revoked_at,
        ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
    `).run(
      crypto.randomUUID(),
      user.id,
      jti,
      createdAt,
      expiresAt,
      getClientIp(req),
      getUserAgent(req)
    );

    db.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").run(createdAt, createdAt, user.id);
    user.last_login_at = createdAt;
    logSecurityEvent(db, { userId: user.id, type: "login_success", req });

    return res.json({
      ok: true,
      token,
      expiresAt,
      user: publicUser(user),
    });
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    return res.json({ ok: true, user: publicUser(req.auth.user) });
  });

  app.post("/api/auth/logout", requireAuth, (req, res) => {
    db.prepare("UPDATE sessions SET revoked_at = ? WHERE token_jti = ?").run(isoNow(), req.auth.payload.jti);
    logSecurityEvent(db, { userId: req.auth.user.id, type: "logout", req });
    return res.json({ ok: true });
  });

  app.get("/api/admin/overview", requireAdmin, (req, res) => {
    const totalUsers = db.prepare("SELECT COUNT(*) AS total FROM users").get().total;
    const activeUsers = db.prepare("SELECT COUNT(*) AS total FROM users WHERE status = 'active'").get().total;
    const activeSessions = db.prepare(`
      SELECT COUNT(*) AS total FROM sessions
      WHERE revoked_at IS NULL AND expires_at > ?
    `).get(isoNow()).total;
    const securityEvents = db.prepare("SELECT COUNT(*) AS total FROM security_events").get().total;

    return res.json({
      ok: true,
      overview: { totalUsers, activeUsers, activeSessions, securityEvents },
    });
  });

  app.get("/api/admin/users", requireAdmin, (req, res) => {
    const rows = db.prepare(`
      SELECT
        u.*,
        (SELECT COUNT(*) FROM sessions s
         WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > ?) AS active_sessions
      FROM users u
      ORDER BY u.created_at DESC
      LIMIT 500
    `).all(isoNow());

    return res.json({
      ok: true,
      users: rows.map((row) => ({
        ...publicUser(row),
        activeSessions: row.active_sessions,
      })),
    });
  });

  app.get("/api/admin/users/:userId/sessions", requireAdmin, (req, res) => {
    const sessions = db.prepare(`
      SELECT id, created_at, expires_at, revoked_at, ip_address, user_agent
      FROM sessions
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 100
    `).all(req.params.userId);

    return res.json({ ok: true, sessions });
  });

  app.get("/api/admin/security-events", requireAdmin, (req, res) => {
    const events = db.prepare(`
      SELECT e.*, u.email AS user_email, u.name AS user_name
      FROM security_events e
      LEFT JOIN users u ON u.id = e.user_id
      ORDER BY e.created_at DESC
      LIMIT 200
    `).all();

    return res.json({ ok: true, events });
  });

  app.post("/api/admin/users/:userId/status", requireAdmin, (req, res) => {
    const status = String(req.body?.status || "");
    if (!["active", "blocked"].includes(status)) {
      return res.status(400).json({ ok: false, error: "Estado inválido." });
    }

    const target = db.prepare("SELECT * FROM users WHERE id = ? LIMIT 1").get(req.params.userId);
    if (!target) {
      return res.status(404).json({ ok: false, error: "Utilizador não encontrado." });
    }

    if (target.role === "admin" && status === "blocked") {
      return res.status(400).json({ ok: false, error: "Não é permitido bloquear a conta Admin por esta rota." });
    }

    db.prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ?").run(status, isoNow(), target.id);

    if (status === "blocked") {
      db.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(isoNow(), target.id);
    }

    logSecurityEvent(db, {
      userId: req.auth.user.id,
      type: "admin_user_status_change",
      req,
      detail: { targetUserId: target.id, status },
    });

    return res.json({ ok: true });
  });

  app.post("/api/admin/users/:userId/revoke-sessions", requireAdmin, (req, res) => {
    const target = db.prepare("SELECT * FROM users WHERE id = ? LIMIT 1").get(req.params.userId);
    if (!target) {
      return res.status(404).json({ ok: false, error: "Utilizador não encontrado." });
    }

    const result = db.prepare(`
      UPDATE sessions SET revoked_at = ?
      WHERE user_id = ? AND revoked_at IS NULL
    `).run(isoNow(), target.id);

    logSecurityEvent(db, {
      userId: req.auth.user.id,
      type: "admin_sessions_revoked",
      req,
      detail: { targetUserId: target.id, count: result.changes },
    });

    return res.json({ ok: true, revoked: result.changes });
  });

  console.log("✓ Segurança/Auth NeuroWin configurada.");
}
