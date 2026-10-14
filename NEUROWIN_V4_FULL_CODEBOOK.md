# NeuroWin V4 — Full Codebook
Código completo da versão V4. O ficheiro `.env` real não está incluído.
## Ordem recomendada

Consultar `V4_MIGRATION_GUIDE.md`.

---

## `package.json`

```json
{
  "name": "neurowin",
  "private": true,
  "version": "4.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "server": "node server.mjs"
  },
  "dependencies": {
    "@google/genai": "^2.24.0",
    "bcryptjs": "^3.0.3",
    "better-sqlite3": "12.11.1",
    "cors": "^2.8.6",
    "dotenv": "^18.0.3",
    "express": "^5.2.1",
    "express-rate-limit": "^8.7.0",
    "jsonwebtoken": "^9.0.3",
    "katex": "^0.18.9",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-markdown": "^10.1.0",
    "react-router-dom": "^6.30.1",
    "rehype-katex": "^7.0.1",
    "remark-gfm": "^4.0.1",
    "remark-math": "^6.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.7.3",
    "vite": "^6.1.0"
  }
}

```

---

## `.env.example`

```dotenv
# ==========================================
# NEUROWIN — EXEMPLO DE CONFIGURAÇÃO
# Nunca publiques o teu ficheiro .env real.
# ==========================================

PORT=3001
FRONTEND_ORIGIN=http://localhost:5173

# Auth / Admin
AUTH_JWT_SECRET=
ADMIN_EMAIL=
ADMIN_PASSWORD=

# NeuroWin AI
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash

# TheSportsDB
THESPORTSDB_API_KEY=

# Frontend -> Backend
VITE_API_URL=http://localhost:3001

```

---

## `server.mjs`

```javascript
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { setupSecurityRoutes } from "./security-routes.mjs";
import { setupTheSportsDBRoutes } from "./thesportsdb-routes.mjs";

dotenv.config({ quiet: true });

/* ==========================================
   01. SERVIDOR
========================================== */

const app = express();
const PORT = Number(process.env.PORT) || 3001;

/* ==========================================
   02. CORS
========================================== */

const configuredOrigin = String(
  process.env.FRONTEND_ORIGIN || "http://localhost:5173"
).trim();

const allowedOrigins = new Set([
  configuredOrigin,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

app.disable("x-powered-by");
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origem CORS não autorizada."));
    },
  })
);
app.use(express.json({ limit: "2mb" }));

/* ==========================================
   03. GEMINI
========================================== */

const GEMINI_API_KEY = String(
  process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ""
).trim();

const GEMINI_MODEL = String(
  process.env.GEMINI_MODEL || "gemini-3.8-flash"
).trim();

const ai = GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  : null;

/* ==========================================
   04. THE SPORTS DB
========================================== */

const SPORTSDB_API_KEY = String(
  process.env.THESPORTSDB_API_KEY || ""
).trim();

/* ==========================================
   05. HEALTH
========================================== */

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    application: "NeuroWin",
    server: "online",
    ai: Boolean(ai),
    aiModel: GEMINI_MODEL,
    sportsdb: Boolean(SPORTSDB_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

/* ==========================================
   06. NEUROWIN AI
========================================== */

app.post("/api/chat", async (req, res) => {
  if (!ai) {
    return res.status(503).json({
      ok: false,
      error: "Gemini não está configurado no servidor.",
    });
  }

  const message = String(
    req.body?.message || req.body?.prompt || ""
  ).trim();

  const history = Array.isArray(req.body?.history)
    ? req.body.history.slice(-14)
    : [];

  if (!message) {
    return res.status(400).json({
      ok: false,
      error: "Mensagem vazia.",
    });
  }

  const historyText = history
    .map((item) => {
      const role = item?.role === "assistant"
        ? "Assistente"
        : "Utilizador";
      const content = String(
        item?.content || item?.text || ""
      ).trim();
      return content ? `${role}: ${content}` : "";
    })
    .filter(Boolean)
    .join("\n");

  const prompt = `
Tu és a NeuroWin AI, um assistente premium de análise estatística e apoio à decisão.
Responde em português de Portugal, salvo se o utilizador escrever claramente noutro idioma.
Sê claro, técnico quando necessário e prudente com probabilidades e apostas.
Não prometas resultados futuros nem apresentes apostas como garantidas.
Distingue dados observados, estimativas e incerteza.

${historyText ? `Contexto recente:\n${historyText}\n` : ""}
Utilizador: ${message}
`.trim();

  const candidates = [
    GEMINI_MODEL,
    "gemini-3.5-flash-lite",
  ].filter(
    (value, index, array) =>
      value && array.indexOf(value) === index
  );

  let lastError = null;

  for (const model of candidates) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });

      const text =
        typeof response.text === "string"
          ? response.text.trim()
          : "";

      if (!text) {
        throw new Error("O modelo não devolveu texto.");
      }

      return res.json({
        ok: true,
        model,
        reply: text,
      });
    } catch (error) {
      lastError = error;
      console.error(
        `Gemini ${model}:`,
        error?.message || error
      );
    }
  }

  return res.status(502).json({
    ok: false,
    error:
      lastError instanceof Error
        ? lastError.message
        : "Não foi possível obter resposta da IA.",
  });
});

/* ==========================================
   07. SEGURANÇA / AUTH
========================================== */

setupSecurityRoutes(app);

/* ==========================================
   08. DESPORTO / THE SPORTS DB
========================================== */

setupTheSportsDBRoutes(app);

/* ==========================================
   09. 404 API
========================================== */

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Endpoint não encontrado.",
  });
});

/* ==========================================
   10. ERROS
========================================== */

app.use((error, req, res, next) => {
  console.error("NeuroWin server error:", error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    ok: false,
    error: "Erro interno do servidor.",
  });
});

/* ==========================================
   11. START
========================================== */

app.listen(PORT, () => {
  console.log(`✓ NeuroWin backend em http://localhost:${PORT}`);
});

```

---

## `thesportsdb-routes.mjs`

```javascript
const V1_BASE = "https://www.thesportsdb.com/api/v1/json";
const V2_BASE = "https://www.thesportsdb.com/api/v2/json";

const DAY_TTL = 5 * 60 * 1000;
const LIVE_TTL = 30 * 1000;

const cache = new Map();

/* ==========================================
   01. HELPERS
========================================== */

function clean(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function cryptoFallback(event) {
  return [
    clean(event.dateEvent) || "date",
    clean(event.strHomeTeam) || "home",
    clean(event.strAwayTeam) || "away",
  ].join("::");
}

/* ==========================================
   02. ESTADO DO EVENTO
========================================== */

function stateFromRaw(event) {
  const status = String(event.strStatus || "").trim().toLowerCase();
  const progress = String(event.strProgress || "").trim().toLowerCase();
  const combined = `${status} ${progress}`.trim();

  if (
    ["1h", "2h", "ht", "et", "bt", "p", "live", "in play"].includes(status) ||
    ["1h", "2h", "ht", "et", "bt", "p", "live", "in play"].includes(progress) ||
    combined.includes("live") ||
    combined.includes("in play") ||
    /^\d{1,3}(?:\+\d{1,2})?'?$/.test(progress)
  ) {
    return "live";
  }

  if (
    ["ft", "aet", "pen"].includes(status) ||
    progress === "final" ||
    combined.includes("finished") ||
    combined.includes("match finished") ||
    combined.includes("after extra time") ||
    combined.includes("penalties")
  ) {
    return "finished";
  }

  if (
    combined.includes("postponed") ||
    combined.includes("cancelled") ||
    combined.includes("canceled") ||
    combined.includes("abandoned")
  ) {
    return "cancelled";
  }

  return "scheduled";
}

/* ==========================================
   03. NORMALIZAÇÃO
========================================== */

function normalizeEvent(event) {
  return {
    id: clean(event.idEvent) || clean(event.idLiveScore) || cryptoFallback(event),
    event: clean(event.strEvent),
    leagueId: clean(event.idLeague),
    league: clean(event.strLeague),
    leagueBadge: clean(event.strLeagueBadge),
    sport: clean(event.strSport),
    country: clean(event.strCountry),
    season: clean(event.strSeason),
    date: clean(event.dateEvent),
    time: clean(event.strTime) || clean(event.strEventTime),
    timestamp: clean(event.strTimestamp),
    status: clean(event.strStatus),
    progress: clean(event.strProgress),
    state: stateFromRaw(event),
    homeTeam: {
      id: clean(event.idHomeTeam),
      name: clean(event.strHomeTeam) || "Equipa Casa",
      badge: clean(event.strHomeTeamBadge),
    },
    awayTeam: {
      id: clean(event.idAwayTeam),
      name: clean(event.strAwayTeam) || "Equipa Fora",
      badge: clean(event.strAwayTeamBadge),
    },
    homeScore: numberOrNull(event.intHomeScore),
    awayScore: numberOrNull(event.intAwayScore),
    venue: clean(event.strVenue),
    city: clean(event.strCity),
    round: clean(event.intRound),
    poster: clean(event.strPoster),
    thumbnail: clean(event.strThumb),
    video: clean(event.strVideo),
  };
}

function extractEvents(data) {
  for (const candidate of [
    data?.events,
    data?.livescore,
    data?.livescores,
    data?.results,
    data,
  ]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

/* ==========================================
   04. HTTP
========================================== */

async function fetchJson(url, options = {}, timeout = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });

    const text = await response.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      throw new Error(
        data?.message ||
        data?.error ||
        `TheSportsDB HTTP ${response.status}`
      );
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

/* ==========================================
   05. CACHE
========================================== */

function getCache(key, ttl) {
  const value = cache.get(key);
  if (!value) return null;

  if (Date.now() - value.createdAt > ttl) {
    cache.delete(key);
    return null;
  }

  return value.data;
}

function setCache(key, data) {
  cache.set(key, {
    createdAt: Date.now(),
    data,
  });
}

/* ==========================================
   06. EVENTOS DO DIA — V1
========================================== */

async function getDayEvents(apiKey, date) {
  const url = new URL(
    `${V1_BASE}/${encodeURIComponent(apiKey)}/eventsday.php`
  );

  url.searchParams.set("d", date);
  url.searchParams.set("s", "Soccer");

  const data = await fetchJson(url.toString());

  return extractEvents(data)
    .map(normalizeEvent)
    .filter((event) => event.id);
}

/* ==========================================
   07. ROTAS
========================================== */

export function setupTheSportsDBRoutes(app) {
  const apiKey = String(
    process.env.THESPORTSDB_API_KEY || ""
  ).trim();

  const configured = Boolean(apiKey);
  const freeKey = apiKey === "123";

  /* ========================================
     07.1 STATUS
  ======================================== */

  app.get("/api/sportsdb/status", (req, res) => {
    res.json({
      ok: true,
      provider: "TheSportsDB",
      configured,
      plan: !configured ? "not-configured" : freeKey ? "free" : "custom",
      v2Requested: configured && !freeKey,
      fetchedAt: new Date().toISOString(),
    });
  });

  /* ========================================
     07.2 JOGOS POR DIA
  ======================================== */

  app.get("/api/sportsdb/day", async (req, res) => {
    if (!configured) {
      return res.status(503).json({
        ok: false,
        error: "THESPORTSDB_API_KEY não está configurada no servidor.",
      });
    }

    const date = String(req.query.date || "").trim();

    if (!isDate(date)) {
      return res.status(400).json({
        ok: false,
        error: "Data inválida. Usa YYYY-MM-DD.",
      });
    }

    const key = `day:${date}`;
    const cached = getCache(key, DAY_TTL);

    if (cached) {
      return res.json({
        ...cached,
        cached: true,
      });
    }

    try {
      const events = await getDayEvents(apiKey, date);

      const result = {
        ok: true,
        provider: "TheSportsDB",
        plan: freeKey ? "free" : "custom",
        date,
        count: events.length,
        cached: false,
        fetchedAt: new Date().toISOString(),
        events,
      };

      setCache(key, result);
      return res.json(result);
    } catch (error) {
      console.error(
        "TheSportsDB day:",
        error?.message || error
      );

      return res.status(502).json({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Falha ao consultar TheSportsDB.",
      });
    }
  });

  /* ========================================
     07.3 LIVE — V2 QUANDO DISPONÍVEL
  ======================================== */

  app.get("/api/sportsdb/live", async (req, res) => {
    if (!configured) {
      return res.status(503).json({
        ok: false,
        supported: false,
        error: "THESPORTSDB_API_KEY não está configurada no servidor.",
        events: [],
      });
    }

    const key = "live:soccer";
    const cached = getCache(key, LIVE_TTL);

    if (cached) {
      return res.json({
        ...cached,
        cached: true,
      });
    }

    /* ======================================
       V2 LIVESCORE
       Usa X-API-KEY e requer acesso V2.
    ====================================== */

    if (!freeKey) {
      try {
        const data = await fetchJson(
          `${V2_BASE}/livescore/soccer`,
          {
            headers: {
              "X-API-KEY": apiKey,
            },
          }
        );

        const events = extractEvents(data)
          .map(normalizeEvent)
          .filter((event) => event.id)
          .map((event) => ({
            ...event,
            state:
              event.state === "finished" ||
              event.state === "cancelled"
                ? event.state
                : "live",
          }));

        const result = {
          ok: true,
          provider: "TheSportsDB",
          source: "v2-livescore",
          supported: true,
          count: events.length,
          cached: false,
          fetchedAt: new Date().toISOString(),
          events,
        };

        setCache(key, result);
        return res.json(result);
      } catch (error) {
        console.warn(
          "Livescore V2 indisponível; a usar fallback diário:",
          error?.message || error
        );
      }
    }

    /* ======================================
       FALLBACK V1
       Procura estados live no feed diário.
    ====================================== */

    try {
      const today = new Date().toISOString().slice(0, 10);

      const events = (await getDayEvents(apiKey, today))
        .filter((event) => event.state === "live");

      const result = {
        ok: true,
        provider: "TheSportsDB",
        source: "v1-day-fallback",
        supported: false,
        count: events.length,
        cached: false,
        fetchedAt: new Date().toISOString(),
        message: freeKey
          ? "A chave free não disponibiliza o feed dedicado V2. Foram usados estados live do feed diário."
          : "O feed dedicado V2 não respondeu. Foram usados estados live do feed diário.",
        events,
      };

      setCache(key, result);
      return res.json(result);
    } catch (error) {
      return res.status(502).json({
        ok: false,
        source: "unavailable",
        supported: false,
        error:
          error instanceof Error
            ? error.message
            : "Livescores indisponíveis.",
        events: [],
      });
    }
  });

  console.log(
    configured
      ? "✓ TheSportsDB configurado."
      : "! TheSportsDB sem THESPORTSDB_API_KEY."
  );
}

```

---

## `security-routes.mjs`

```javascript
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

```

---

## `vite.config.ts`

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: "0.0.0.0",
  },
});

```

---

## `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src", "vite.config.ts"]
}

```

---

## `tsconfig.node.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}

```

---

## `index.html`

```html
<!doctype html>
<html lang="pt-PT">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#04101a" />
    <meta name="description" content="NeuroWin — inteligência estatística, IA e análise desportiva." />
    <title>NeuroWin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>

```

---

## `src/main.tsx`

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>
);

```

---

## `src/App.tsx`

```tsx
import { useEffect, useState } from "react";
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { AgeGate } from "./components/AgeGate";
import { Layout } from "./components/Layout";
import {
  apiFetch,
  clearSession,
  getToken,
  type AuthUser,
} from "./lib/api";
import Home from "./pages/Home";
import Signals from "./pages/Signals";
import AI from "./pages/AI";
import Sports from "./pages/Sports";
import Profile from "./pages/Profile";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ResponsibleGaming from "./pages/ResponsibleGaming";
import NotFound from "./pages/NotFound";

type AuthState = "checking" | "authenticated" | "guest";

/* ==========================================
   01. ROTA PROTEGIDA
========================================== */

function ProtectedRoute() {
  const location = useLocation();
  const [state, setState] = useState<AuthState>("checking");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!getToken()) {
        if (!cancelled) setState("guest");
        return;
      }

      try {
        await apiFetch<{ user: AuthUser }>("/api/auth/me");
        if (!cancelled) setState("authenticated");
      } catch {
        clearSession();
        if (!cancelled) setState("guest");
      }
    }

    check();

    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (state === "checking") {
    return (
      <main className="center-screen">
        <div className="loading-card premium-card led-border">
          <span className="brand-mark">N</span>
          <div>
            <strong>NeuroWin</strong>
            <small>A validar sessão…</small>
          </div>
        </div>
      </main>
    );
  }

  if (state === "guest") {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return <Outlet />;
}

/* ==========================================
   02. ROTA ADMIN
========================================== */

function AdminRoute() {
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    apiFetch<{ user: AuthUser }>("/api/auth/me")
      .then((data) => {
        if (!cancelled) {
          setAllowed(data.user.role === "admin");
        }
      })
      .catch(() => {
        clearSession();
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (checking) {
    return (
      <main className="center-screen">
        <div className="loading-card premium-card led-border">
          A validar permissões…
        </div>
      </main>
    );
  }

  return allowed
    ? <Outlet />
    : <Navigate to="/perfil" replace />;
}

/* ==========================================
   03. ROTA DE CONVIDADO
========================================== */

function GuestRoute() {
  return getToken()
    ? <Navigate to="/perfil" replace />
    : <Outlet />;
}

/* ==========================================
   04. APP
========================================== */

export default function App() {
  return (
    <>
      <AgeGate />

      <Routes>
        {/* ==================================
            LOGIN / REGISTO
        ================================== */}
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<Login />} />
          <Route path="/registar" element={<Register />} />
        </Route>

        {/* ==================================
            APLICAÇÃO PRINCIPAL
        ================================== */}
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/sinais" element={<Signals />} />
          <Route path="/ia" element={<AI />} />
          <Route path="/desporto" element={<Sports />} />
          <Route path="/jogo-responsavel" element={<ResponsibleGaming />} />

          {/* PERFIL */}
          <Route element={<ProtectedRoute />}>
            <Route path="/perfil" element={<Profile />} />
          </Route>

          {/* ADMIN */}
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<Admin />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  );
}

```

---

## `src/lib/api.ts`

```typescript
export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/$/, "");

export const AUTH_TOKEN_KEY = "neurowin-auth-token";
export const AUTH_USER_KEY = "neurowin-auth-user";

export type AuthUser = {
  id: string;
  neurowinId: string;
  name: string;
  email: string;
  role: "user" | "admin" | string;
  status: string;
  createdAt?: string | null;
  lastLoginAt?: string | null;
};

export function getToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function storeSession(token: string, user: AuthUser) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers || {});

  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  const text = await response.text();
  let data: unknown = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || `HTTP ${response.status}` };
  }

  if (!response.ok) {
    const message =
      typeof data === "object" && data && "error" in data
        ? String((data as { error?: unknown }).error || `HTTP ${response.status}`)
        : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

```

---

## `src/components/Icons.tsx`

