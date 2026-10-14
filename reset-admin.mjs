import crypto from "node:crypto";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const email = String(process.env.ADMIN_EMAIL || "")
  .trim()
  .toLowerCase();

const password = String(process.env.ADMIN_PASSWORD || "");

if (!email) {
  throw new Error("ADMIN_EMAIL não está definido no .env");
}

if (password.length < 8) {
  throw new Error("ADMIN_PASSWORD tem de ter pelo menos 8 caracteres");
}

const db = new Database("data/neurowin.sqlite");

const passwordHash = bcrypt.hashSync(password, 12);
const now = new Date().toISOString();

// Ver se já existe admin
const existingAdmin = db
  .prepare("SELECT * FROM users WHERE role = 'admin' LIMIT 1")
  .get();

if (existingAdmin) {
  db.prepare(`
    UPDATE users
    SET email = ?,
        password_hash = ?,
        status = 'active',
        updated_at = ?
    WHERE id = ?
  `).run(email, passwordHash, now, existingAdmin.id);

  console.log("✓ Conta admin existente atualizada.");
  db.close();
  process.exit(0);
}

// Ver se esse email já existe como utilizador normal
const existingUser = db
  .prepare("SELECT * FROM users WHERE email = ? LIMIT 1")
  .get(email);

if (existingUser) {
  db.prepare(`
    UPDATE users
    SET password_hash = ?,
        role = 'admin',
        status = 'active',
        updated_at = ?
    WHERE id = ?
  `).run(passwordHash, now, existingUser.id);

  console.log("✓ Utilizador existente promovido a administrador.");
  db.close();
  process.exit(0);
}

// Não existe ninguém: criar admin
const neurowinId =
  "NW-" + crypto.randomBytes(4).toString("hex").toUpperCase();

db.prepare(`
  INSERT INTO users (
    id,
    neurowin_id,
    name,
    email,
    password_hash,
    role,
    status,
    created_at,
    updated_at,
    last_login_at
  )
  VALUES (?, ?, ?, ?, ?, 'admin', 'active', ?, ?, NULL)
`).run(
  crypto.randomUUID(),
  neurowinId,
  "Administrador NeuroWin",
  email,
  passwordHash,
  now,
  now
);

console.log("✓ Nova conta de administrador criada.");
db.close();