```tsx
import type { ReactNode, SVGProps } from "react";

type Props = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: Props & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (props: Props) => (
  <Icon {...props}>
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5.5 10.5V20h13v-9.5" />
    <path d="M9.5 20v-5.5h5V20" />
  </Icon>
);

export const SignalIcon = (props: Props) => (
  <Icon {...props}>
    <rect x="3" y="4" width="18" height="14" rx="2" />
    <path d="m7 13 3-3 2.5 2.5L17 8" />
    <path d="M8 21h8" />
  </Icon>
);

export const BrainIcon = (props: Props) => (
  <Icon {...props}>
    <path d="M9.5 4.5A3 3 0 0 0 5 7a3.5 3.5 0 0 0 .5 6.5A3 3 0 0 0 9 18.5V5" />
    <path d="M14.5 4.5A3 3 0 0 1 19 7a3.5 3.5 0 0 1-.5 6.5A3 3 0 0 1 15 18.5V5" />
    <path d="M9 9H7.5" />
    <path d="M15 9h1.5" />
    <path d="M9 14H7" />
    <path d="M15 14h2" />
  </Icon>
);

export const TrophyIcon = (props: Props) => (
  <Icon {...props}>
    <path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
    <path d="M8 6H4v2a4 4 0 0 0 4 4" />
    <path d="M16 6h4v2a4 4 0 0 1-4 4" />
    <path d="M12 12v5" />
    <path d="M8.5 20h7" />
  </Icon>
);

export const UserIcon = (props: Props) => (
  <Icon {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
  </Icon>
);

export const ShieldIcon = (props: Props) => (
  <Icon {...props}>
    <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
);

export const RefreshIcon = (props: Props) => (
  <Icon {...props}>
    <path d="M20 6v5h-5" />
    <path d="M4 18v-5h5" />
    <path d="M18.5 9A7 7 0 0 0 6.3 6.3L4 8.5" />
    <path d="M5.5 15A7 7 0 0 0 17.7 17.7L20 15.5" />
  </Icon>
);

export const SearchIcon = (props: Props) => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4" />
  </Icon>
);

export const SendIcon = (props: Props) => (
  <Icon {...props}>
    <path d="m22 2-7 20-4-9-9-4 20-7Z" />
    <path d="M22 2 11 13" />
  </Icon>
);

export const LogOutIcon = (props: Props) => (
  <Icon {...props}>
    <path d="M10 17l5-5-5-5" />
    <path d="M15 12H3" />
    <path d="M13 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
  </Icon>
);

export const AdminIcon = (props: Props) => (
  <Icon {...props}>
    <path d="M12 3 4 7v5c0 4.5 3.2 7.3 8 9 4.8-1.7 8-4.5 8-9V7l-8-4Z" />
    <path d="M9.5 12.5 11 14l3.5-4" />
  </Icon>
);

export const BellIcon = (props: Props) => (
  <Icon {...props}>
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
    <path d="M10 21h4" />
  </Icon>
);

export const ChevronRightIcon = (props: Props) => (
  <Icon {...props}>
    <path d="m9 18 6-6-6-6" />
  </Icon>
);

export const ChartIcon = (props: Props) => (
  <Icon {...props}>
    <path d="M5 20V10" />
    <path d="M12 20V4" />
    <path d="M19 20v-7" />
  </Icon>
);

export const DatabaseIcon = (props: Props) => (
  <Icon {...props}>
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
    <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
  </Icon>
);

export const CalendarIcon = (props: Props) => (
  <Icon {...props}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M8 3v4" />
    <path d="M16 3v4" />
    <path d="M3 10h18" />
  </Icon>
);

export const ClockIcon = (props: Props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

export const SettingsIcon = (props: Props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.18.38.47.7.83.9.34.2.74.3 1.17.3h.1v4h-.1c-.43 0-.83.1-1.17.3-.36.2-.65.52-.83.9Z" />
  </Icon>
);

export const UsersIcon = (props: Props) => (
  <Icon {...props}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
    <path d="M16 4.5a3 3 0 0 1 0 6" />
    <path d="M17 14.5a5.5 5.5 0 0 1 3.5 5.5" />
  </Icon>
);

export const LockIcon = (props: Props) => (
  <Icon {...props}>
    <rect x="5" y="10" width="14" height="11" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </Icon>
);

export const TrashIcon = (props: Props) => (
  <Icon {...props}>
    <path d="M4 7h16" />
    <path d="M9 3h6l1 4H8l1-4Z" />
    <path d="m7 7 1 14h8l1-14" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </Icon>
);

export const StarIcon = (props: Props) => (
  <Icon {...props}>
    <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
  </Icon>
);

```

---

## `src/components/Layout.tsx`

```tsx
import { NavLink, Outlet } from "react-router-dom";
import {
  BellIcon,
  BrainIcon,
  HomeIcon,
  SearchIcon,
  SignalIcon,
  TrophyIcon,
  UserIcon,
} from "./Icons";
import { getStoredUser } from "../lib/api";

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? "bottom-link active" : "bottom-link";
}

export function Layout() {
  const user = getStoredUser();
  const initials = (user?.name || "NW")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="app-shell">
      {/* ======================================
          TOP BAR
      ====================================== */}
      <header className="app-header">
        <NavLink to="/" className="app-brand" aria-label="NeuroWin — início">
          <span className="brand-mark brand-mark-logo">N</span>
          <span>
            <strong>NeuroWin</strong>
            <small>DADOS · INTELIGÊNCIA · RESULTADOS</small>
          </span>
        </NavLink>

        <div className="topbar-actions">
          <button type="button" className="topbar-icon" aria-label="Pesquisar">
            <SearchIcon />
          </button>
          <button type="button" className="topbar-icon topbar-bell" aria-label="Notificações">
            <BellIcon />
            <i />
          </button>
          <NavLink to={user ? "/perfil" : "/login"} className="topbar-profile" aria-label="Abrir perfil">
            <span>{initials}</span>
          </NavLink>
        </div>
      </header>

      {/* ======================================
          CONTEÚDO DA ROTA
      ====================================== */}
      <Outlet />

      {/* ======================================
          NAVEGAÇÃO INFERIOR
      ====================================== */}
      <nav className="bottom-nav" aria-label="Navegação principal">
        <NavLink to="/" end className={navClass}>
          <HomeIcon />
          <span>Início</span>
        </NavLink>

        <NavLink to="/sinais" className={navClass}>
          <SignalIcon />
          <span>Sinais</span>
        </NavLink>

        <NavLink
          to="/ia"
          className={({ isActive }) =>
            isActive ? "bottom-link ai-link active" : "bottom-link ai-link"
          }
        >
          <span className="ai-bubble">
            <BrainIcon />
          </span>
          <span>IA</span>
        </NavLink>

        <NavLink to="/desporto" className={navClass}>
          <TrophyIcon />
          <span>Desporto</span>
        </NavLink>

        <NavLink to="/perfil" className={navClass}>
          <UserIcon />
          <span>Perfil</span>
        </NavLink>
      </nav>
    </div>
  );
}

```

---

## `src/components/AgeGate.tsx`

```tsx
import { useState } from "react";

const KEY = "neurowin-age-confirmed";

export function AgeGate() {
  const [visible, setVisible] = useState(() => localStorage.getItem(KEY) !== "yes");
  if (!visible) return null;

  return (
    <div className="age-gate" role="dialog" aria-modal="true" aria-labelledby="age-title">
      <section className="age-card premium-card led-border">
        <div className="brand-mark large">N</div>
        <span className="eyebrow">ACESSO 18+</span>
        <h1 id="age-title">Confirma a tua idade</h1>
        <p>A NeuroWin inclui conteúdos relacionados com apostas. Utiliza a plataforma de forma responsável.</p>
        <button
          className="primary-button"
          onClick={() => {
            localStorage.setItem(KEY, "yes");
            setVisible(false);
          }}
        >
          Tenho 18 anos ou mais
        </button>
      </section>
    </div>
  );
}

```

---

## `src/components/AppErrorBoundary.tsx`

```tsx
import { Component, type ErrorInfo, type ReactNode } from "react";

export class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("NeuroWin UI error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="center-screen">
          <section className="error-panel premium-card">
            <span className="eyebrow">NEUROWIN</span>
            <h1>Ocorreu um erro na interface.</h1>
            <p>Recarrega a página. Se continuar, verifica o terminal do frontend.</p>
            <button className="primary-button" onClick={() => window.location.reload()}>Recarregar</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

```

---

## `src/pages/Home.tsx`

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_URL } from "../lib/api";
import {
  BrainIcon,
  ChartIcon,
  ChevronRightIcon,
  DatabaseIcon,
  ShieldIcon,
  SignalIcon,
  TrophyIcon,
  UserIcon,
} from "../components/Icons";

type Health = {
  ok: boolean;
  server: string;
  ai: boolean;
  aiModel?: string;
  sportsdb: boolean;
  timestamp: string;
};

export default function Home() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_URL}/api/health`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Backend indisponível.");
        return response.json() as Promise<Health>;
      })
      .then((data) => {
        if (!cancelled) setHealth(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const systemOnline = health?.server === "online";

  return (
    <main className="page page-home">
      {/* ======================================
          HERO
      ====================================== */}
      <section className="home-hero premium-card led-border hero-stadium">
        <div className="hero-copy">
          <span className="eyebrow">
            <i className={systemOnline ? "status-dot" : "status-dot muted"} />
            NEUROWIN ENGINE
          </span>

          <h1>
            Inteligência para decisões
            <span> mais informadas.</span>
          </h1>

          <p>
            Uma combinação de IA, estatística, gestão de risco e dados desportivos
            para uma análise mais profunda e decisões mais consistentes.
          </p>

          <div className="hero-facts" aria-label="Características da plataforma">
            <span><i /> Dados reais</span>
            <span><i /> Análise avançada</span>
            <span><i /> Gestão de risco</span>
          </div>
        </div>

        <div className="hero-visual" aria-hidden="true">
          <div className="hero-logo-cube">
            <span>N</span>
          </div>
          <div className="hero-rings" />
          <div className="hero-keywords">
            <span>ANÁLISE</span>
            <span>PROBABILIDADE</span>
            <span>VALOR</span>
            <span>RESULTADOS</span>
          </div>
        </div>
      </section>

      {/* ======================================
          ESTADO DO SISTEMA
      ====================================== */}
      <section className="status-strip home-status-strip">
        <article className="premium-card status-card status-card-featured">
          <span className="status-card-icon"><DatabaseIcon /></span>
          <div>
            <small>SISTEMA</small>
            <strong>{systemOnline ? "Online" : error ? "Offline" : "A verificar"}</strong>
            <em className={systemOnline ? "ok" : "muted"}>{systemOnline ? "Todos os serviços operacionais" : error || "A estabelecer ligação"}</em>
          </div>
          <i className={systemOnline ? "status-dot" : "status-dot muted"} />
        </article>

        <article className="premium-card status-card">
          <span className="status-card-icon"><BrainIcon /></span>
          <div>
            <small>NEUROWIN AI</small>
            <strong>{health?.ai ? "Ativa" : "Não configurada"}</strong>
            <em>{health?.aiModel || "Gemini"}</em>
          </div>
          <ChevronRightIcon />
        </article>

        <article className="premium-card status-card">
          <span className="status-card-icon"><TrophyIcon /></span>
          <div>
            <small>DESPORTO</small>
            <strong>{health?.sportsdb ? "TheSportsDB" : "Indisponível"}</strong>
            <em>{health?.sportsdb ? "Dados ligados ao backend" : "Verifica a configuração"}</em>
          </div>
          <ChevronRightIcon />
        </article>

        <article className="premium-card status-card">
          <span className="status-card-icon"><ShieldIcon /></span>
          <div>
            <small>SEGURANÇA</small>
            <strong>Protegida</strong>
            <em>Autenticação no backend</em>
          </div>
          <ChevronRightIcon />
        </article>
      </section>

      {/* ======================================
          MÓDULOS
      ====================================== */}
      <section className="section-heading home-section-heading">
        <div>
          <span className="eyebrow">MÓDULOS</span>
          <h2>Centro NeuroWin</h2>
        </div>
        <p>Tudo o que precisas, num só lugar.</p>
      </section>

      <section className="module-grid home-module-grid">
        <Link to="/sinais" className="module-card premium-card led-border">
          <span className="module-icon"><SignalIcon /></span>
          <div className="module-copy">
            <small>PROBABILIDADE · VALOR</small>
            <h3>Sinais</h3>
            <p>Leitura estruturada de padrões, frequências e contexto estatístico.</p>
          </div>
          <div className="module-art module-art-chart" aria-hidden="true">
            <ChartIcon />
          </div>
          <span className="module-arrow"><ChevronRightIcon /></span>
        </Link>

        <Link to="/ia" className="module-card premium-card led-border">
          <span className="module-icon"><BrainIcon /></span>
          <div className="module-copy">
            <small>MACHINE LEARNING · ANÁLISE</small>
            <h3>NeuroWin AI</h3>
            <p>Assistente para probabilidade, variância, gestão de banca e interpretação de dados.</p>
          </div>
          <div className="module-art module-art-brain" aria-hidden="true">
            <BrainIcon />
          </div>
          <span className="module-arrow"><ChevronRightIcon /></span>
        </Link>

        <Link to="/desporto" className="module-card premium-card led-border">
          <span className="module-icon"><TrophyIcon /></span>
          <div className="module-copy">
            <small>COMPETIÇÕES · RESULTADOS</small>
            <h3>Desporto</h3>
            <p>Jogos, resultados e estados live apresentados no teu horário local.</p>
          </div>
          <div className="module-art module-art-stadium" aria-hidden="true" />
          <span className="module-arrow"><ChevronRightIcon /></span>
        </Link>

        <Link to="/perfil" className="module-card premium-card led-border">
          <span className="module-icon"><UserIcon /></span>
          <div className="module-copy">
            <small>CONTA · PREFERÊNCIAS</small>
            <h3>Perfil</h3>
            <p>Identidade, preferências, atividade e acesso administrativo quando aplicável.</p>
          </div>
          <div className="module-art module-art-profile" aria-hidden="true">
            <UserIcon />
          </div>
          <span className="module-arrow"><ChevronRightIcon /></span>
        </Link>
      </section>

      {/* ======================================
          JOGO RESPONSÁVEL
      ====================================== */}
      <section className="responsible-banner premium-card">
        <ShieldIcon />
        <div>
          <strong>Jogo Responsável</strong>
          <p>
            Define os teus limites. A análise estatística não elimina o risco nem garante resultados futuros.
          </p>
        </div>
        <Link to="/jogo-responsavel">
          Saber mais <ChevronRightIcon />
        </Link>
      </section>
    </main>
  );
}

```

---

## `src/pages/Signals.tsx`

```tsx
import { ChartIcon, ChevronRightIcon, SignalIcon } from "../components/Icons";

const modules = [
  {
    title: "Bac Bo",
    image: "/assets/bac-bo.jpg",
    description: "Análise estatística de padrões, frequências e tendências com base em dados históricos do Bac Bo.",
  },
  {
    title: "Football Studio",
    image: "/assets/football-studio.jpg",
    description: "Análise de estatísticas, frequências e comportamentos com base em dados históricos do Football Studio.",
  },
  {
    title: "Lightning Roulette",
    image: "/assets/lightning-roulette.jpg",
    description: "Estudo estatístico de padrões, sequências e probabilidades com base em dados históricos.",
  },
  {
    title: "Chicken",
    image: "/assets/chicken.jpg",
    description: "Análise estatística de padrões, multiplicadores e tendências com base em dados históricos do jogo Chicken.",
  },
];

export default function Signals() {
  return (
    <main className="page signals-page">
      {/* ======================================
          HERO
      ====================================== */}
      <section className="signals-hero premium-card led-border hero-stadium">
        <div>
          <span className="eyebrow"><SignalIcon /> SINAIS</span>
          <h1>
            Análise <span>estatística</span>
          </h1>
          <p>
            Leitura de dados reais, com base em análise estatística, padrões históricos e informação disponível.
            Sem promessas de resultados.
          </p>
        </div>

        <div className="signals-hero-visual" aria-hidden="true">
          <div className="signals-chart-orb"><ChartIcon /></div>
          <div className="signals-bars">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>

        <span className="signals-ready quiet-pill">
          <i className="status-dot" /> Sistema pronto
        </span>
      </section>

      {/* ======================================
          MÓDULOS
      ====================================== */}
      <section className="signal-grid signal-grid-premium">
        {modules.map((item) => (
          <article key={item.title} className="signal-card premium-card led-border">
            <div className="signal-image">
              <img src={item.image} alt={item.title} />
              <span />
            </div>

            <div className="signal-copy">
              <small>MÓDULO</small>
              <h2>{item.title}</h2>
              <p>{item.description}</p>

              <div className="signal-state">
                <i className="status-dot muted" />
                Sem feed em tempo real configurado.
              </div>
            </div>

            <span className="signal-arrow" aria-hidden="true">
              <ChevronRightIcon />
            </span>
          </article>
        ))}
      </section>
    </main>
  );
}

```

---

## `src/pages/AI.tsx`

```tsx
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { API_URL } from "../lib/api";
import {
  BrainIcon,
  ChartIcon,
  ChevronRightIcon,
  SendIcon,
  ShieldIcon,
} from "../components/Icons";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type Health = {
  ai: boolean;
  aiModel?: string;
};

const HISTORY_KEY = "neurowin-ai-history-v3";

function readHistory(): Message[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function shortTitle(value: string) {
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return "Nova conversa";
  return text.length > 42 ? `${text.slice(0, 42)}…` : text;
}

export default function AI() {
  const [messages, setMessages] = useState<Message[]>(readHistory);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [health, setHealth] = useState<Health | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-80)));
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((response) => response.json())
      .then((data: Health) => setHealth(data))
      .catch(() => setHealth({ ai: false }));
  }, []);

  const currentTitle = useMemo(() => {
    const firstUserMessage = messages.find((message) => message.role === "user");
    return shortTitle(firstUserMessage?.content || "Nova conversa");
  }, [messages]);

  async function send(event: FormEvent) {
    event.preventDefault();

    const text = input.trim();
    if (!text || loading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-12).map(({ role, content }) => ({ role, content })),
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Falha ao contactar a NeuroWin AI.");
      }

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: String(data.reply || ""),
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível obter resposta.");
    } finally {
      setLoading(false);
    }
  }

  function newConversation() {
    setMessages([]);
    setError("");
    setInput("");
  }

  return (
    <main className="ai-page ai-page-premium">
      {/* ======================================
          SIDEBAR
      ====================================== */}
      <aside className="ai-sidebar">
        <div className="ai-side-brand">
          <span className="brand-mark brand-mark-logo">N</span>
          <div>
            <strong>NeuroWin AI</strong>
            <small>O teu assistente de análise</small>
          </div>
        </div>

        <button type="button" className="ai-new" onClick={newConversation}>
          <span>＋</span> Nova conversa
        </button>

        <div className="ai-sidebar-section">
          <span className="ai-sidebar-label">CONVERSA ATUAL</span>
          <div className="ai-conversation-card premium-card">
            <span className="ai-conversation-icon"><BrainIcon /></span>
            <div>
              <strong>{currentTitle}</strong>
              <small>{messages.length} mensagens</small>
            </div>
          </div>
        </div>

        <div className="ai-sidebar-section ai-sidebar-topics">
          <span className="ai-sidebar-label">ATALHOS</span>
          <button type="button" onClick={() => setInput("Explica-me variância em apostas desportivas de forma simples.")}>Variância</button>
          <button type="button" onClick={() => setInput("Como interpreto uma probabilidade implícita?")}>Probabilidade implícita</button>
          <button type="button" onClick={() => setInput("Ajuda-me a estruturar uma gestão de risco responsável.")}>Gestão de risco</button>
        </div>

        <div className="ai-sidebar-status premium-card">
          <i className={health?.ai ? "status-dot" : "status-dot muted"} />
          <div>
            <strong>{health?.ai ? "AI online" : "AI indisponível"}</strong>
            <small>{health?.aiModel || "Verifica GEMINI_API_KEY"}</small>
          </div>
        </div>
      </aside>

      {/* ======================================
          MAIN
      ====================================== */}
      <section className="ai-main">
        <header className="ai-header premium-card led-border hero-stadium">
          <div className="ai-header-copy">
            <span className="eyebrow">NEUROWIN AI</span>
            <div className="ai-title-row">
              <h1>Assistente de análise</h1>
              <span className={health?.ai ? "ai-online-badge online" : "ai-online-badge"}>
                <i /> {health?.ai ? "ONLINE" : "OFFLINE"}
              </span>
            </div>
            <p>
              O teu assistente com IA para análise estatística, probabilidade, variância e gestão de risco.
            </p>
          </div>

          <div className="ai-header-visual" aria-hidden="true">
            <div className="hero-logo-cube ai-cube"><BrainIcon /></div>
            <div className="hero-rings" />
          </div>
        </header>

        <div className="ai-thread">
          {/* ==================================
              WELCOME
          ================================== */}
          {messages.length === 0 && (
            <section className="ai-welcome premium-card led-border">
              <span className="ai-welcome-icon"><BrainIcon /></span>
              <h2>O que queres <span>analisar?</span></h2>
              <p>
                Pergunta sobre probabilidade, interpretação de dados, gestão de banca,
                variância, risco ou outro tema relacionado com análise desportiva.
              </p>

              <div className="ai-prompt-grid">
                <button type="button" onClick={() => setInput("Explica o impacto da variância nos meus resultados.")}>
                  <span className="prompt-icon"><ChartIcon /></span>
                  <div><strong>Variância</strong><small>Explica o impacto da variância nos meus resultados.</small></div>
                  <ChevronRightIcon />
                </button>

                <button type="button" onClick={() => setInput("Calcula e explica como interpretar probabilidades implícitas das odds.")}>
                  <span className="prompt-icon prompt-percent">%</span>
                  <div><strong>Probabilidade implícita</strong><small>Calcula e interpreta probabilidades das odds.</small></div>
                  <ChevronRightIcon />
                </button>

                <button type="button" onClick={() => setInput("Como devo gerir a minha banca de forma sustentável?")}>
                  <span className="prompt-icon"><ShieldIcon /></span>
                  <div><strong>Gestão de risco</strong><small>Como gerir a banca de forma responsável.</small></div>
                  <ChevronRightIcon />
                </button>
              </div>
            </section>
          )}

          {/* ==================================
              MENSAGENS
          ================================== */}
          {messages.map((message) => (
            <article key={message.id} className={`ai-message ${message.role}`}>
              <div className="ai-message-avatar">
                {message.role === "assistant" ? <BrainIcon /> : "TU"}
              </div>

              <div className="ai-message-body">
                <span>{message.role === "assistant" ? "NeuroWin AI" : "Tu"}</span>

                {message.role === "assistant" ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {message.content}
                  </ReactMarkdown>
                ) : (
                  <p>{message.content}</p>
                )}
              </div>
            </article>
          ))}

          {loading && (
            <article className="ai-message assistant">
              <div className="ai-message-avatar"><BrainIcon /></div>
              <div className="ai-message-body">
                <span>NeuroWin AI</span>
                <div className="typing"><i /><i /><i /></div>
              </div>
            </article>
          )}

          {error && <div className="form-error ai-error">{error}</div>}
          <div ref={endRef} />
        </div>

        {/* ======================================
            COMPOSER
        ====================================== */}
        <form className="ai-composer premium-card led-border" onSubmit={send}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Escreve a tua pergunta…"
            rows={1}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button
            className="ai-send"
            disabled={loading || !input.trim()}
            aria-label="Enviar"
          >
            <SendIcon />
          </button>
        </form>
      </section>
    </main>
  );
}

```

---

## `src/pages/Sports.tsx`

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarIcon,
  ChevronRightIcon,
  ClockIcon,
  DatabaseIcon,
  RefreshIcon,
  SearchIcon,
  ShieldIcon,
  TrophyIcon,
} from "../components/Icons";
import { API_URL } from "../lib/api";
import "./Sports.css";

type Team = {
  id: string | null;
  name: string;
  badge: string | null;
};

type SportsEvent = {
  id: string;
  event: string | null;
  leagueId: string | null;
  league: string | null;
  leagueBadge: string | null;
  sport: string | null;
  country: string | null;
  season: string | null;
  date: string | null;
  time: string | null;
  timestamp: string | null;
  status: string | null;
  progress: string | null;
  state: "scheduled" | "live" | "finished" | "cancelled" | string;
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number | null;
  awayScore: number | null;
  venue: string | null;
  city: string | null;
  round: string | null;
  poster: string | null;
  thumbnail: string | null;
  video: string | null;
};

type SportsResponse = {
  ok: boolean;
  provider?: string;
  plan?: string;
  source?: string;
  supported?: boolean;
  count?: number;
  cached?: boolean;
  fetchedAt?: string;
  message?: string;
  error?: string;
  events?: SportsEvent[];
};

type SportsStatus = {
  ok: boolean;
  provider?: string;
  configured?: boolean;
  plan?: string;
  v2Requested?: boolean;
  fetchedAt?: string;
};

type ViewFilter = "all" | "live" | "upcoming" | "finished";
type PickType = "1" | "X" | "2";

type BetSelection = {
  id: string;
  eventId: string;
  pick: PickType;
  label: string;
  match: string;
};

const COUNTRY_TRANSLATIONS: Record<string, string> = {
  Ukraine: "Ucrânia",
  Turkey: "Turquia",
  Croatia: "Croácia",
  Hungary: "Hungria",
  Germany: "Alemanha",
  Latvia: "Letónia",
  Spain: "Espanha",
  France: "França",
  Italy: "Itália",
  England: "Inglaterra",
  Portugal: "Portugal",
  Netherlands: "Países Baixos",
  Belgium: "Bélgica",
  Switzerland: "Suíça",
  Austria: "Áustria",
  Poland: "Polónia",
  Sweden: "Suécia",
  Norway: "Noruega",
  Denmark: "Dinamarca",
  Finland: "Finlândia",
  Greece: "Grécia",
  Romania: "Roménia",
  Serbia: "Sérvia",
  Slovenia: "Eslovénia",
  Slovakia: "Eslováquia",
  Scotland: "Escócia",
  Ireland: "Irlanda",
  Wales: "País de Gales",
  Brazil: "Brasil",
  Argentina: "Argentina",
  USA: "Estados Unidos",
  Mexico: "México",
  Japan: "Japão",
  China: "China",
};

const LEAGUE_TRANSLATIONS: Record<string, string> = {
  "UEFA European Under-21 Championship": "Europeu Sub-21 da UEFA",
  "UEFA Champions League": "Liga dos Campeões da UEFA",
  "UEFA Europa League": "Liga Europa da UEFA",
  "UEFA Conference League": "Liga Conferência da UEFA",
  "English Premier League": "Premier League",
  "Spanish La Liga": "La Liga",
  "Italian Serie A": "Serie A",
  "German Bundesliga": "Bundesliga",
  "French Ligue 1": "Ligue 1",
};

function getUserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Lisbon";
}

function shiftDate(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getDateKeyInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function eventUtcDate(event: SportsEvent) {
  if (event.timestamp) {
    const raw = event.timestamp.trim();
    const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
    const parsed = new Date(hasZone ? raw : `${raw}Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  if (event.date) {
    const time = event.time || "00:00:00";
    const parsed = new Date(`${event.date}T${time}Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function eventLocalDate(event: SportsEvent, timeZone: string) {
  const date = eventUtcDate(event);
  return date ? getDateKeyInTimeZone(date, timeZone) : event.date;
}

function formatEventTime(event: SportsEvent, timeZone: string) {
  const date = eventUtcDate(event);
  if (!date) return event.time?.slice(0, 5) || "—";

  return new Intl.DateTimeFormat("pt-PT", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateLong(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);

  return new Intl.DateTimeFormat("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function translateCountry(value: string | null) {
  if (!value) return "Internacional";
  return COUNTRY_TRANSLATIONS[value] || value;
}

function translateLeague(value: string | null) {
  if (!value) return "Competição por definir";

  return (
    LEAGUE_TRANSLATIONS[value] ||
    value
      .replace(/Under-21/gi, "Sub-21")
      .replace(/Women's/gi, "Feminino")
      .replace(/Women/gi, "Feminino")
  );
}

function translateTeamName(value: string) {
  let result = value;

  for (const [english, portuguese] of Object.entries(COUNTRY_TRANSLATIONS)) {
    if (result === english || result.startsWith(`${english} `)) {
      result = result.replace(english, portuguese);
      break;
    }
  }

  return result
    .replace(/\bU21\b/gi, "Sub-21")
    .replace(/Under-21/gi, "Sub-21")
    .replace(/Women's/gi, "Feminino")
    .replace(/Women/gi, "Feminino");
}

function teamInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

function stateLabel(event: SportsEvent) {
  if (event.state === "live") {
    return event.progress ? `AO VIVO · ${event.progress}` : "AO VIVO";
  }
  if (event.state === "finished") return "TERMINADO";
  if (event.state === "cancelled") return "CANCELADO";
  return "AGENDADO";
}

function priority(state: string) {
  if (state === "live") return 0;
  if (state === "scheduled") return 1;
  if (state === "finished") return 2;
  return 3;
}

function formatUpdate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export default function Sports() {
  const userTimeZone = useMemo(getUserTimeZone, []);
  const today = useMemo(
    () => getDateKeyInTimeZone(new Date(), userTimeZone),
    [userTimeZone]
  );

  const [selectedDate, setSelectedDate] = useState(today);
  const [events, setEvents] = useState<SportsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [league, setLeague] = useState("all");
  const [view, setView] = useState<ViewFilter>("all");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const [liveSupported, setLiveSupported] = useState<boolean | null>(null);
  const [status, setStatus] = useState<SportsStatus | null>(null);
  const [selections, setSelections] = useState<BetSelection[]>([]);

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/sportsdb/status`);
      const data = (await response.json()) as SportsStatus;
      if (response.ok && data.ok) setStatus(data);
    } catch {
      setStatus(null);
    }
  }, []);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError("");

      try {
        const apiDates = [
          shiftDate(selectedDate, -1),
          selectedDate,
          shiftDate(selectedDate, 1),
        ];

        const dayRequests = apiDates.map(async (date) => {
          const response = await fetch(
            `${API_URL}/api/sportsdb/day?date=${encodeURIComponent(date)}`
          );
          const data = (await response.json()) as SportsResponse;

          if (!response.ok || !data.ok) {
            throw new Error(data.error || "Falha ao carregar jogos.");
          }

          return data;
        });

        const requests: Promise<SportsResponse>[] = [...dayRequests];

        if (selectedDate === today) {
          requests.push(
            fetch(`${API_URL}/api/sportsdb/live`).then(async (response) => {
              const data = (await response.json()) as SportsResponse;

              if (!response.ok || !data.ok) {
                return {
                  ok: true,
                  events: [],
                  supported: false,
                  message: data.error || "Livescores indisponíveis.",
                };
              }

              return data;
            })
          );
        }

        const results = await Promise.all(requests);
        const merged = new Map<string, SportsEvent>();

        results.forEach((result) => {
          (result.events || []).forEach((event) => {
            const previous = merged.get(event.id);
            if (!previous || event.state === "live") {
              merged.set(event.id, { ...previous, ...event });
            }
          });
        });

        const local = Array.from(merged.values())
          .filter((event) => {
            const localDate = eventLocalDate(event, userTimeZone);
            if (event.state === "live" && selectedDate === today && !localDate) {
              return true;
            }
            return localDate === selectedDate;
          })
          .sort((a, b) => {
            const stateDifference = priority(a.state) - priority(b.state);
            if (stateDifference) return stateDifference;
            return (
              (eventUtcDate(a)?.getTime() || 0) -
              (eventUtcDate(b)?.getTime() || 0)
            );
          });

        setEvents(local);

        const fetchedTimes = results
          .map((item) => item.fetchedAt)
          .filter((value): value is string => Boolean(value))
          .sort();

        setUpdatedAt(
          fetchedTimes[fetchedTimes.length - 1] || new Date().toISOString()
        );

        const liveResult =
          selectedDate === today ? results[results.length - 1] : null;

        setLiveMessage(liveResult?.message || "");
        setLiveSupported(
          selectedDate === today
            ? Boolean(liveResult?.supported)
            : null
        );
      } catch (err) {
        setEvents([]);
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar os jogos."
        );
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [selectedDate, today, userTimeZone]
  );

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (selectedDate !== today) return;

    const timer = window.setInterval(() => {
      load(true);
    }, 30000);

    return () => window.clearInterval(timer);
  }, [load, selectedDate, today]);

  const leagues = useMemo(
    () =>
      Array.from(
        new Set(events.map((event) => translateLeague(event.league)))
      ).sort((a, b) => a.localeCompare(b, "pt-PT")),
    [events]
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return events.filter((event) => {
      if (view === "live" && event.state !== "live") return false;
      if (view === "upcoming" && event.state !== "scheduled") return false;
      if (view === "finished" && event.state !== "finished") return false;

      const translatedLeague = translateLeague(event.league);
      if (league !== "all" && translatedLeague !== league) return false;
      if (!needle) return true;

      const text = [
        translateTeamName(event.homeTeam.name),
        translateTeamName(event.awayTeam.name),
        translatedLeague,
        translateCountry(event.country),
      ]
        .join(" ")
        .toLowerCase();

      return text.includes(needle);
    });
  }, [events, league, search, view]);

  const counts = useMemo(
    () => ({
      live: events.filter((event) => event.state === "live").length,
      scheduled: events.filter((event) => event.state === "scheduled").length,
      finished: events.filter((event) => event.state === "finished").length,
    }),
    [events]
  );

  function toggleSelection(event: SportsEvent, pick: PickType) {
    const labels: Record<PickType, string> = {
      "1": "Casa",
      X: "Empate",
      "2": "Fora",
    };

    const id = `${event.id}:${pick}`;

    setSelections((current) => {
      const same = current.find((selection) => selection.id === id);
      if (same) {
        return current.filter((selection) => selection.id !== id);
      }

      const withoutMatch = current.filter(
        (selection) => selection.eventId !== event.id
      );

      return [
        ...withoutMatch,
        {
          id,
          eventId: event.id,
          pick,
          label: labels[pick],
          match: `${translateTeamName(event.homeTeam.name)} vs ${translateTeamName(event.awayTeam.name)}`,
        },
      ];
    });
  }

  return (
    <main className="sb-page">
      <div className="sb-background" aria-hidden="true" />
      <div className="sb-background-overlay" aria-hidden="true" />

      <div className="sb-content">
        {/* ======================================
            HERO
        ====================================== */}
        <section className="sb-hero led-sports">
          <div className="sb-hero-copy">
            <span className="sb-kicker"><TrophyIcon /> DESPORTO</span>
            <h1>Apostas <span>Desportivas</span></h1>
            <p>Jogos, resultados e estados live no teu horário local.</p>
            <small>
              Dados reais da TheSportsDB. As odds não são inventadas nem simuladas.
            </small>
          </div>

          <div className="sb-hero-right">
            <div className="sb-hero-stat">
              <CalendarIcon />
              <div><strong>{events.length}</strong><span>Eventos</span><small>NA DATA</small></div>
            </div>

            <div className="sb-hero-stat">
              <span className="sb-live-icon">●</span>
              <div><strong>{counts.live}</strong><span>Ao vivo</span><small>{liveSupported ? "FEED V2" : "FEED DISPONÍVEL"}</small></div>
            </div>

            <div className="sb-hero-stat">
              <DatabaseIcon />
              <div><strong>TheSportsDB</strong><span>Provider</span><small>{status?.plan || "A verificar"}</small></div>
            </div>
          </div>
        </section>

        {/* ======================================
            STATUS
        ====================================== */}
        <section className="sb-status-grid">
          <article className="led-sports"><span className="sb-status-icon"><DatabaseIcon /></span><div><small>SISTEMA</small><strong>{status?.configured ? "Online" : "A verificar"}</strong><em><i className={status?.configured ? "sb-dot" : "sb-dot muted"} /> {status?.configured ? "API configurada" : "Sem confirmação"}</em></div><ChevronRightIcon /></article>
          <article className="led-sports"><span className="sb-status-icon"><CalendarIcon /></span><div><small>AGENDADOS</small><strong>{counts.scheduled}</strong><em>Na data selecionada</em></div><ChevronRightIcon /></article>
          <article className="led-sports"><span className="sb-status-icon"><TrophyIcon /></span><div><small>TERMINADOS</small><strong>{counts.finished}</strong><em>Na data selecionada</em></div><ChevronRightIcon /></article>
          <article className="led-sports"><span className="sb-status-icon"><RefreshIcon /></span><div><small>ATUALIZADO</small><strong>{formatUpdate(updatedAt)}</strong><em>Auto-refresh 30 s</em></div><ChevronRightIcon /></article>
        </section>

        {/* ======================================
            FILTROS
        ====================================== */}
        <section className="sb-toolbar">
          <label className="sb-search">
            <SearchIcon />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar equipas, competições ou jogos…"
            />
          </label>

          <select
            value={league}
            onChange={(event) => setLeague(event.target.value)}
            aria-label="Filtrar competição"
          >
            <option value="all">Todas as competições</option>
            {leagues.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>

          <div className="sb-date-tabs">
            {[
              { label: "Ontem", date: shiftDate(today, -1) },
              { label: "Hoje", date: today },
              { label: "Amanhã", date: shiftDate(today, 1) },
            ].map((item) => (
              <button
                type="button"
                key={item.date}
                className={selectedDate === item.date ? "active" : ""}
                onClick={() => {
                  setSelectedDate(item.date);
                  setLeague("all");
                  setView("all");
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="sb-refresh"
            onClick={() => load()}
            disabled={loading}
          >
            <RefreshIcon /> Atualizar
          </button>
        </section>

        <div className="sb-subtoolbar">
          <div className="sb-view-tabs">
            {(
              [
                ["all", `Todos (${events.length})`],
                ["live", `Ao vivo (${counts.live})`],
                ["upcoming", `Próximos (${counts.scheduled})`],
                ["finished", `Resultados (${counts.finished})`],
              ] as [ViewFilter, string][]
            ).map(([key, label]) => (
              <button
                type="button"
                key={key}
                className={view === key ? "active" : ""}
                onClick={() => setView(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <span className="sb-local-time"><ClockIcon /> {formatDateLong(selectedDate)} · {userTimeZone}</span>
        </div>

        {error && (
          <div className="sb-error">
            <div><strong>Não foi possível carregar os jogos.</strong><span>{error}</span></div>
            <button type="button" onClick={() => load()}>Tentar novamente</button>
          </div>
        )}

        {liveMessage && selectedDate === today && (
          <div className="sb-live-note">
            <ShieldIcon />
            <span>{liveMessage}</span>
          </div>
        )}

        {/* ======================================
            EVENTOS + BOLETIM
        ====================================== */}
        <div className="sb-layout">
          <section className="sb-events">
            <header className="sb-section-head">
              <div><span>JOGOS</span><h2>Jogos disponíveis</h2></div>
              <strong>{filtered.length} jogos</strong>
            </header>

            {loading ? (
              <div className="sb-loading"><div className="sb-loader" /><span>A carregar eventos…</span></div>
            ) : filtered.length === 0 ? (
              <div className="sb-empty"><span>◇</span><strong>Sem jogos disponíveis</strong><p>Não existem eventos para este filtro no teu fuso horário.</p></div>
            ) : (
              <div className="sb-match-list">
                {filtered.map((event) => {
                  const home = translateTeamName(event.homeTeam.name);
                  const away = translateTeamName(event.awayTeam.name);
                  const hasScore =
                    event.homeScore !== null && event.awayScore !== null;
                  const closed =
                    event.state === "finished" || event.state === "cancelled";

                  return (
                    <article
                      className={`sb-match-row led-sports ${event.state === "live" ? "is-live" : ""}`}
                      key={event.id}
                    >
                      <div className="sb-match-meta">
                        <span>{translateCountry(event.country)}</span>
                        <strong>{translateLeague(event.league)}</strong>
                        <small>{event.round ? `Jornada ${event.round}` : event.venue || "Evento"}</small>
                      </div>

                      <div className="sb-match-teams">
                        <div className="sb-match-team">
                          <div className="sb-team-logo">
                            {event.homeTeam.badge ? (
                              <img src={event.homeTeam.badge} alt="" />
                            ) : (
                              teamInitials(home)
                            )}
                          </div>
                          <strong>{home}</strong>
                        </div>

                        <div className={`sb-match-time ${event.state}`}>
                          {event.state === "live" && <span className="sb-live-label"><i /> AO VIVO</span>}
                          {hasScore ? (
                            <div className="sb-score-numbers">
                              <strong>{event.homeScore}</strong><span>:</span><strong>{event.awayScore}</strong>
                            </div>
                          ) : (
                            <strong>{formatEventTime(event, userTimeZone)}</strong>
                          )}
                          <small>{stateLabel(event)}</small>
                        </div>

                        <div className="sb-match-team">
                          <div className="sb-team-logo">
                            {event.awayTeam.badge ? (
                              <img src={event.awayTeam.badge} alt="" />
                            ) : (
                              teamInitials(away)
                            )}
                          </div>
                          <strong>{away}</strong>
                        </div>
                      </div>

                      <div className="sb-inline-market">
                        {(["1", "X", "2"] as PickType[]).map((pick) => {
                          const selected = selections.some(
                            (selection) =>
                              selection.eventId === event.id &&
                              selection.pick === pick
                          );

                          return (
                            <button
                              type="button"
                              key={pick}
                              disabled={closed}
                              className={selected ? "selected" : ""}
                              onClick={() => toggleSelection(event, pick)}
                              title="O feed atual não fornece odds reais"
                            >
                              <span>{pick}</span>
                              <strong>—</strong>
                            </button>
                          );
                        })}
                      </div>

                      <button type="button" className="sb-match-more" aria-label="Detalhes do jogo">
                        <ChevronRightIcon />
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="sb-betslip led-sports">
            <header className="sb-betslip-head">
              <div><span>BOLETIM</span><h2>A tua seleção</h2></div>
              <strong>{selections.length}</strong>
            </header>

            {selections.length === 0 ? (
              <div className="sb-betslip-empty">
                <span>＋</span>
                <strong>Nenhuma seleção adicionada</strong>
                <p>Seleciona 1, X ou 2 num dos jogos para adicionar ao boletim.</p>
              </div>
            ) : (
              <div className="sb-bet-list">
                {selections.map((selection) => (
                  <article key={selection.id} className="sb-bet">
                    <button
                      type="button"
                      onClick={() =>
                        setSelections((current) =>
                          current.filter((item) => item.id !== selection.id)
                        )
                      }
                    >
                      ×
                    </button>
                    <span>1X2 · {selection.label}</span>
                    <strong>{selection.match}</strong>
                    <small>Odd: não fornecida pelo feed</small>
                  </article>
                ))}
              </div>
            )}

            <div className="sb-betslip-summary">
              <div><span>Seleções</span><strong>{selections.length}</strong></div>
              <div><span>Odd total</span><strong>—</strong></div>
            </div>

            <div className="sb-odds-warning">
              A TheSportsDB não fornece odds neste feed. A NeuroWin não inventa valores e a confirmação de aposta permanece desativada.
            </div>

            <button type="button" className="sb-place-bet" disabled>
              Fazer aposta
            </button>

            {selections.length > 0 && (
              <button type="button" className="sb-clear" onClick={() => setSelections([])}>
                Limpar seleção
              </button>
            )}

            <footer className="sb-responsible">
              <ShieldIcon />
              <span><strong>18+ · Joga de forma responsável</strong><small>A informação não garante resultados futuros.</small></span>
            </footer>
          </aside>
        </div>
      </div>
    </main>
  );
}

```

---

## `src/pages/Sports.css`

```css
/* ==========================================
   NEUROWIN — SPORTS
   Ficheiro: src/pages/Sports.css

   01. Página e fundo
   02. Efeito LED
   03. Hero
   04. Estado do sistema
   05. Filtros
   06. Navegação dos eventos
   07. Mensagens / estados
   08. Layout principal
   09. Lista de jogos
   10. Mercado 1X2
   11. Boletim
   12. Responsividade
========================================== */


/* ==========================================
   01. PÁGINA E FUNDO
========================================== */

.sb-page {
  position: relative;
  min-height: 100vh;
  isolation: isolate;
  overflow: hidden;
  padding-bottom: 92px;
  background: #020711;
}

.sb-background,
.sb-background-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
}

.sb-background {
  z-index: -3;
  background-image: url("/assets/neuro-win-sports-bg.png");
  background-position: center top;
  background-size: cover;
  filter: saturate(.72) brightness(.42) contrast(1.08);
  transform: scale(1.02);
}

.sb-background-overlay {
  z-index: -2;
  background:
    linear-gradient(180deg, rgba(1, 6, 13, .48) 0%, rgba(2, 8, 17, .82) 42%, #020711 92%),
    radial-gradient(circle at 74% 12%, rgba(28, 154, 255, .13), transparent 30%),
    linear-gradient(90deg, rgba(1, 7, 15, .88) 0%, rgba(1, 8, 18, .54) 56%, rgba(1, 7, 15, .82) 100%);
}

.sb-content {
  width: min(1540px, calc(100% - 42px));
  margin: 0 auto;
  padding: 16px 0 42px;
}


/* ==========================================
   02. EFEITO LED SPORTS
========================================== */

.led-sports {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  border: 1px solid rgba(74, 178, 235, .22);
  background: linear-gradient(145deg, rgba(5, 20, 35, .88), rgba(3, 12, 24, .94));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, .025),
    0 14px 44px rgba(0, 0, 0, .18);
}

.led-sports::before {
  content: "";
  position: absolute;
  inset: -1px;
  z-index: 1;
  border-radius: inherit;
  padding: 1px;
  pointer-events: none;
  background: conic-gradient(
    from var(--led-angle, 0deg),
    transparent 0deg,
    transparent 320deg,
    rgba(62, 199, 255, .18) 332deg,
    rgba(111, 223, 255, .95) 345deg,
    #eafaff 352deg,
    transparent 360deg
  );
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  filter: drop-shadow(0 0 7px rgba(77, 200, 255, .22));
  animation: led-run 8s linear infinite;
}

.led-sports > * {
  position: relative;
  z-index: 2;
}


/* ==========================================
   03. HERO
========================================== */

.sb-hero {
  min-height: 244px;
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(420px, .8fr);
  align-items: center;
  gap: 34px;
  border-radius: 23px;
  padding: 32px 34px;
  background:
    linear-gradient(90deg, rgba(2, 12, 26, .94), rgba(3, 18, 35, .55) 55%, rgba(3, 15, 29, .74)),
    url("/assets/neuro-win-sports-bg.png") center 44% / cover no-repeat;
}

.sb-hero::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(circle at 68% 55%, rgba(27, 163, 249, .18), transparent 24%),
    linear-gradient(90deg, rgba(2, 10, 22, .9), transparent 68%);
  pointer-events: none;
}

.sb-hero-copy {
  max-width: 760px;
}

.sb-kicker {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  border: 1px solid rgba(79, 197, 249, .22);
  border-radius: 999px;
  background: rgba(23, 107, 155, .12);
  padding: 7px 12px;
  color: #83dcff;
  font-size: 10px;
  font-weight: 760;
  letter-spacing: .16em;
}

.sb-kicker svg {
  width: 15px;
}

.sb-hero h1 {
  margin: 14px 0 0;
  color: #f4f8fa;
  font-size: clamp(38px, 4.5vw, 64px);
  font-weight: 620;
  letter-spacing: -.045em;
  line-height: .98;
}

.sb-hero h1 span {
  color: #3fd3fb;
}

.sb-hero p {
  margin: 15px 0 0;
  color: #b6c5ce;
  font-size: 17px;
  line-height: 1.45;
}

.sb-hero-copy > small {
  display: block;
  max-width: 720px;
  margin-top: 9px;
  color: #708592;
  font-size: 11px;
  line-height: 1.55;
}

.sb-hero-right {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  align-self: end;
}

.sb-hero-stat {
  min-height: 102px;
  display: grid;
  grid-template-columns: 42px 1fr;
  align-items: center;
  gap: 11px;
  border: 1px solid rgba(72, 178, 231, .2);
  border-radius: 15px;
  background: rgba(3, 18, 34, .78);
  padding: 13px;
  backdrop-filter: blur(14px);
}

.sb-hero-stat > svg,
.sb-live-icon {
  width: 36px;
  color: #45cbfb;
}

.sb-live-icon {
  display: grid;
  place-items: center;
  height: 36px;
  font-size: 20px;
  color: #36efaa;
  text-shadow: 0 0 14px rgba(54, 239, 170, .72);
}

.sb-hero-stat div {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.sb-hero-stat strong {
  overflow: hidden;
  color: #f0f5f7;
  font-size: 20px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sb-hero-stat span {
  color: #a7bac5;
  font-size: 10px;
}

.sb-hero-stat small {
  color: #5f7c8d;
  font-size: 7px;
  letter-spacing: .13em;
  text-transform: uppercase;
}


/* ==========================================
   04. ESTADO DO SISTEMA
========================================== */

.sb-status-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.sb-status-grid article {
  min-height: 88px;
  display: grid;
  grid-template-columns: 42px 1fr 16px;
  align-items: center;
  gap: 10px;
  border-radius: 15px;
  padding: 13px 15px;
}

.sb-status-grid article > svg {
  width: 16px;
  color: #54cfff;
}

.sb-status-icon {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border: 1px solid rgba(82, 196, 245, .14);
  border-radius: 11px;
  background: rgba(23, 104, 149, .12);
  color: #56d0ff;
}

.sb-status-icon svg {
  width: 19px;
}

.sb-status-grid article div {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.sb-status-grid small {
  color: #60798a;
  font-size: 8px;
  letter-spacing: .12em;
}

.sb-status-grid strong {
  color: #e4edf1;
  font-size: 14px;
  font-weight: 600;
}

.sb-status-grid em {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #647f90;
  font-size: 8px;
  font-style: normal;
}

.sb-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #3ee7aa;
  box-shadow: 0 0 9px rgba(62, 231, 170, .7);
}

.sb-dot.muted {
  background: #60727e;
  box-shadow: none;
}


/* ==========================================
   05. FILTROS
========================================== */

.sb-toolbar {
  display: grid;
  grid-template-columns: minmax(300px, 1.2fr) minmax(220px, .7fr) auto auto;
  gap: 10px;
  margin-top: 14px;
}

.sb-search,
.sb-toolbar select,
.sb-refresh,
.sb-date-tabs {
  min-height: 50px;
  border: 1px solid rgba(91, 180, 225, .18);
  border-radius: 13px;
  background: rgba(2, 13, 25, .86);
}

.sb-search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 15px;
}

.sb-search svg {
  width: 21px;
  color: #57caf8;
}

.sb-search input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: #d8e3e8;
  font-size: 12px;
}

.sb-search input::placeholder {
  color: #607686;
}

.sb-toolbar select {
  outline: 0;
  padding: 0 13px;
  color: #c0ced5;
  font-size: 11px;
}

.sb-date-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(74px, 1fr));
  overflow: hidden;
  padding: 4px;
}

.sb-date-tabs button {
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #8497a3;
  font-size: 10px;
  cursor: pointer;
}

.sb-date-tabs button.active {
  background: linear-gradient(135deg, #067eff, #25d2ff);
  color: #fff;
  box-shadow: 0 0 18px rgba(26, 169, 255, .28);
}

.sb-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 14px;
  color: #91a7b4;
  font-size: 10px;
  cursor: pointer;
}

.sb-refresh svg {
  width: 16px;
}

.sb-refresh:disabled {
  opacity: .55;
  cursor: wait;
}


/* ==========================================
   06. NAVEGAÇÃO DOS EVENTOS
========================================== */

.sb-subtoolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 12px;
}

.sb-view-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.sb-view-tabs button {
  min-height: 40px;
  border: 1px solid rgba(71, 156, 202, .17);
  border-radius: 12px;
  background: rgba(4, 16, 29, .75);
  padding: 0 16px;
  color: #77909f;
  font-size: 9px;
  cursor: pointer;
}

.sb-view-tabs button.active {
  border-color: rgba(51, 197, 255, .48);
  color: #b8ecff;
  background: rgba(15, 102, 154, .16);
  box-shadow: inset 0 0 18px rgba(39, 176, 238, .08);
}

.sb-local-time {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #5f7584;
  font-size: 8px;
  letter-spacing: .05em;
}

.sb-local-time svg {
  width: 14px;
}


/* ==========================================
   07. MENSAGENS / ESTADOS
========================================== */

.sb-error,
.sb-live-note {
  margin-top: 12px;
  border-radius: 13px;
  padding: 12px 14px;
}

.sb-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  border: 1px solid rgba(255, 99, 111, .18);
  background: rgba(105, 21, 31, .14);
}

.sb-error div {
  display: grid;
  gap: 2px;
}

.sb-error strong {
  color: #ffabb2;
  font-size: 10px;
}

.sb-error span {
  color: #9b6d75;
  font-size: 8px;
}

.sb-error button {
  border: 1px solid rgba(255, 113, 123, .22);
  border-radius: 9px;
  background: transparent;
  padding: 7px 10px;
  color: #f39aa1;
  font-size: 8px;
  cursor: pointer;
}

.sb-live-note {
  display: flex;
  align-items: center;
  gap: 9px;
  border: 1px solid rgba(71, 177, 229, .13);
  background: rgba(14, 76, 106, .1);
  color: #7e99a8;
  font-size: 8px;
}

.sb-live-note svg {
  width: 17px;
  color: #50c9f7;
}


/* ==========================================
   08. LAYOUT PRINCIPAL
========================================== */

.sb-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 14px;
  margin-top: 14px;
}

.sb-events {
  min-width: 0;
}

.sb-section-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 14px;
  margin: 0 2px 9px;
}

.sb-section-head span {
  color: #57cdf9;
  font-size: 7px;
  letter-spacing: .15em;
}

.sb-section-head h2 {
  margin: 4px 0 0;
  color: #edf4f7;
  font-size: 20px;
  font-weight: 570;
}

.sb-section-head > strong {
  color: #657b8a;
  font-size: 8px;
  font-weight: 500;
}

.sb-loading,
.sb-empty {
  min-height: 280px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  border: 1px solid rgba(79, 165, 208, .12);
  border-radius: 17px;
  background: rgba(4, 15, 28, .72);
  color: #6b8190;
  text-align: center;
}

.sb-loader {
  width: 30px;
  height: 30px;
  border: 2px solid rgba(75, 190, 240, .18);
  border-top-color: #5bd3ff;
  border-radius: 50%;
  animation: sb-spin .8s linear infinite;
}

@keyframes sb-spin {
  to { transform: rotate(360deg); }
}

.sb-empty > span {
  color: #4fbedf;
  font-size: 38px;
}

.sb-empty strong {
  color: #aebdc5;
  font-size: 13px;
}

.sb-empty p {
  margin: 0;
  font-size: 9px;
}


/* ==========================================
   09. LISTA DE JOGOS
========================================== */

.sb-match-list {
  display: grid;
  gap: 10px;
}

.sb-match-row {
  display: grid;
  grid-template-columns: minmax(150px, .75fr) minmax(360px, 1.4fr) 246px 34px;
  align-items: center;
  gap: 12px;
  min-height: 112px;
  border-radius: 16px;
  padding: 12px 13px;
}

.sb-match-row.is-live {
  border-color: rgba(57, 234, 167, .27);
  box-shadow:
    inset 3px 0 0 rgba(57, 234, 167, .66),
    0 14px 40px rgba(0, 0, 0, .16);
}

.sb-match-meta {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.sb-match-meta span {
  color: #60798a;
  font-size: 7px;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.sb-match-meta strong {
  overflow: hidden;
  color: #b4c5ce;
  font-size: 10px;
  font-weight: 560;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sb-match-meta small {
  color: #5a6f7c;
  font-size: 8px;
}

.sb-match-teams {
  display: grid;
  grid-template-columns: 1fr 88px 1fr;
  align-items: center;
  gap: 8px;
}

.sb-match-team {
  min-width: 0;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
}

.sb-match-team:last-child {
  grid-template-columns: minmax(0, 1fr) 38px;
  text-align: right;
}

.sb-match-team:last-child .sb-team-logo {
  grid-column: 2;
  grid-row: 1;
}

.sb-match-team strong {
  overflow: hidden;
  color: #d9e4e9;
  font-size: 11px;
  font-weight: 580;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sb-team-logo {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  overflow: hidden;
  border: 1px solid rgba(83, 178, 224, .16);
  border-radius: 11px;
  background: rgba(255, 255, 255, .03);
  color: #70d2f7;
  font-size: 9px;
  font-weight: 700;
}

.sb-team-logo img {
  width: 30px;
  height: 30px;
  object-fit: contain;
}

.sb-match-time {
  display: grid;
  justify-items: center;
  gap: 3px;
  color: #cbd8df;
  text-align: center;
}

.sb-match-time > strong,
.sb-score-numbers strong {
  font-size: 17px;
  font-weight: 670;
}

.sb-match-time > small {
  color: #657a88;
  font-size: 7px;
}

.sb-live-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #4ce8ad;
  font-size: 7px;
  font-weight: 700;
  letter-spacing: .08em;
}

.sb-live-label i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #48efaf;
  box-shadow: 0 0 10px rgba(72, 239, 175, .85);
}

.sb-score-numbers {
  display: flex;
  align-items: center;
  gap: 5px;
}

.sb-score-numbers span {
  color: #5e7686;
}

.sb-match-more {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid rgba(69, 175, 225, .14);
  border-radius: 9px;
  background: rgba(25, 98, 133, .1);
  color: #61cff8;
  cursor: pointer;
}

.sb-match-more svg {
  width: 14px;
}


/* ==========================================
   10. MERCADO 1X2
========================================== */

.sb-inline-market {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 7px;
}

.sb-inline-market button {
  min-height: 58px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 3px;
  border: 1px solid rgba(80, 164, 207, .17);
  border-radius: 10px;
  background: rgba(7, 30, 51, .6);
  color: #78909f;
  cursor: pointer;
  transition: border-color .18s ease, background .18s ease, transform .18s ease;
}

.sb-inline-market button:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(76, 201, 250, .36);
}

.sb-inline-market button.selected {
  border-color: rgba(55, 205, 255, .55);
  background: linear-gradient(145deg, rgba(5, 112, 180, .35), rgba(9, 57, 91, .5));
  color: #d6f5ff;
  box-shadow: inset 0 0 18px rgba(39, 190, 246, .08);
}

.sb-inline-market button:disabled {
  opacity: .42;
  cursor: default;
}

.sb-inline-market span {
  font-size: 9px;
}

.sb-inline-market strong {
  color: #61d2fb;
  font-size: 14px;
}


/* ==========================================
   11. BOLETIM
========================================== */

.sb-betslip {
  align-self: start;
  position: sticky;
  top: 84px;
  border-radius: 17px;
  padding: 15px;
}

.sb-betslip-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, .055);
}

.sb-betslip-head span {
  color: #53c8f4;
  font-size: 7px;
  letter-spacing: .14em;
}

.sb-betslip-head h2 {
  margin: 3px 0 0;
  color: #e4edf1;
  font-size: 18px;
  font-weight: 570;
}

.sb-betslip-head > strong {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid rgba(79, 180, 228, .17);
  border-radius: 9px;
  color: #5bcaf6;
  font-size: 10px;
}

.sb-betslip-empty {
  min-height: 220px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  padding: 18px;
  color: #647987;
  text-align: center;
}

.sb-betslip-empty > span {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border: 1px dashed rgba(85, 183, 229, .28);
  border-radius: 14px;
  color: #59c8f2;
  font-size: 24px;
}

.sb-betslip-empty strong {
  color: #9fb1bb;
  font-size: 11px;
}

.sb-betslip-empty p {
  max-width: 240px;
  margin: 0;
  font-size: 8px;
  line-height: 1.5;
}

.sb-bet-list {
  display: grid;
  gap: 7px;
  margin-top: 10px;
}

.sb-bet {
  position: relative;
  display: grid;
  gap: 3px;
  border: 1px solid rgba(255, 255, 255, .055);
  border-radius: 10px;
  background: rgba(255, 255, 255, .018);
  padding: 10px 28px 10px 10px;
}

.sb-bet > button {
  position: absolute;
  top: 7px;
  right: 7px;
  border: 0;
  background: transparent;
  color: #738997;
  cursor: pointer;
}

.sb-bet span,
.sb-bet small {
  color: #617887;
  font-size: 7px;
}

.sb-bet strong {
  color: #b4c4cc;
  font-size: 9px;
  font-weight: 560;
}

.sb-betslip-summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, .055);
  padding-top: 12px;
}

.sb-betslip-summary div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid rgba(255, 255, 255, .045);
  border-radius: 9px;
  padding: 9px;
}

.sb-betslip-summary span {
  color: #657b89;
  font-size: 8px;
}

.sb-betslip-summary strong {
  color: #d4e0e5;
  font-size: 10px;
}

.sb-odds-warning {
  margin-top: 10px;
  border: 1px solid rgba(221, 181, 90, .15);
  border-radius: 10px;
  background: rgba(113, 82, 20, .08);
  padding: 9px;
  color: #9b895f;
  font-size: 7.5px;
  line-height: 1.55;
}

.sb-place-bet,
.sb-clear {
  width: 100%;
  min-height: 42px;
  margin-top: 9px;
  border-radius: 10px;
  font-size: 9px;
}

.sb-place-bet {
  border: 1px solid rgba(73, 173, 221, .13);
  background: rgba(54, 130, 166, .08);
  color: #547180;
}

.sb-place-bet:disabled {
  cursor: not-allowed;
}

.sb-clear {
  border: 1px solid rgba(255, 255, 255, .055);
  background: transparent;
  color: #768a96;
  cursor: pointer;
}

.sb-responsible {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, .05);
  padding-top: 11px;
}

.sb-responsible svg {
  width: 18px;
  color: #5bcaf5;
}

.sb-responsible span {
  display: grid;
  gap: 2px;
}

.sb-responsible strong {
  color: #8fa2ad;
  font-size: 8px;
}

.sb-responsible small {
  color: #5e727f;
  font-size: 7px;
}


/* ==========================================
   12. RESPONSIVIDADE
========================================== */

@media (max-width: 1250px) {
  .sb-hero {
    grid-template-columns: 1fr;
  }

  .sb-hero-right {
    width: min(720px, 100%);
  }

  .sb-toolbar {
    grid-template-columns: 1fr 1fr;
  }

  .sb-layout {
    grid-template-columns: 1fr;
  }

  .sb-betslip {
    position: static;
  }

  .sb-match-row {
    grid-template-columns: minmax(130px, .6fr) minmax(340px, 1.3fr) 220px 34px;
  }
}

@media (max-width: 930px) {
  .sb-content {
    width: min(100% - 22px, 1540px);
  }

  .sb-status-grid {
    grid-template-columns: 1fr 1fr;
  }

  .sb-match-row {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .sb-match-meta {
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 7px;
  }

  .sb-inline-market {
    max-width: 420px;
  }

  .sb-match-more {
    position: absolute;
    right: 10px;
    top: 10px;
  }
}

@media (max-width: 700px) {
  .sb-content {
    width: calc(100% - 14px);
    padding-top: 8px;
  }

  .sb-hero {
    min-height: 0;
    padding: 22px 18px;
  }

  .sb-hero h1 {
    font-size: 38px;
  }

  .sb-hero-right {
    grid-template-columns: 1fr;
  }

  .sb-status-grid,
  .sb-toolbar {
    grid-template-columns: 1fr;
  }

  .sb-subtoolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .sb-local-time {
    line-height: 1.45;
  }

  .sb-match-teams {
    grid-template-columns: 1fr 70px 1fr;
  }

  .sb-match-team,
  .sb-match-team:last-child {
    grid-template-columns: 1fr;
    justify-items: center;
    text-align: center;
  }

  .sb-match-team:last-child .sb-team-logo {
    grid-column: auto;
    grid-row: auto;
  }

  .sb-match-team strong {
    max-width: 120px;
    white-space: normal;
  }

  .sb-view-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: 100%;
  }

  .sb-view-tabs button {
    padding: 0 8px;
  }
}

@media (max-width: 460px) {
  .sb-status-grid {
    grid-template-columns: 1fr;
  }

  .sb-date-tabs {
    grid-template-columns: repeat(3, 1fr);
  }

  .sb-betslip-summary {
    grid-template-columns: 1fr;
  }
}

```

---

## `src/pages/Profile.tsx`

```tsx
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AdminIcon,
  BellIcon,
  BrainIcon,
  ChevronRightIcon,
  ClockIcon,
  DatabaseIcon,
  LogOutIcon,
  SettingsIcon,
  ShieldIcon,
  SignalIcon,
  TrophyIcon,
  UserIcon,
  UsersIcon,
} from "../components/Icons";
import { apiFetch, clearSession, getStoredUser, type AuthUser } from "../lib/api";

type ProfilePrefs = {
  avatar: string;
  notifications: boolean;
  responsibleReminder: boolean;
  sessionLimit: number;
  favoriteModule: string;
  joinedAt: string;
};

type AdminOverview = {
  totalUsers: number;
  activeUsers: number;
  activeSessions: number;
  securityEvents: number;
};

const PREFS_KEY = "neurowin-profile-prefs-v3";
const AI_HISTORY_KEY = "neurowin-ai-history-v3";

function defaultPrefs(): ProfilePrefs {
  return {
    avatar: "",
    notifications: true,
    responsibleReminder: true,
    sessionLimit: 60,
    favoriteModule: "NeuroWin AI",
    joinedAt: new Date().toISOString(),
  };
}

function readPrefs(): ProfilePrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...defaultPrefs(), ...JSON.parse(raw) } : defaultPrefs();
  } catch {
    return defaultPrefs();
  }
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default function Profile() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [user, setUser] = useState<AuthUser | null>(getStoredUser());
  const [prefs, setPrefs] = useState<ProfilePrefs>(readPrefs);
  const [saved, setSaved] = useState(false);
  const [sessionStarted] = useState(() => Date.now());
  const [minutes, setMinutes] = useState(0);
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null);

  useEffect(() => {
    apiFetch<{ user: AuthUser }>("/api/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMinutes(Math.floor((Date.now() - sessionStarted) / 60000));
    }, 30000);
    return () => window.clearInterval(timer);
  }, [sessionStarted]);

  useEffect(() => {
    if (user?.role !== "admin") return;
    apiFetch<{ overview: AdminOverview }>("/api/admin/overview")
      .then((data) => setAdminOverview(data.overview))
      .catch(() => setAdminOverview(null));
  }, [user?.role]);

  const aiMessages = useMemo(() => {
    try {
      const history = JSON.parse(localStorage.getItem(AI_HISTORY_KEY) || "[]");
      return Array.isArray(history) ? history.length : 0;
    } catch {
      return 0;
    }
  }, [saved]);

  const initials = (user?.name || "NW")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  function save(event: FormEvent) {
    event.preventDefault();
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  }

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => {
      setPrefs((current) => ({ ...current, avatar: String(reader.result || "") }));
    };
    reader.readAsDataURL(file);
  }

  async function logout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // A sessão local é limpa mesmo que o backend esteja indisponível.
    }
    clearSession();
    navigate("/login", { replace: true });
  }

  function exportData() {
    const data = {
      application: "NeuroWin",
      exportedAt: new Date().toISOString(),
      user: user
        ? {
            name: user.name,
            email: user.email,
            neurowinId: user.neurowinId,
            role: user.role,
          }
        : null,
      preferences: prefs,
      activity: {
        aiMessages,
        currentSessionMinutes: minutes,
      },
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "neurowin-profile-data.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function clearAiHistory() {
    localStorage.removeItem(AI_HISTORY_KEY);
    setSaved((value) => !value);
  }

  if (user?.role === "admin") {
    return (
      <main className="page profile-page admin-profile-page">
        {/* ======================================
            ADMIN HERO
        ====================================== */}
        <section className="profile-hero profile-hero-admin premium-card led-border hero-stadium">
          <div className="profile-avatar-wrap">
            <button
              className="profile-avatar profile-avatar-admin"
              onClick={() => fileRef.current?.click()}
              type="button"
              title="Alterar fotografia"
            >
              {prefs.avatar ? <img src={prefs.avatar} alt="Foto de perfil" /> : initials}
              <i className="profile-online-dot" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={choosePhoto} />
          </div>

          <div className="profile-identity">
            <span className="eyebrow">NEUROWIN ID</span>
            <h1>{user.name || "Administrador NeuroWin"}</h1>
            <p>Gestão avançada da plataforma, utilizadores e segurança.</p>
            <div className="profile-id-row">
              <span>{user.neurowinId}</span>
              <button type="button" onClick={() => navigator.clipboard?.writeText(user.neurowinId)}>
                Copiar ID
              </button>
            </div>
          </div>

          <div className="profile-state admin-state">
            <i className="status-dot" /> ADMIN ATIVO
          </div>
        </section>

        {/* ======================================
            ADMIN MÉTRICAS
        ====================================== */}
        <section className="profile-metrics admin-profile-metrics">
          <article className="premium-card led-border">
            <span className="metric-icon"><AdminIcon /></span>
            <div><small>FUNÇÃO</small><strong>Administrador</strong><em>Acesso administrativo</em></div>
            <ChevronRightIcon />
          </article>

          <article className="premium-card led-border">
            <span className="metric-icon"><ShieldIcon /></span>
            <div><small>SEGURANÇA</small><strong>Sessão protegida</strong><em>JWT + bcrypt</em></div>
            <ChevronRightIcon />
          </article>

          <article className="premium-card led-border">
            <span className="metric-icon"><UsersIcon /></span>
            <div><small>UTILIZADORES</small><strong>{adminOverview?.totalUsers ?? "—"}</strong><em>Contas registadas</em></div>
            <ChevronRightIcon />
          </article>

          <article className="premium-card led-border">
            <span className="metric-icon"><ClockIcon /></span>
            <div><small>SESSÕES</small><strong>{adminOverview?.activeSessions ?? "—"}</strong><em>Sessões ativas</em></div>
            <ChevronRightIcon />
          </article>
        </section>

        {/* ======================================
            ADMIN CONTEÚDO
        ====================================== */}
        <form className="profile-grid admin-profile-grid" onSubmit={save}>
          <section className="profile-card premium-card led-border">
            <div className="card-head">
              <div><span className="eyebrow">PERFIL</span><h2>Perfil do administrador</h2></div>
              <UserIcon />
            </div>

            <div className="admin-profile-field-row"><span>Nome apresentado</span><strong>{user.name}</strong></div>
            <div className="admin-profile-field-row"><span>Email</span><strong>{user.email}</strong></div>
            <div className="admin-profile-field-row"><span>Função</span><strong>Administrador</strong></div>
            <div className="admin-profile-field-row"><span>Membro desde</span><strong>{formatDate(user.createdAt)}</strong></div>
            <div className="admin-profile-field-row"><span>Último login</span><strong>{formatDate(user.lastLoginAt)}</strong></div>
          </section>

          <section className="profile-card premium-card led-border">
            <div className="card-head">
              <div><span className="eyebrow">PERMISSÕES</span><h2>Permissões de administrador</h2></div>
              <ShieldIcon />
            </div>

            <div className="permission-grid">
              <div><UsersIcon /><span><strong>Gestão de utilizadores</strong><small>Criar, consultar, bloquear e ativar contas.</small></span><b>ATIVO</b></div>
              <div><SettingsIcon /><span><strong>Controlo da plataforma</strong><small>Acesso ao centro administrativo.</small></span><b>ATIVO</b></div>
              <div><DatabaseIcon /><span><strong>Auditoria</strong><small>Consultar sessões e eventos de segurança.</small></span><b>ATIVO</b></div>
              <div><ShieldIcon /><span><strong>Revogar sessões</strong><small>Terminar sessões ativas de utilizadores.</small></span><b>ATIVO</b></div>
            </div>
          </section>

          <section className="profile-card premium-card led-border">
            <div className="card-head">
              <div><span className="eyebrow">SEGURANÇA</span><h2>Segurança da conta</h2></div>
              <ShieldIcon />
            </div>

            <div className="tool-grid">
              <div><ShieldIcon /><span><strong>Autenticação backend</strong><small>Token JWT validado em cada pedido protegido.</small></span></div>
              <div><ClockIcon /><span><strong>Sessão atual</strong><small>{minutes} minutos nesta sessão local.</small></span></div>
              <div><DatabaseIcon /><span><strong>Eventos registados</strong><small>{adminOverview?.securityEvents ?? "—"} eventos no painel.</small></span></div>
              <div><UsersIcon /><span><strong>Contas ativas</strong><small>{adminOverview?.activeUsers ?? "—"} utilizadores ativos.</small></span></div>
            </div>
          </section>

          <section className="profile-card premium-card led-border">
            <div className="card-head">
              <div><span className="eyebrow">PREFERÊNCIAS</span><h2>Preferências do administrador</h2></div>
              <SettingsIcon />
            </div>

            <label className="setting-row">
              <div><strong>Notificações</strong><small>Alertas e atualizações da plataforma.</small></div>
              <input
                type="checkbox"
                checked={prefs.notifications}
                onChange={(event) => setPrefs((current) => ({ ...current, notifications: event.target.checked }))}
              />
            </label>

            <label className="setting-row">
              <div><strong>Lembretes responsáveis</strong><small>Avisos de utilização e gestão de tempo.</small></div>
              <input
                type="checkbox"
                checked={prefs.responsibleReminder}
                onChange={(event) => setPrefs((current) => ({ ...current, responsibleReminder: event.target.checked }))}
              />
            </label>

            <label className="profile-field">
              <span>Módulo favorito</span>
              <select
                value={prefs.favoriteModule}
                onChange={(event) => setPrefs((current) => ({ ...current, favoriteModule: event.target.value }))}
              >
                <option>NeuroWin AI</option>
                <option>Desporto</option>
                <option>Sinais</option>
                <option>Administração</option>
              </select>
            </label>
          </section>

          <section className="profile-card premium-card led-border profile-admin-tools">
            <div className="card-head">
              <div><span className="eyebrow">GESTÃO</span><h2>Ferramentas de gestão</h2></div>
              <SettingsIcon />
            </div>

            <div className="admin-tool-links">
              <Link to="/admin"><UsersIcon /><span><strong>Gerir utilizadores</strong><small>Abrir o centro administrativo.</small></span><ChevronRightIcon /></Link>
              <Link to="/admin"><DatabaseIcon /><span><strong>Ver logs do sistema</strong><small>Consultar eventos e sessões.</small></span><ChevronRightIcon /></Link>
              <Link to="/ia"><BrainIcon /><span><strong>Estado da IA</strong><small>Abrir a NeuroWin AI.</small></span><ChevronRightIcon /></Link>
              <Link to="/desporto"><TrophyIcon /><span><strong>Estado do desporto</strong><small>Ver feeds e eventos desportivos.</small></span><ChevronRightIcon /></Link>
            </div>
          </section>

          <section className="profile-card premium-card led-border">
            <div className="card-head">
              <div><span className="eyebrow">DADOS</span><h2>Dados locais</h2></div>
              <DatabaseIcon />
            </div>

            <div className="data-row"><div><strong>Histórico AI</strong><small>{aiMessages} mensagens guardadas neste navegador.</small></div><button type="button" onClick={clearAiHistory}>Limpar</button></div>
            <div className="data-row"><div><strong>Exportar preferências</strong><small>Cria um ficheiro JSON com os dados locais.</small></div><button type="button" onClick={exportData}>Exportar</button></div>
          </section>

          <section className="profile-savebar premium-card led-border">
            <div><i className="status-dot" /><div><strong>Configuração do administrador</strong><small>As preferências são guardadas neste dispositivo.</small></div></div>
            <button className="primary-button">{saved ? "Guardado ✓" : "Guardar alterações"}</button>
          </section>
        </form>

        <button className="logout-button" onClick={logout}>
          <LogOutIcon />
          <span><strong>Terminar sessão</strong><small>Sair da conta de administrador neste dispositivo.</small></span>
        </button>
      </main>
    );
  }

  return (
    <main className="page profile-page">
      {/* ======================================
          USER HERO
      ====================================== */}
      <section className="profile-hero premium-card led-border hero-stadium">
        <div className="profile-avatar-wrap">
          <button
            className="profile-avatar"
            onClick={() => fileRef.current?.click()}
            type="button"
            title="Alterar fotografia"
          >
            {prefs.avatar ? <img src={prefs.avatar} alt="Foto de perfil" /> : initials}
            <i className="profile-online-dot" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={choosePhoto} />
          {prefs.avatar && (
            <button
              type="button"
              className="text-button"
              onClick={() => setPrefs((current) => ({ ...current, avatar: "" }))}
            >
              Remover foto
            </button>
          )}
        </div>

        <div className="profile-identity">
          <span className="eyebrow">NEUROWIN ID</span>
          <h1>{user?.name || "Utilizador NeuroWin"}</h1>
          <p>Gere as tuas preferências e controla a experiência NeuroWin.</p>
          <div className="profile-id-row">
            <span>{user?.neurowinId || "NW-LOCAL"}</span>
            <button type="button" onClick={() => navigator.clipboard?.writeText(user?.neurowinId || "NW-LOCAL")}>Copiar ID</button>
          </div>
        </div>

        <div className="profile-state"><i className="status-dot" /> PERFIL ATIVO</div>
      </section>

      {/* ======================================
          USER MÉTRICAS
      ====================================== */}
      <section className="profile-metrics user-profile-metrics">
        <article className="premium-card led-border"><span className="metric-icon"><BrainIcon /></span><div><small>MÓDULO FAVORITO</small><strong>{prefs.favoriteModule}</strong><em>O teu módulo principal</em></div><ChevronRightIcon /></article>
        <article className="premium-card led-border"><span className="metric-icon"><BellIcon /></span><div><small>LEMBRETES</small><strong>{prefs.responsibleReminder ? "Ativos" : "Desativados"}</strong><em>Gestão responsável</em></div><ChevronRightIcon /></article>
        <article className="premium-card led-border"><span className="metric-icon"><ClockIcon /></span><div><small>LIMITE DE SESSÃO</small><strong>{prefs.sessionLimit} min</strong><em>Gestão de tempo</em></div><ChevronRightIcon /></article>
      </section>

      {/* ======================================
          USER CONTEÚDO
      ====================================== */}
      <form className="profile-grid" onSubmit={save}>
        <section className="profile-card premium-card led-border">
          <div className="card-head"><div><span className="eyebrow">PERFIL</span><h2>Perfil</h2></div><UserIcon /></div>

          <div className="admin-profile-field-row"><span>Nome apresentado</span><strong>{user?.name || "Utilizador NeuroWin"}</strong></div>
          <div className="admin-profile-field-row"><span>Email</span><strong>{user?.email || "Sessão local"}</strong></div>
          <div className="admin-profile-field-row"><span>Membro desde</span><strong>{formatDate(user?.createdAt || prefs.joinedAt)}</strong></div>

          <label className="profile-field">
            <span>Módulo favorito</span>
            <select value={prefs.favoriteModule} onChange={(event) => setPrefs((current) => ({ ...current, favoriteModule: event.target.value }))}>
              <option>NeuroWin AI</option>
              <option>Desporto</option>
              <option>Sinais</option>
            </select>
          </label>
        </section>

        <section className="profile-card premium-card led-border">
          <div className="card-head"><div><span className="eyebrow">PREFERÊNCIAS</span><h2>Preferências</h2></div><SettingsIcon /></div>

          <label className="setting-row"><div><strong>Notificações</strong><small>Alertas e atualizações da plataforma.</small></div><input type="checkbox" checked={prefs.notifications} onChange={(event) => setPrefs((current) => ({ ...current, notifications: event.target.checked }))} /></label>
          <label className="setting-row"><div><strong>Lembretes responsáveis</strong><small>Avisos sobre tempo de utilização e jogo responsável.</small></div><input type="checkbox" checked={prefs.responsibleReminder} onChange={(event) => setPrefs((current) => ({ ...current, responsibleReminder: event.target.checked }))} /></label>
        </section>

        <section className="profile-card premium-card led-border">
          <div className="card-head"><div><span className="eyebrow">SESSÃO</span><h2>Sessão responsável</h2></div><ClockIcon /></div>
          <div className="session-options">
            {[30, 60, 90, 120].map((value) => (
              <button
                type="button"
                key={value}
                className={prefs.sessionLimit === value ? "active" : ""}
                onClick={() => setPrefs((current) => ({ ...current, sessionLimit: value }))}
              >
                <ClockIcon />
                <strong>{value} min</strong>
                <small>{value === 60 ? "RECOMENDADO" : "LIMITE"}</small>
              </button>
            ))}
          </div>
          <div className="responsible-inline"><ShieldIcon /><span><strong>O jogo deve ser uma forma de entretenimento, nunca uma fonte de pressão financeira.</strong><small>Define limites e faz pausas regulares.</small></span></div>
        </section>

        <section className="profile-card premium-card led-border">
          <div className="card-head"><div><span className="eyebrow">DADOS</span><h2>Dados locais</h2></div><DatabaseIcon /></div>
          <div className="data-row"><div><strong>Perfil NeuroWin</strong><small>Preferências e dados de personalização.</small></div><button type="button" onClick={() => setPrefs(defaultPrefs())}>Restaurar</button></div>
          <div className="data-row"><div><strong>Conversas AI</strong><small>{aiMessages} mensagens guardadas neste navegador.</small></div><button type="button" onClick={clearAiHistory}>Limpar</button></div>
          <div className="data-row"><div><strong>Exportar dados</strong><small>Cria um ficheiro JSON local.</small></div><button type="button" onClick={exportData}>Exportar</button></div>
        </section>

        <section className="profile-savebar premium-card led-border">
          <div><i className="status-dot" /><div><strong>Guardar alterações</strong><small>As preferências são guardadas neste dispositivo.</small></div></div>
          <button className="primary-button">{saved ? "Guardado ✓" : "Guardar alterações"}</button>
        </section>
      </form>

      <button className="logout-button" onClick={logout}>
        <LogOutIcon />
        <span><strong>Terminar sessão</strong><small>Sair desta conta neste dispositivo.</small></span>
      </button>
    </main>
  );
}

```

---

## `src/pages/Admin.tsx`

```tsx
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AdminIcon, RefreshIcon } from "../components/Icons";
import { apiFetch, type AuthUser } from "../lib/api";

type Overview = { totalUsers: number; activeUsers: number; activeSessions: number; securityEvents: number };
type AdminUser = AuthUser & { activeSessions: number };
type SecurityEvent = { id: string; event_type: string; ip_address: string | null; created_at: string; user_email: string | null; user_name: string | null; detail: string | null };

export default function Admin() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [overviewData, usersData, eventData] = await Promise.all([
        apiFetch<{ overview: Overview }>("/api/admin/overview"),
        apiFetch<{ users: AdminUser[] }>("/api/admin/users"),
        apiFetch<{ events: SecurityEvent[] }>("/api/admin/security-events"),
      ]);
      setOverview(overviewData.overview);
      setUsers(usersData.users);
      setEvents(eventData.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar o painel Admin.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(user: AdminUser) {
    const status = user.status === "active" ? "blocked" : "active";
    await apiFetch(`/api/admin/users/${encodeURIComponent(user.id)}/status`, { method: "POST", body: JSON.stringify({ status }) });
    await load();
  }

  async function revoke(user: AdminUser) {
    await apiFetch(`/api/admin/users/${encodeURIComponent(user.id)}/revoke-sessions`, { method: "POST" });
    await load();
  }

  return (
    <main className="admin-page page">
      <header className="admin-header">
        <div><span className="eyebrow"><AdminIcon /> ADMINISTRAÇÃO</span><h1>Centro de controlo</h1><p>Utilizadores, sessões e eventos de segurança.</p></div>
        <div className="admin-actions"><Link to="/perfil" className="secondary-button inline-button">Voltar ao perfil</Link><button className="secondary-button" onClick={load}><RefreshIcon /> Atualizar</button></div>
      </header>

      {error && <div className="form-error">{error}</div>}

      <section className="admin-stats">
        <article className="premium-card"><span>UTILIZADORES</span><strong>{overview?.totalUsers ?? "—"}</strong></article>
        <article className="premium-card"><span>ATIVOS</span><strong>{overview?.activeUsers ?? "—"}</strong></article>
        <article className="premium-card"><span>SESSÕES ATIVAS</span><strong>{overview?.activeSessions ?? "—"}</strong></article>
        <article className="premium-card"><span>EVENTOS SEGURANÇA</span><strong>{overview?.securityEvents ?? "—"}</strong></article>
      </section>

      <section className="admin-grid">
        <div className="admin-panel premium-card led-border">
          <div className="card-head"><div><span className="eyebrow">CONTAS</span><h2>Utilizadores</h2></div><span>{users.length}</span></div>
          <div className="admin-user-list">
            {loading && <div className="empty-state">A carregar utilizadores…</div>}
            {!loading && users.map((user) => (
              <article className="admin-user" key={user.id}>
                <div className="admin-user-avatar">{user.name.slice(0, 2).toUpperCase()}</div>
                <div className="admin-user-copy"><strong>{user.name}</strong><small>{user.email}</small><span>{user.neurowinId} · {user.role} · {user.activeSessions} sessões</span></div>
                <span className={`status-badge ${user.status}`}>{user.status === "active" ? "Ativo" : "Bloqueado"}</span>
                <div className="admin-user-actions">
                  <button onClick={() => revoke(user)}>Revogar sessões</button>
                  {user.role !== "admin" && <button className={user.status === "active" ? "danger" : "success"} onClick={() => changeStatus(user)}>{user.status === "active" ? "Bloquear" : "Ativar"}</button>}
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="admin-panel premium-card led-border">
          <div className="card-head"><div><span className="eyebrow">AUDITORIA</span><h2>Eventos recentes</h2></div><span>{events.length}</span></div>
          <div className="security-list">
            {events.length === 0 && !loading && <div className="empty-state">Sem eventos registados.</div>}
            {events.slice(0, 40).map((event) => (
              <article key={event.id} className="security-event"><i className="status-dot muted" /><div><strong>{event.event_type}</strong><small>{event.user_email || "Sistema"} · {event.ip_address || "IP indisponível"}</small></div><time>{new Date(event.created_at).toLocaleString("pt-PT")}</time></article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

```

---

## `src/pages/Login.tsx`

```tsx
import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { apiFetch, storeSession, type AuthUser } from "../lib/api";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiFetch<{ token: string; user: AuthUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      storeSession(data.token, data.user);
      const state = location.state as { from?: string } | null;
      navigate(state?.from || "/perfil", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível iniciar sessão.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card premium-card led-border">
        <Link to="/" className="auth-brand"><span className="brand-mark large">N</span><div><strong>NeuroWin</strong><small>Inteligência Estatística</small></div></Link>
        <div className="auth-heading"><span className="eyebrow">ACESSO SEGURO</span><h1>Bem-vindo de volta.</h1><p>Entra na tua conta NeuroWin.</p></div>
        <form onSubmit={submit} className="auth-form">
          <label><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
          <label><span>Palavra-passe</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
          {error && <div className="form-error">{error}</div>}
          <button className="primary-button" disabled={loading}>{loading ? "A entrar…" : "Entrar"}</button>
        </form>
        <div className="auth-security"><strong>Proteção de conta</strong><p>Passwords guardadas com hash bcrypt; autenticação validada no backend.</p></div>
        <p className="auth-switch">Ainda não tens conta? <Link to="/registar">Criar conta</Link></p>
      </section>
    </main>
  );
}

```

---

## `src/pages/Register.tsx`

```tsx
import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";

export default function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("As palavras-passe não coincidem.");
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar a conta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card premium-card led-border">
        <Link to="/" className="auth-brand"><span className="brand-mark large">N</span><div><strong>NeuroWin</strong><small>Criar identidade</small></div></Link>
        <div className="auth-heading"><span className="eyebrow">NOVO PERFIL</span><h1>Criar conta.</h1><p>Configura a tua identidade NeuroWin.</p></div>
        <form onSubmit={submit} className="auth-form">
          <label><span>Nome</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} /></label>
          <label><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
          <label><span>Palavra-passe</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={8} /></label>
          <label><span>Confirmar palavra-passe</span><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required minLength={8} /></label>
          {error && <div className="form-error">{error}</div>}
          <button className="primary-button" disabled={loading}>{loading ? "A criar…" : "Criar conta"}</button>
        </form>
        <p className="auth-switch">Já tens conta? <Link to="/login">Entrar</Link></p>
      </section>
    </main>
  );
}

```

---

## `src/pages/ResponsibleGaming.tsx`

```tsx
import { Link } from "react-router-dom";
import { ShieldIcon } from "../components/Icons";

export default function ResponsibleGaming() {
  return (
    <main className="page narrow-page">
      <section className="premium-card text-panel led-border">
        <ShieldIcon className="large-icon" />
        <span className="eyebrow">18+ · JOGO RESPONSÁVEL</span>
        <h1>Informação antes da decisão.</h1>
        <p>Define limites de tempo e orçamento, evita perseguir perdas e não utilizes dinheiro necessário para despesas essenciais. A análise estatística reduz incerteza apenas em termos descritivos; não elimina o risco.</p>
        <p>Se sentires perda de controlo, interrompe a atividade e procura apoio especializado na tua região.</p>
        <Link className="secondary-button inline-button" to="/">Voltar ao início</Link>
      </section>
    </main>
  );
}

```

---

## `src/pages/NotFound.tsx`

```tsx
import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <main className="center-screen">
      <section className="error-panel premium-card led-border">
        <span className="eyebrow">404</span>
        <h1>Página não encontrada</h1>
        <p>O endereço que procuraste não existe nesta versão da NeuroWin.</p>
        <Link to="/" className="primary-button inline-button">Voltar ao início</Link>
      </section>
    </main>
  );
}

```

---

## `src/styles.css`

```css
/* ==========================================
   NEUROWIN — GLOBAL STYLES
   Ficheiro: src/styles.css

   01. Tema e variáveis
   02. Reset e base
   03. Layout global
   04. Top bar / branding
   05. Navegação inferior
   06. Componentes globais
   07. LED / efeitos
   08. Home
   09. Sinais
   10. Auth / Age Gate / páginas auxiliares
   11. NeuroWin AI — layout
   12. NeuroWin AI — sidebar
   13. NeuroWin AI — header / welcome
   14. NeuroWin AI — mensagens
   15. NeuroWin AI — composer
   16. Perfil — base
   17. Perfil — utilizador
   18. Perfil — admin
   19. Admin — centro de controlo
   20. Tablet
   21. Mobile
   22. Acessibilidade
========================================== */


/* ==========================================
   01. TEMA E VARIÁVEIS
========================================== */

@property --led-angle {
  syntax: "<angle>";
  inherits: false;
  initial-value: 0deg;
}

:root {
  color-scheme: dark;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;

  --bg: #020711;
  --bg-soft: #06101d;
  --surface: rgba(5, 17, 31, .86);
  --surface-strong: rgba(3, 12, 23, .96);
  --surface-glass: rgba(4, 16, 29, .72);

  --border: rgba(95, 185, 230, .16);
  --border-soft: rgba(255, 255, 255, .065);
  --border-strong: rgba(73, 201, 255, .34);

  --text: #eef6f9;
  --text-soft: #c4d2d9;
  --muted: #7f939e;
  --muted-2: #5d7180;

  --cyan: #50d1ff;
  --cyan-strong: #16bff5;
  --blue: #177cff;
  --green: #42e7aa;
  --red: #ff6f7c;
  --amber: #d9b466;

  --radius: 18px;
  --radius-sm: 12px;
  --page-width: 1540px;
}


/* ==========================================
   02. RESET E BASE
========================================== */

* {
  box-sizing: border-box;
}

html {
  min-height: 100%;
  background: var(--bg);
}

body {
  min-width: 320px;
  min-height: 100vh;
  margin: 0;
  overflow-x: hidden;
  background:
    radial-gradient(circle at 8% -5%, rgba(36, 139, 209, .14), transparent 28%),
    radial-gradient(circle at 88% -10%, rgba(19, 104, 222, .12), transparent 31%),
    linear-gradient(180deg, #04101d 0%, #020812 48%, #01050a 100%);
  color: var(--text);
}

body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: .25;
  background-image:
    linear-gradient(rgba(86, 190, 236, .018) 1px, transparent 1px),
    linear-gradient(90deg, rgba(86, 190, 236, .018) 1px, transparent 1px);
  background-size: 64px 64px;
  mask-image: linear-gradient(to bottom, #000 0%, transparent 88%);
  -webkit-mask-image: linear-gradient(to bottom, #000 0%, transparent 88%);
}

button,
input,
textarea,
select {
  font: inherit;
}

button,
a {
  -webkit-tap-highlight-color: transparent;
}

button {
  color: inherit;
}

a {
  color: inherit;
  text-decoration: none;
}

img {
  max-width: 100%;
}

svg {
  display: block;
}

#root {
  position: relative;
  z-index: 1;
  min-height: 100vh;
}


/* ==========================================
   03. LAYOUT GLOBAL
========================================== */

.app-shell {
  min-height: 100vh;
  padding-bottom: 78px;
}

.page {
  width: min(var(--page-width), calc(100% - 42px));
  margin: 0 auto;
  padding: 16px 0 46px;
}

.narrow-page {
  width: min(860px, calc(100% - 28px));
}

.hero-stadium {
  position: relative;
  overflow: hidden;
}

.hero-stadium::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    linear-gradient(90deg, rgba(2, 10, 22, .96) 0%, rgba(3, 13, 28, .78) 50%, rgba(3, 14, 30, .52) 100%),
    url("/assets/neuro-win-sports-bg.png") center 44% / cover no-repeat;
  filter: saturate(.8) contrast(1.03);
}

.hero-stadium > * {
  position: relative;
  z-index: 2;
}


/* ==========================================
   04. TOP BAR / BRANDING
========================================== */

.app-header {
  position: sticky;
  top: 0;
  z-index: 120;
  display: flex;
  min-height: 68px;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 9px max(22px, calc((100vw - var(--page-width)) / 2));
  border-bottom: 1px solid rgba(90, 173, 214, .08);
  background: linear-gradient(180deg, rgba(2, 8, 16, .94), rgba(2, 8, 16, .74));
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.app-brand {
  display: inline-flex;
  align-items: center;
  gap: 11px;
}

.app-brand > span:last-child {
  display: grid;
  gap: 1px;
}

.app-brand strong {
  color: #f4f8fa;
  font-size: 17px;
  font-weight: 720;
  letter-spacing: -.025em;
}

.app-brand small {
  color: #668196;
  font-size: 7px;
  font-weight: 650;
  letter-spacing: .18em;
}

.brand-mark {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid rgba(79, 204, 255, .22);
  border-radius: 12px;
  background: linear-gradient(145deg, rgba(5, 104, 168, .44), rgba(3, 27, 48, .96));
  color: #66e1ff;
  font-size: 16px;
  font-weight: 900;
  font-style: italic;
  box-shadow:
    inset 0 0 20px rgba(44, 190, 245, .11),
    0 0 18px rgba(23, 129, 194, .08);
}

.brand-mark-logo {
  transform: skewX(-8deg);
}

.brand-mark.large {
  width: 52px;
  height: 52px;
  border-radius: 15px;
  font-size: 20px;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.topbar-icon {
  position: relative;
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #7f9aac;
  cursor: pointer;
}

.topbar-icon:hover {
  background: rgba(255, 255, 255, .035);
  color: #c1d8e3;
}

.topbar-icon svg {
  width: 18px;
}

.topbar-bell i {
  position: absolute;
  top: 7px;
  right: 8px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #43d9ff;
  box-shadow: 0 0 8px rgba(67, 217, 255, .9);
}

.topbar-profile {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid rgba(89, 183, 230, .12);
  border-radius: 50%;
  background: linear-gradient(145deg, rgba(23, 91, 151, .65), rgba(9, 35, 66, .94));
  color: #d7eff9;
  font-size: 10px;
  font-weight: 700;
}


/* ==========================================
   05. NAVEGAÇÃO INFERIOR
========================================== */

.bottom-nav {
  position: fixed;
  left: 50%;
  bottom: 0;
  z-index: 130;
  display: grid;
  grid-template-columns: repeat(5, 92px);
  transform: translateX(-50%);
  min-height: 66px;
  padding: 7px 10px 5px;
  border: 1px solid rgba(89, 180, 225, .2);
  border-bottom: 0;
  border-radius: 22px 22px 0 0;
  background: rgba(3, 10, 19, .94);
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
  box-shadow:
    0 -20px 55px rgba(0, 0, 0, .35),
    inset 0 1px 0 rgba(255, 255, 255, .02);
}

.bottom-link {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-radius: 13px;
  color: #677f8f;
  font-size: 8px;
  transition: color .18s ease, background .18s ease, transform .18s ease;
}

.bottom-link > svg {
  width: 18px;
  height: 18px;
}

.bottom-link:hover {
  color: #b2c8d3;
}

.bottom-link.active {
  color: #65d9ff;
  background: radial-gradient(circle at 50% 100%, rgba(22, 150, 229, .2), transparent 70%);
}

.bottom-link.active::after {
  content: "";
  position: absolute;
  bottom: -5px;
  width: 34px;
  height: 1px;
  background: #60d8ff;
  box-shadow: 0 0 10px rgba(96, 216, 255, .7);
}

.ai-bubble {
  display: grid;
  width: 38px;
  height: 38px;
  margin-top: -16px;
  place-items: center;
  border: 1px solid rgba(81, 199, 248, .18);
  border-radius: 12px;
  background: linear-gradient(145deg, #142333, #07101a);
  color: #7f9ba9;
  box-shadow: 0 8px 20px rgba(0, 0, 0, .4);
}

.ai-bubble svg {
  width: 18px;
}

.ai-link.active .ai-bubble {
  border-color: rgba(79, 211, 255, .45);
  background: linear-gradient(145deg, rgba(11, 112, 173, .65), rgba(5, 43, 72, .95));
  color: #8ce9ff;
  box-shadow:
    inset 0 0 20px rgba(51, 195, 246, .1),
    0 0 22px rgba(32, 162, 222, .2);
}


/* ==========================================
   06. COMPONENTES GLOBAIS
========================================== */

.premium-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: linear-gradient(145deg, rgba(6, 20, 35, .84), rgba(3, 11, 22, .94));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, .025),
    0 18px 48px rgba(0, 0, 0, .17);
  backdrop-filter: blur(15px);
  -webkit-backdrop-filter: blur(15px);
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #59d0fb;
  font-size: 8px;
  font-weight: 760;
  letter-spacing: .16em;
}

.eyebrow svg {
  width: 14px;
}

.status-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--green);
  box-shadow: 0 0 10px rgba(66, 231, 170, .8);
}

.status-dot.muted {
  background: #647887;
  box-shadow: none;
}

.quiet-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid rgba(75, 181, 229, .15);
  border-radius: 999px;
  background: rgba(4, 21, 36, .66);
  padding: 8px 11px;
  color: #8fa5b2;
  font-size: 8px;
  white-space: nowrap;
}

.primary-button,
.secondary-button {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 11px;
  padding: 0 15px;
  font-size: 10px;
  font-weight: 620;
  cursor: pointer;
  transition: transform .18s ease, border-color .18s ease, background .18s ease;
}

.primary-button {
  border: 1px solid rgba(68, 205, 255, .36);
  background: linear-gradient(135deg, #087ce9, #22cffa);
  color: #f8fdff;
  box-shadow: 0 0 18px rgba(25, 168, 239, .18);
}

.secondary-button {
  border: 1px solid rgba(255, 255, 255, .08);
  background: rgba(255, 255, 255, .025);
  color: #9aadb8;
}

.primary-button:hover:not(:disabled),
.secondary-button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.primary-button:disabled {
  opacity: .55;
  cursor: wait;
}

.secondary-button svg {
  width: 14px;
}

.inline-button {
  width: fit-content;
}

.text-button {
  border: 0;
  background: transparent;
  padding: 0;
  color: #7590a0;
  font-size: 8px;
  cursor: pointer;
}

.section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 20px;
  margin: 24px 4px 10px;
}

.section-heading h2 {
  margin: 4px 0 0;
  font-size: 24px;
  font-weight: 570;
  letter-spacing: -.03em;
}

.section-heading p {
  margin: 0;
  color: #617887;
  font-size: 8px;
  letter-spacing: .12em;
  text-transform: uppercase;
}


/* ==========================================
   07. LED / EFEITOS
========================================== */

.led-border {
  position: relative;
  isolation: isolate;
}

.led-border::after {
  content: "";
  position: absolute;
  inset: -1px;
  z-index: 5;
  border-radius: inherit;
  padding: 1px;
  pointer-events: none;
  background: conic-gradient(
    from var(--led-angle, 0deg),
    transparent 0deg,
    transparent 319deg,
    rgba(86, 207, 255, .14) 331deg,
    rgba(103, 221, 255, .92) 344deg,
    rgba(237, 251, 255, .98) 351deg,
    transparent 360deg
  );
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  filter: drop-shadow(0 0 7px rgba(87, 206, 255, .18));
  animation: led-run 8s linear infinite;
}

@keyframes led-run {
  to {
    --led-angle: 360deg;
  }
}


/* ==========================================
   08. HOME
========================================== */

.page-home {
  padding-top: 10px;
}

.home-hero {
  min-height: 280px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 410px;
  align-items: center;
  gap: 30px;
  padding: 34px 42px;
}

.home-hero::before {
  background:
    linear-gradient(90deg, rgba(2, 10, 22, .97) 0%, rgba(3, 15, 30, .78) 48%, rgba(3, 16, 31, .34) 100%),
    url("/assets/neuro-win-sports-bg.png") center 46% / cover no-repeat;
}

.home-hero::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    radial-gradient(circle at 73% 57%, rgba(34, 177, 255, .2), transparent 22%),
    linear-gradient(90deg, transparent 60%, rgba(7, 38, 66, .22));
}

.hero-copy {
  max-width: 820px;
}

.home-hero h1 {
  max-width: 780px;
  margin: 13px 0 0;
  color: #f6f9fa;
  font-size: clamp(42px, 5.2vw, 68px);
  font-weight: 620;
  letter-spacing: -.05em;
  line-height: .98;
}

.home-hero h1 span {
  display: block;
  color: #47d2f9;
}

.home-hero p {
  max-width: 700px;
  margin: 17px 0 0;
  color: #a9bac4;
  font-size: 15px;
  line-height: 1.6;
}

.hero-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 22px;
  margin-top: 22px;
}

.hero-facts span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #79919f;
  font-size: 7px;
  font-weight: 650;
  letter-spacing: .12em;
  text-transform: uppercase;
}

.hero-facts i {
  width: 10px;
  height: 10px;
  border: 1px solid #42cef7;
  border-radius: 50%;
  box-shadow: 0 0 8px rgba(66, 206, 247, .22);
}

.hero-visual {
  position: relative;
  min-height: 210px;
  display: grid;
  place-items: center;
}

.hero-logo-cube {
  position: relative;
  z-index: 3;
  display: grid;
  width: 150px;
  height: 150px;
  place-items: center;
  border: 1px solid rgba(85, 211, 255, .58);
  border-radius: 34px;
  background:
    linear-gradient(145deg, rgba(8, 67, 123, .86), rgba(2, 15, 31, .98));
  color: #62e7ff;
  box-shadow:
    inset 0 0 34px rgba(26, 169, 237, .17),
    0 0 38px rgba(22, 153, 234, .24),
    0 0 0 4px rgba(48, 197, 255, .045);
  transform: rotate(-1deg);
}

.hero-logo-cube span {
  font-size: 72px;
  font-style: italic;
  font-weight: 900;
  text-shadow: 0 0 22px rgba(72, 220, 255, .44);
}

.hero-logo-cube svg {
  width: 68px;
}

.hero-rings {
  position: absolute;
  left: 50%;
  bottom: 8px;
  width: 285px;
  height: 58px;
  transform: translateX(-50%);
  border: 1px solid rgba(63, 199, 255, .44);
  border-radius: 50%;
  box-shadow:
    0 0 20px rgba(25, 166, 234, .17),
    inset 0 0 16px rgba(22, 161, 234, .12);
}

.hero-rings::before,
.hero-rings::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  border: 1px solid rgba(61, 198, 255, .28);
  border-radius: 50%;
}

.hero-rings::before {
  width: 220px;
  height: 38px;
}

.hero-rings::after {
  width: 155px;
  height: 22px;
}

.hero-keywords {
  position: absolute;
  right: -5px;
  top: 14px;
  display: grid;
  gap: 9px;
}

.hero-keywords span {
  border-left: 1px solid #3fcbf8;
  padding-left: 8px;
  color: #75a9c0;
  font-size: 7px;
  letter-spacing: .2em;
}

.home-status-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.status-card {
  position: relative;
  display: grid;
  grid-template-columns: 48px 1fr 17px;
  align-items: center;
  gap: 11px;
  min-height: 92px;
  padding: 14px;
}

.status-card-featured {
  border-color: rgba(64, 193, 246, .36);
}

.status-card-icon {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border: 1px solid rgba(76, 189, 239, .17);
  border-radius: 12px;
  background: rgba(20, 90, 137, .13);
  color: #55d1ff;
}

.status-card-icon svg {
  width: 22px;
}

.status-card > div {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.status-card small {
  color: #647e8e;
  font-size: 7px;
  letter-spacing: .1em;
}

.status-card strong {
  color: #dce7eb;
  font-size: 13px;
  font-weight: 600;
}

.status-card em {
  overflow: hidden;
  color: #647d8c;
  font-size: 8px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-card em.ok {
  color: #50d6a8;
}

.status-card > svg {
  width: 16px;
  color: #54cfff;
}

.home-section-heading {
  margin-top: 25px;
}

.home-module-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 11px;
}

.module-card {
  position: relative;
  min-height: 128px;
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr) 150px 34px;
  align-items: center;
  gap: 14px;
  overflow: hidden;
  padding: 17px 18px;
  transition: transform .18s ease, border-color .18s ease;
}

.module-card:hover {
  transform: translateY(-2px);
  border-color: rgba(72, 202, 255, .32);
}

.module-icon {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  border: 1px solid rgba(78, 198, 245, .2);
  border-radius: 14px;
  background: rgba(26, 110, 155, .13);
  color: #5bd5ff;
}

.module-icon svg {
  width: 24px;
}

.module-copy {
  min-width: 0;
}

.module-copy small {
  color: #5e7d8f;
  font-size: 7px;
  letter-spacing: .14em;
}

.module-copy h3 {
  margin: 5px 0 0;
  color: #edf4f6;
  font-size: 19px;
  font-weight: 610;
}

.module-copy p {
  margin: 6px 0 0;
  color: #82949f;
  font-size: 9px;
  line-height: 1.5;
}

.module-arrow {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid rgba(73, 182, 234, .18);
  border-radius: 50%;
  background: rgba(11, 75, 115, .18);
  color: #57d2ff;
}

.module-arrow svg {
  width: 14px;
}

.module-art {
  position: relative;
  min-height: 84px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-left: 1px solid rgba(255, 255, 255, .035);
  color: rgba(73, 206, 255, .36);
}

.module-art svg {
  width: 52px;
}

.module-art-chart {
  background:
    linear-gradient(180deg, transparent, rgba(15, 94, 145, .12)),
    repeating-linear-gradient(90deg, transparent 0 16px, rgba(64, 178, 231, .08) 16px 18px);
}

.module-art-brain {
  background: radial-gradient(circle, rgba(31, 129, 183, .18), transparent 62%);
}

.module-art-stadium {
  background:
    linear-gradient(90deg, rgba(3, 15, 28, .15), rgba(3, 15, 28, .7)),
    url("/assets/neuro-win-sports-bg.png") center / cover no-repeat;
}

.module-art-profile {
  background: linear-gradient(135deg, rgba(18, 89, 135, .11), transparent);
}

.responsible-banner {
  display: grid;
  grid-template-columns: 40px 1fr auto;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding: 12px 15px;
}

.responsible-banner > svg {
  width: 24px;
  color: #55d0fc;
}

.responsible-banner strong {
  color: #bac8cf;
  font-size: 10px;
  font-weight: 600;
}

.responsible-banner p {
  margin: 3px 0 0;
  color: #677e8c;
  font-size: 8px;
}

.responsible-banner a {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #66d0f5;
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.responsible-banner a svg {
  width: 13px;
}


/* ==========================================
   09. SINAIS
========================================== */

.signals-page {
  padding-top: 10px;
}

.signals-hero {
  min-height: 235px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  align-items: center;
  gap: 24px;
  padding: 30px 40px;
}

.signals-hero::before {
  background:
    linear-gradient(90deg, rgba(2, 10, 22, .97), rgba(3, 14, 29, .78) 55%, rgba(3, 16, 31, .38)),
    url("/assets/neuro-win-sports-bg.png") center / cover no-repeat;
}

.signals-hero > div:first-child {
  max-width: 780px;
}

.signals-hero h1 {
  margin: 12px 0 0;
  color: #f2f7f9;
  font-size: clamp(42px, 5vw, 63px);
  font-weight: 620;
  letter-spacing: -.05em;
  line-height: 1;
}

.signals-hero h1 span {
  color: #45d1f8;
}

.signals-hero p {
  max-width: 760px;
  margin: 13px 0 0;
  color: #a4b6c0;
  font-size: 14px;
  line-height: 1.6;
}

.signals-hero-visual {
  position: relative;
  min-height: 160px;
  display: grid;
  place-items: center;
}

.signals-chart-orb {
  position: relative;
  z-index: 2;
  display: grid;
  width: 116px;
  height: 116px;
  place-items: center;
  border: 1px solid rgba(65, 206, 255, .42);
  border-radius: 26px;
  background: linear-gradient(145deg, rgba(16, 92, 145, .72), rgba(3, 24, 43, .94));
  color: #55ddff;
  box-shadow: 0 0 28px rgba(33, 168, 230, .18);
}

.signals-chart-orb svg {
  width: 48px;
}

.signals-bars {
  position: absolute;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: end;
  gap: 9px;
  height: 92px;
  opacity: .5;
}

.signals-bars i {
  width: 10px;
  background: linear-gradient(#42d2ff, rgba(28, 104, 210, .2));
  border-radius: 4px 4px 0 0;
}

.signals-bars i:nth-child(1) { height: 28%; }
.signals-bars i:nth-child(2) { height: 55%; }
.signals-bars i:nth-child(3) { height: 42%; }
.signals-bars i:nth-child(4) { height: 78%; }
.signals-bars i:nth-child(5) { height: 62%; }
.signals-bars i:nth-child(6) { height: 92%; }

.signals-ready {
  position: absolute;
  top: 18px;
  right: 20px;
}

.signal-grid-premium {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.signal-card {
  position: relative;
  display: grid;
  grid-template-columns: minmax(190px, 46%) 1fr;
  min-height: 220px;
  overflow: hidden;
}

.signal-image {
  position: relative;
  min-height: 220px;
  overflow: hidden;
}

.signal-image img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  filter: saturate(.9) brightness(.72) contrast(1.05);
  transition: transform .35s ease;
}

.signal-card:hover .signal-image img {
  transform: scale(1.025);
}

.signal-image span {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 48%, rgba(3, 13, 25, .94));
}

.signal-copy {
  align-self: center;
  padding: 20px 20px 20px 24px;
}

.signal-copy > small {
  color: #49cef9;
  font-size: 8px;
  font-weight: 680;
  letter-spacing: .16em;
}

.signal-copy h2 {
  margin: 8px 0 0;
  color: #f0f5f7;
  font-size: 27px;
  font-weight: 620;
  letter-spacing: -.035em;
}

.signal-copy p {
  margin: 8px 0 0;
  color: #8fa1ac;
  font-size: 10px;
  line-height: 1.55;
}

.signal-state {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 18px;
  border: 1px solid rgba(82, 162, 200, .11);
  border-radius: 999px;
  background: rgba(255, 255, 255, .015);
  padding: 8px 10px;
  color: #637987;
  font-size: 8px;
}

.signal-arrow {
  position: absolute;
  top: 17px;
  right: 17px;
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid rgba(70, 186, 237, .23);
  border-radius: 50%;
  background: rgba(13, 75, 112, .18);
  color: #5cd2ff;
}

.signal-arrow svg {
  width: 15px;
}


/* ==========================================
   10. AUTH / AGE GATE / PÁGINAS AUXILIARES
========================================== */

.auth-page,
.center-screen {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 28px 18px;
}

.auth-page {
  background:
    linear-gradient(rgba(1, 7, 15, .76), rgba(1, 7, 15, .9)),
    url("/assets/neuro-win-sports-bg.png") center / cover no-repeat;
}

.auth-card {
  width: min(480px, 100%);
  padding: 28px;
}

.auth-brand {
  display: inline-flex;
  align-items: center;
  gap: 11px;
}

.auth-brand > div {
  display: grid;
  gap: 2px;
}

.auth-brand strong {
  font-size: 15px;
}

.auth-brand small {
  color: #6c8291;
  font-size: 8px;
}

.auth-heading {
  margin-top: 27px;
}

.auth-heading h1 {
  margin: 8px 0 0;
  color: #f0f5f7;
  font-size: 36px;
  font-weight: 580;
  letter-spacing: -.04em;
}

.auth-heading p {
  margin: 7px 0 0;
  color: #7e929e;
  font-size: 10px;
}

.auth-form {
  display: grid;
  gap: 11px;
  margin-top: 20px;
}

.auth-form label,
.profile-field {
  display: grid;
  gap: 6px;
}

.auth-form label > span,
.profile-field > span {
  color: #718797;
  font-size: 8px;
}

.auth-form input,
.profile-field select {
  width: 100%;
  min-height: 44px;
  border: 1px solid rgba(86, 169, 210, .15);
  border-radius: 10px;
  outline: 0;
  background: rgba(1, 9, 18, .65);
  padding: 0 12px;
  color: #e5eef2;
  font-size: 11px;
}

.auth-form input:focus,
.profile-field select:focus {
  border-color: rgba(74, 205, 255, .38);
  box-shadow: 0 0 0 3px rgba(74, 205, 255, .045);
}

.auth-form .primary-button {
  width: 100%;
}

.form-error {
  border: 1px solid rgba(255, 100, 112, .2);
  border-radius: 10px;
  background: rgba(118, 24, 35, .12);
  padding: 9px 10px;
  color: #ff939d;
  font-size: 9px;
}

.auth-security {
  margin-top: 14px;
  border: 1px solid rgba(255, 255, 255, .05);
  border-radius: 10px;
  background: rgba(255, 255, 255, .016);
  padding: 10px;
}

.auth-security strong {
  color: #a1b0b8;
  font-size: 9px;
}

.auth-security p {
  margin: 3px 0 0;
  color: #657b88;
  font-size: 8px;
  line-height: 1.5;
}

.auth-switch {
  margin: 15px 0 0;
  color: #6b808e;
  font-size: 9px;
  text-align: center;
}

.auth-switch a {
  color: #5ecff8;
}

.age-gate {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(1, 5, 10, .9);
  backdrop-filter: blur(18px);
}

.age-card {
  width: min(440px, 100%);
  padding: 28px;
  text-align: center;
}

.age-card .brand-mark {
  margin: 0 auto 16px;
}

.age-card h1 {
  margin: 8px 0 0;
  font-size: 29px;
  font-weight: 590;
}

.age-card p {
  color: #7c909c;
  font-size: 10px;
  line-height: 1.6;
}

.age-card .primary-button {
  width: 100%;
  margin-top: 9px;
}

.error-panel,
.loading-card,
.text-panel {
  width: min(600px, 100%);
  padding: 28px;
}

.error-panel,
.text-panel {
  text-align: center;
}

.error-panel h1,
.text-panel h1 {
  margin: 8px 0 0;
  font-size: 32px;
  font-weight: 580;
}

.error-panel p,
.text-panel p {
  color: #7b909d;
  font-size: 10px;
  line-height: 1.65;
}

.loading-card {
  display: flex;
  align-items: center;
  gap: 12px;
}

.loading-card > div {
  display: grid;
  gap: 2px;
}

.loading-card small {
  color: #6a8190;
  font-size: 8px;
}

.text-panel .large-icon {
  width: 36px;
  margin: 0 auto 15px;
  color: #55d0fb;
}


/* ==========================================
   11. NEUROWIN AI — LAYOUT
========================================== */

.ai-page-premium {
  display: grid;
  grid-template-columns: 270px minmax(0, 1fr);
  min-height: calc(100vh - 68px);
  padding-bottom: 66px;
  background:
    radial-gradient(circle at 72% 0%, rgba(29, 121, 185, .1), transparent 34%),
    #020711;
}

.ai-main {
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.ai-thread {
  width: min(1080px, calc(100% - 34px));
  flex: 1;
  margin: 0 auto;
  padding: 8px 0 122px;
}


/* ==========================================
   12. NEUROWIN AI — SIDEBAR
========================================== */

.ai-sidebar {
  position: sticky;
  top: 68px;
  display: flex;
  height: calc(100vh - 134px);
  flex-direction: column;
  gap: 14px;
  border-right: 1px solid rgba(76, 167, 211, .1);
  background: rgba(2, 9, 17, .72);
  padding: 16px 12px;
  backdrop-filter: blur(16px);
}

.ai-side-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 4px 5px;
}

.ai-side-brand > div {
  display: grid;
  gap: 2px;
}

.ai-side-brand strong {
  color: #e6eef2;
  font-size: 12px;
}

.ai-side-brand small {
  color: #617986;
  font-size: 8px;
}

.ai-new {
  min-height: 42px;
  border: 1px solid rgba(70, 199, 249, .25);
  border-radius: 12px;
  background: linear-gradient(145deg, rgba(9, 105, 161, .22), rgba(5, 40, 66, .36));
  color: #8ee4ff;
  font-size: 9px;
  cursor: pointer;
  box-shadow: inset 0 0 20px rgba(37, 170, 226, .05);
}

.ai-new span {
  font-size: 18px;
  vertical-align: -1px;
}

.ai-sidebar-section {
  display: grid;
  gap: 7px;
  margin-top: 3px;
}

.ai-sidebar-label {
  margin: 0 4px;
  color: #536a79;
  font-size: 7px;
  letter-spacing: .15em;
}

.ai-conversation-card {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  padding: 9px;
}

.ai-conversation-icon {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid rgba(78, 196, 244, .18);
  border-radius: 9px;
  background: rgba(26, 102, 143, .12);
  color: #5ad2fb;
}

.ai-conversation-icon svg {
  width: 16px;
}

.ai-conversation-card strong {
  display: block;
  overflow: hidden;
  color: #b9c8cf;
  font-size: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-conversation-card small {
  display: block;
  margin-top: 2px;
  color: #607783;
  font-size: 7px;
}

.ai-sidebar-topics button {
  min-height: 34px;
  border: 1px solid rgba(255, 255, 255, .045);
  border-radius: 9px;
  background: rgba(255, 255, 255, .018);
  padding: 0 10px;
  color: #748996;
  font-size: 8px;
  text-align: left;
  cursor: pointer;
}

.ai-sidebar-topics button:hover {
  border-color: rgba(79, 193, 240, .16);
  color: #9db4bf;
}

.ai-sidebar-status {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: auto;
  padding: 10px;
}

.ai-sidebar-status > div {
  display: grid;
  gap: 2px;
}

.ai-sidebar-status strong {
  color: #aebdc5;
  font-size: 8px;
}

.ai-sidebar-status small {
  color: #5d7482;
  font-size: 7px;
}


/* ==========================================
   13. NEUROWIN AI — HEADER / WELCOME
========================================== */

.ai-header {
  min-height: 178px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  align-items: center;
  gap: 20px;
  margin: 12px 14px;
  padding: 22px 28px;
}

.ai-header::before {
  background:
    linear-gradient(90deg, rgba(2, 10, 22, .97), rgba(3, 14, 29, .74) 58%, rgba(3, 16, 31, .35)),
    url("/assets/neuro-win-sports-bg.png") center / cover no-repeat;
}

.ai-header-copy {
  max-width: 760px;
}

.ai-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.ai-header h1 {
  margin: 7px 0 0;
  color: #f1f6f8;
  font-size: 35px;
  font-weight: 610;
  letter-spacing: -.04em;
}

.ai-header p {
  max-width: 720px;
  margin: 8px 0 0;
  color: #a0b2bc;
  font-size: 11px;
  line-height: 1.55;
}

.ai-online-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  border: 1px solid rgba(255, 255, 255, .08);
  border-radius: 999px;
  padding: 6px 9px;
  color: #738893;
  font-size: 7px;
  font-weight: 700;
  letter-spacing: .08em;
}

.ai-online-badge i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #647783;
}

.ai-online-badge.online {
  border-color: rgba(65, 229, 169, .28);
  color: #63e6b5;
  background: rgba(23, 112, 80, .1);
}

.ai-online-badge.online i {
  background: #42e7aa;
  box-shadow: 0 0 9px rgba(66, 231, 170, .7);
}

.ai-header-visual {
  position: relative;
  min-height: 125px;
  display: grid;
  place-items: center;
}

.ai-cube {
  width: 105px;
  height: 105px;
  border-radius: 25px;
}

.ai-cube svg {
  width: 45px;
}

.ai-header-visual .hero-rings {
  width: 210px;
  height: 42px;
  bottom: -1px;
}

.ai-welcome {
  margin-top: 8px;
  padding: 30px;
  text-align: center;
}

.ai-welcome-icon {
  display: grid;
  width: 58px;
  height: 58px;
  margin: 0 auto 12px;
  place-items: center;
  border: 1px solid rgba(72, 202, 255, .24);
  border-radius: 17px;
  background: rgba(18, 101, 147, .13);
  color: #5bd8ff;
  box-shadow: 0 0 22px rgba(28, 166, 226, .09);
}

.ai-welcome-icon svg {
  width: 28px;
}

.ai-welcome h2 {
  margin: 6px 0 0;
  color: #edf4f7;
  font-size: 34px;
  font-weight: 610;
  letter-spacing: -.04em;
}

.ai-welcome h2 span {
  color: #44d3fa;
}

.ai-welcome > p {
  max-width: 720px;
  margin: 9px auto 0;
  color: #8398a4;
  font-size: 10px;
  line-height: 1.6;
}

.ai-prompt-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 19px;
}

.ai-prompt-grid button {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 17px;
  align-items: center;
  gap: 10px;
  min-height: 82px;
  border: 1px solid rgba(78, 179, 224, .15);
  border-radius: 13px;
  background: rgba(5, 19, 34, .74);
  padding: 11px;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.ai-prompt-grid button:hover {
  border-color: rgba(68, 203, 255, .33);
  background: rgba(9, 42, 67, .54);
}

.prompt-icon {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border: 1px solid rgba(74, 195, 243, .16);
  border-radius: 11px;
  background: rgba(18, 101, 145, .11);
  color: #5bd1fa;
}

.prompt-icon svg {
  width: 19px;
}

.prompt-percent {
  font-size: 20px;
  font-weight: 700;
}

.ai-prompt-grid button > div {
  min-width: 0;
}

.ai-prompt-grid strong {
  display: block;
  color: #d3dfe4;
  font-size: 10px;
}

.ai-prompt-grid small {
  display: block;
  margin-top: 4px;
  color: #6b818e;
  font-size: 8px;
  line-height: 1.4;
}

.ai-prompt-grid button > svg {
  width: 15px;
  color: #52caf6;
}


/* ==========================================
   14. NEUROWIN AI — MENSAGENS
========================================== */

.ai-message {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  align-items: start;
  gap: 12px;
  width: min(820px, 92%);
  margin-top: 14px;
}

.ai-message.user {
  grid-template-columns: minmax(0, 1fr) 38px;
  margin-left: auto;
}

.ai-message-avatar {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid rgba(74, 193, 242, .18);
  border-radius: 11px;
  background: linear-gradient(145deg, rgba(18, 87, 128, .25), rgba(4, 18, 31, .95));
  color: #62d8ff;
  font-size: 8px;
  font-weight: 700;
}

.ai-message-avatar svg {
  width: 18px;
}

.ai-message.user .ai-message-avatar {
  grid-column: 2;
  color: #c6d3d9;
  background: rgba(255, 255, 255, .025);
}

.ai-message-body {
  min-width: 0;
  border: 1px solid rgba(80, 170, 213, .13);
  border-radius: 14px;
  background: rgba(4, 17, 29, .83);
  padding: 13px 15px;
}

.ai-message.user .ai-message-body {
  grid-column: 1;
  background: linear-gradient(135deg, rgba(8, 67, 109, .42), rgba(5, 26, 44, .82));
  border-color: rgba(69, 185, 233, .21);
}

.ai-message-body > span {
  display: block;
  margin-bottom: 6px;
  color: #607b8b;
  font-size: 7px;
  font-weight: 650;
  letter-spacing: .06em;
}

.ai-message-body p,
.ai-message-body li {
  margin-top: 0;
  color: #cbd8de;
  font-size: 10px;
  line-height: 1.65;
}

.ai-message-body p {
  margin-bottom: 8px;
}

.ai-message-body p:last-child {
  margin-bottom: 0;
}

.ai-message-body ul,
.ai-message-body ol {
  padding-left: 20px;
}

.ai-message-body code {
  border-radius: 5px;
  background: rgba(255, 255, 255, .055);
  padding: 2px 5px;
  color: #8bdcf8;
  font-size: 9px;
}

.ai-message-body a {
  color: #65d2fa;
  text-decoration: underline;
  text-decoration-color: rgba(101, 210, 250, .35);
  text-underline-offset: 3px;
}

.typing {
  display: flex;
  gap: 4px;
  padding: 8px 0 2px;
}

.typing i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #5ec8ee;
  animation: typing 1s infinite alternate;
}

.typing i:nth-child(2) { animation-delay: .18s; }
.typing i:nth-child(3) { animation-delay: .36s; }

@keyframes typing {
  to {
    opacity: .25;
    transform: translateY(-2px);
  }
}

.ai-error {
  margin-top: 10px;
}


/* ==========================================
   15. NEUROWIN AI — COMPOSER
========================================== */

.ai-composer {
  position: fixed;
  left: calc(270px + (100vw - 270px - min(1080px, calc(100vw - 304px))) / 2);
  right: 18px;
  bottom: 76px;
  z-index: 80;
  display: grid;
  grid-template-columns: 1fr 44px;
  align-items: end;
  gap: 8px;
  width: min(1080px, calc(100vw - 304px));
  padding: 8px;
}

.ai-composer textarea {
  min-height: 44px;
  max-height: 150px;
  resize: vertical;
  border: 0;
  outline: 0;
  background: transparent;
  padding: 11px 10px;
  color: #e3edf1;
  font-size: 10px;
  line-height: 1.45;
}

.ai-composer textarea::placeholder {
  color: #5e7787;
}

.ai-send {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 1px solid rgba(63, 199, 255, .3);
  border-radius: 11px;
  background: linear-gradient(145deg, rgba(6, 117, 180, .55), rgba(6, 58, 94, .72));
  color: #7adfff;
  cursor: pointer;
}

.ai-send:disabled {
  opacity: .35;
  cursor: default;
}

.ai-send svg {
  width: 18px;
}


/* ==========================================
   16. PERFIL — BASE
========================================== */

.profile-page {
  padding-top: 10px;
}

.profile-hero {
  min-height: 200px;
  display: flex;
  align-items: center;
  gap: 22px;
  padding: 25px 34px;
}

.profile-hero::before {
  background:
    linear-gradient(90deg, rgba(2, 10, 22, .93), rgba(3, 15, 30, .64) 52%, rgba(3, 16, 31, .3)),
    url("/assets/neuro-win-sports-bg.png") center / cover no-repeat;
}

.profile-avatar-wrap {
  display: grid;
  justify-items: center;
  gap: 7px;
}

.profile-avatar {
  position: relative;
  display: grid;
  width: 110px;
  height: 110px;
  place-items: center;
  overflow: visible;
  border: 2px solid rgba(58, 202, 255, .72);
  border-radius: 50%;
  background: radial-gradient(circle at 45% 35%, rgba(32, 111, 171, .5), rgba(3, 21, 40, .98));
  color: #f2f7fa;
  font-size: 34px;
  font-weight: 720;
  cursor: pointer;
  box-shadow:
    inset 0 0 30px rgba(48, 182, 244, .09),
    0 0 24px rgba(35, 166, 235, .26),
    0 0 0 7px rgba(39, 174, 239, .045);
}

.profile-avatar img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

.profile-online-dot {
  position: absolute;
  right: 4px;
  bottom: 9px;
  width: 17px;
  height: 17px;
  border: 3px solid #06111e;
  border-radius: 50%;
  background: #28e7a1;
  box-shadow: 0 0 12px rgba(40, 231, 161, .7);
}

.profile-identity {
  min-width: 0;
  flex: 1;
}

.profile-identity h1 {
  margin: 8px 0 0;
  color: #f1f6f8;
  font-size: 36px;
  font-weight: 620;
  letter-spacing: -.04em;
}

.profile-identity > p {
  margin: 7px 0 0;
  color: #9aadb8;
  font-size: 11px;
}

.profile-id-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 9px;
}

.profile-id-row span {
  color: #8ca1ad;
  font-size: 8px;
  letter-spacing: .05em;
}

.profile-id-row button {
  border: 1px solid rgba(73, 180, 226, .14);
  border-radius: 7px;
  background: rgba(4, 31, 51, .6);
  padding: 5px 7px;
  color: #62caf1;
  font-size: 7px;
  cursor: pointer;
}

.profile-state {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  align-self: flex-start;
  margin-top: 35px;
  border: 1px solid rgba(61, 226, 166, .26);
  border-radius: 999px;
  background: rgba(22, 104, 78, .12);
  padding: 7px 10px;
  color: #5ce4b1;
  font-size: 7px;
  font-weight: 700;
  letter-spacing: .1em;
}

.profile-metrics {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.profile-metrics article {
  position: relative;
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) 17px;
  align-items: center;
  gap: 11px;
  min-height: 92px;
  padding: 13px 15px;
}

.metric-icon {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 1px solid rgba(72, 191, 240, .16);
  border-radius: 12px;
  background: rgba(20, 96, 141, .12);
  color: #55d0fc;
}

.metric-icon svg {
  width: 21px;
}

.profile-metrics article > div {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.profile-metrics small {
  color: #637d8d;
  font-size: 7px;
  letter-spacing: .1em;
}

.profile-metrics strong {
  overflow: hidden;
  color: #d9e6eb;
  font-size: 15px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-metrics em {
  color: #607a89;
  font-size: 7px;
  font-style: normal;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.profile-metrics article > svg {
  width: 16px;
  color: #51caf5;
}

.profile-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 11px;
  margin-top: 11px;
}

.profile-card {
  padding: 16px;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.card-head h2 {
  margin: 4px 0 0;
  color: #dce7eb;
  font-size: 18px;
  font-weight: 590;
}

.card-head > svg {
  width: 20px;
  color: #55cef8;
}

.card-head > span {
  color: #657d8c;
  font-size: 8px;
}

.setting-row,
.data-row,
.admin-profile-field-row {
  min-height: 58px;
  border-top: 1px solid rgba(255, 255, 255, .045);
}

.setting-row,
.data-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.setting-row strong,
.data-row strong {
  display: block;
  color: #b8c7ce;
  font-size: 9px;
  font-weight: 560;
}

.setting-row small,
.data-row small {
  display: block;
  margin-top: 3px;
  color: #627986;
  font-size: 7.5px;
}

.setting-row input {
  width: 38px;
  height: 20px;
  accent-color: #28c9f8;
}

.profile-field {
  margin-top: 11px;
}

.profile-field select {
  min-height: 40px;
}

.data-row button {
  border: 1px solid rgba(76, 176, 223, .12);
  border-radius: 8px;
  background: rgba(6, 36, 56, .45);
  padding: 6px 9px;
  color: #70caec;
  font-size: 7.5px;
  cursor: pointer;
}

.profile-savebar {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
}

.profile-savebar > div {
  display: flex;
  align-items: center;
  gap: 9px;
}

.profile-savebar strong {
  display: block;
  color: #abbac2;
  font-size: 9px;
}

.profile-savebar small {
  display: block;
  margin-top: 2px;
  color: #607683;
  font-size: 7px;
}

.logout-button {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  border: 1px solid rgba(255, 102, 113, .11);
  border-radius: 13px;
  background: rgba(111, 28, 36, .055);
  padding: 10px 13px;
  color: #b7777d;
  cursor: pointer;
}

.logout-button svg {
  width: 18px;
}

.logout-button span {
  display: grid;
  gap: 2px;
  text-align: left;
}

.logout-button strong {
  font-size: 9px;
  font-weight: 560;
}

.logout-button small {
  color: #795e63;
  font-size: 7px;
}


/* ==========================================
   17. PERFIL — UTILIZADOR
========================================== */

.user-profile-metrics {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.session-options {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.session-options button {
  min-height: 74px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 4px;
  border: 1px solid rgba(72, 167, 212, .14);
  border-radius: 11px;
  background: rgba(3, 15, 27, .72);
  color: #778f9d;
  cursor: pointer;
}

.session-options button.active {
  border-color: rgba(55, 209, 255, .58);
  background: rgba(9, 89, 137, .26);
  color: #5de0ff;
  box-shadow: inset 0 0 18px rgba(38, 188, 239, .09), 0 0 16px rgba(29, 166, 230, .1);
}

.session-options svg {
  width: 18px;
}

.session-options strong {
  font-size: 10px;
}

.session-options small {
  color: #5e7a8b;
  font-size: 6px;
  letter-spacing: .07em;
}

.responsible-inline {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 9px;
  border: 1px solid rgba(72, 175, 220, .12);
  border-radius: 10px;
  background: rgba(7, 41, 65, .16);
  padding: 9px;
}

.responsible-inline svg {
  width: 18px;
  color: #54cdf8;
}

.responsible-inline span {
  display: grid;
  gap: 2px;
}

.responsible-inline strong {
  color: #aebdc4;
  font-size: 8px;
}

.responsible-inline small {
  color: #617987;
  font-size: 7px;
}


/* ==========================================
   18. PERFIL — ADMIN
========================================== */

.profile-hero-admin {
  min-height: 210px;
}

.profile-avatar-admin {
  border-color: rgba(56, 204, 255, .85);
}

.admin-state {
  color: #48e4aa;
}

.admin-profile-metrics {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.admin-profile-grid {
  grid-template-columns: 1fr 1fr;
}

.admin-profile-field-row {
  display: grid;
  grid-template-columns: 145px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
}

.admin-profile-field-row span {
  color: #718795;
  font-size: 8px;
}

.admin-profile-field-row strong {
  overflow: hidden;
  color: #b8c7ce;
  font-size: 9px;
  font-weight: 560;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.permission-grid,
.tool-grid,
.admin-tool-links {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.permission-grid > div,
.tool-grid > div,
.admin-tool-links > a {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  min-height: 64px;
  border: 1px solid rgba(80, 170, 214, .1);
  border-radius: 10px;
  background: rgba(255, 255, 255, .014);
  padding: 9px;
}

.permission-grid > div > svg,
.tool-grid > div > svg,
.admin-tool-links > a > svg:first-child {
  width: 20px;
  color: #50cef9;
}

.permission-grid span,
.tool-grid span,
.admin-tool-links span {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.permission-grid strong,
.tool-grid strong,
.admin-tool-links strong {
  color: #b8c7ce;
  font-size: 8px;
  font-weight: 570;
}

.permission-grid small,
.tool-grid small,
.admin-tool-links small {
  color: #5e7684;
  font-size: 7px;
  line-height: 1.35;
}

.permission-grid b {
  border: 1px solid rgba(64, 225, 165, .18);
  border-radius: 999px;
  background: rgba(28, 111, 81, .1);
  padding: 4px 6px;
  color: #56dfae;
  font-size: 6px;
  font-weight: 700;
}

.tool-grid > div {
  grid-template-columns: 34px minmax(0, 1fr);
}

.admin-tool-links > a > svg:last-child {
  width: 14px;
  color: #52caf5;
}

.profile-admin-tools {
  grid-column: 1 / -1;
}


/* ==========================================
   19. ADMIN — CENTRO DE CONTROLO
========================================== */

.admin-page {
  width: min(var(--page-width), calc(100% - 42px));
}

.admin-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 12px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background:
    linear-gradient(90deg, rgba(3, 14, 27, .94), rgba(3, 19, 35, .58)),
    url("/assets/neuro-win-sports-bg.png") center / cover no-repeat;
  padding: 24px;
}

.admin-header h1 {
  margin: 7px 0 0;
  font-size: 38px;
  font-weight: 610;
  letter-spacing: -.04em;
}

.admin-header p {
  margin: 7px 0 0;
  color: #7b919e;
  font-size: 9px;
}

.admin-actions {
  display: flex;
  gap: 8px;
}

.admin-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 9px;
}

.admin-stats article {
  display: grid;
  min-height: 88px;
  align-content: center;
  padding: 13px 15px;
}

.admin-stats span {
  color: #617988;
  font-size: 7px;
  letter-spacing: .1em;
}

.admin-stats strong {
  margin-top: 5px;
  font-size: 24px;
  font-weight: 600;
}

.admin-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(340px, .7fr);
  gap: 10px;
  margin-top: 10px;
}

.admin-panel {
  padding: 14px;
}

.admin-user-list,
.security-list {
  display: grid;
  gap: 7px;
}

.admin-user {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  border: 1px solid rgba(255, 255, 255, .045);
  border-radius: 11px;
  background: rgba(255, 255, 255, .017);
  padding: 9px;
}

.admin-user-avatar {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid rgba(78, 193, 240, .14);
  border-radius: 10px;
  background: rgba(25, 96, 135, .09);
  color: #63cff5;
  font-size: 8px;
  font-weight: 700;
}

.admin-user-copy {
  min-width: 0;
}

.admin-user-copy strong {
  display: block;
  overflow: hidden;
  color: #bdc9cf;
  font-size: 8.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-user-copy small,
.admin-user-copy span {
  display: block;
  margin-top: 2px;
  overflow: hidden;
  color: #607683;
  font-size: 7px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-badge {
  border: 1px solid rgba(255, 255, 255, .06);
  border-radius: 999px;
  padding: 5px 7px;
  color: #8799a2;
  font-size: 6.5px;
}

.status-badge.active {
  border-color: rgba(64, 225, 165, .17);
  color: #59dcae;
}

.status-badge.blocked {
  border-color: rgba(255, 101, 112, .17);
  color: #d77b83;
}

.admin-user-actions {
  display: flex;
  gap: 5px;
}

.admin-user-actions button {
  border: 1px solid rgba(255, 255, 255, .06);
  border-radius: 7px;
  background: rgba(255, 255, 255, .018);
  padding: 6px 7px;
  color: #788d98;
  font-size: 6.5px;
  cursor: pointer;
}

.admin-user-actions button.danger {
  border-color: rgba(255, 92, 104, .13);
  color: #ce727a;
}

.admin-user-actions button.success {
  border-color: rgba(76, 228, 174, .13);
  color: #62d8ad;
}

.security-event {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, .04);
  padding: 8px 2px;
}

.security-event strong {
  display: block;
  color: #aebdc4;
  font-size: 8px;
  font-weight: 540;
}

.security-event small {
  display: block;
  margin-top: 2px;
  color: #5e7481;
  font-size: 6.5px;
}

.security-event time {
  color: #596f7c;
  font-size: 6.5px;
}

.empty-state {
  padding: 24px;
  color: #657b88;
  font-size: 8px;
  text-align: center;
}


/* ==========================================
   20. TABLET
========================================== */

@media (max-width: 1100px) {
  .home-hero {
    grid-template-columns: 1fr 300px;
  }

  .hero-keywords {
    display: none;
  }

  .home-status-strip,
  .admin-profile-metrics,
  .admin-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .module-card {
    grid-template-columns: 54px minmax(0, 1fr) 34px;
  }

  .module-art {
    display: none;
  }

  .signal-grid-premium,
  .profile-grid,
  .admin-profile-grid,
  .admin-grid {
    grid-template-columns: 1fr;
  }

  .profile-admin-tools {
    grid-column: auto;
  }

  .ai-page-premium {
    grid-template-columns: 230px minmax(0, 1fr);
  }

  .ai-composer {
    left: calc(230px + (100vw - 230px - min(1080px, calc(100vw - 264px))) / 2);
    width: min(1080px, calc(100vw - 264px));
  }

  .ai-prompt-grid {
    grid-template-columns: 1fr;
  }
}


/* ==========================================
   21. MOBILE
========================================== */

@media (max-width: 760px) {
  .app-header {
    min-height: 62px;
    padding-inline: 12px;
  }

  .app-brand small,
  .topbar-icon:first-child {
    display: none;
  }

  .page,
  .admin-page {
    width: calc(100% - 16px);
    padding-top: 8px;
  }

  .bottom-nav {
    left: 0;
    right: 0;
    width: 100%;
    transform: none;
    grid-template-columns: repeat(5, 1fr);
    border-radius: 0;
  }

  .home-hero,
  .signals-hero,
  .ai-header {
    grid-template-columns: 1fr;
  }

  .home-hero {
    min-height: 0;
    padding: 25px 22px;
  }

  .home-hero h1 {
    font-size: 40px;
  }

  .home-hero p {
    font-size: 12px;
  }

  .hero-visual,
  .signals-hero-visual,
  .ai-header-visual {
    display: none;
  }

  .hero-facts {
    gap: 12px;
  }

  .home-status-strip,
  .admin-profile-metrics,
  .admin-stats,
  .user-profile-metrics {
    grid-template-columns: 1fr 1fr;
  }

  .home-module-grid {
    grid-template-columns: 1fr;
  }

  .module-card {
    min-height: 116px;
  }

  .section-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .section-heading p {
    display: none;
  }

  .responsible-banner {
    grid-template-columns: 34px 1fr;
  }

  .responsible-banner a {
    grid-column: 2;
  }

  .signals-hero {
    min-height: 0;
    padding: 24px 21px;
  }

  .signals-hero h1 {
    font-size: 39px;
  }

  .signals-ready {
    position: static;
    width: fit-content;
    margin-top: 13px;
  }

  .signal-card {
    grid-template-columns: 1fr;
  }

  .signal-image {
    min-height: 180px;
  }

  .signal-image span {
    background: linear-gradient(180deg, transparent 50%, rgba(3, 13, 25, .94));
  }

  .ai-page-premium {
    grid-template-columns: 1fr;
    min-height: calc(100vh - 62px);
  }

  .ai-sidebar {
    display: none;
  }

  .ai-header {
    margin: 8px;
    padding: 20px;
  }

  .ai-header h1 {
    font-size: 29px;
  }

  .ai-thread {
    width: calc(100% - 16px);
  }

  .ai-welcome {
    padding: 22px 14px;
  }

  .ai-welcome h2 {
    font-size: 29px;
  }

  .ai-message,
  .ai-message.user {
    width: 96%;
  }

  .ai-composer {
    left: 8px;
    right: 8px;
    bottom: 72px;
    width: auto;
  }

  .profile-hero {
    min-height: 0;
    align-items: flex-start;
    flex-wrap: wrap;
    padding: 22px;
  }

  .profile-avatar {
    width: 86px;
    height: 86px;
    font-size: 28px;
  }

  .profile-identity h1 {
    font-size: 27px;
  }

  .profile-state {
    margin: 0 0 0 108px;
  }

  .permission-grid,
  .tool-grid,
  .admin-tool-links,
  .session-options {
    grid-template-columns: 1fr 1fr;
  }

  .admin-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .admin-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .admin-user {
    grid-template-columns: 38px minmax(0, 1fr) auto;
  }

  .admin-user-actions {
    grid-column: 2 / -1;
  }
}

@media (max-width: 500px) {
  .home-status-strip,
  .admin-profile-metrics,
  .admin-stats,
  .user-profile-metrics {
    grid-template-columns: 1fr;
  }

  .home-hero h1 {
    font-size: 34px;
  }

  .hero-facts {
    display: grid;
    gap: 8px;
  }

  .module-card {
    grid-template-columns: 48px minmax(0, 1fr) 30px;
    padding: 14px;
  }

  .module-icon {
    width: 46px;
    height: 46px;
  }

  .permission-grid,
  .tool-grid,
  .admin-tool-links,
  .session-options {
    grid-template-columns: 1fr;
  }

  .profile-savebar {
    align-items: stretch;
    flex-direction: column;
  }

  .profile-savebar .primary-button {
    width: 100%;
  }

  .admin-profile-field-row {
    grid-template-columns: 1fr;
    gap: 4px;
    padding: 9px 0;
  }

  .admin-user {
    grid-template-columns: 34px minmax(0, 1fr);
  }

  .admin-user .status-badge,
  .admin-user-actions {
    grid-column: 2;
  }

  .security-event {
    grid-template-columns: 9px 1fr;
  }

  .security-event time {
    grid-column: 2;
  }
}


/* ==========================================
   22. ACESSIBILIDADE
========================================== */

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: .001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .001ms !important;
  }
}

```
