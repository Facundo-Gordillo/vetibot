import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config } from "../config.js";

const dbPath = resolve(config.dbPath);
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

export function ensureColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      animal_type TEXT NOT NULL,
      breed TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      category TEXT CHECK (category IN ('green', 'yellow', 'red')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vet_recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      address TEXT,
      rating REAL,
      distance_meters INTEGER,
      phone TEXT,
      website TEXT,
      open_now INTEGER
    );

    CREATE TABLE IF NOT EXISTS vet_ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      osm_key TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (osm_key, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_vet_ratings_key ON vet_ratings(osm_key);

    CREATE TABLE IF NOT EXISTS follow_ups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      scheduled_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'cancelled')),
      reminder_message TEXT,
      context_summary TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_followups_pending ON follow_ups(status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, id);
  `);

  ensureColumn("users", "lat", "REAL");
  ensureColumn("users", "lng", "REAL");
  // Contador de follow-ups sin respuesta (services/followup.ts). Se define acá
  // (y no como side-effect al importar ese módulo) porque las columnas nuevas
  // deben agregarse DESPUÉS de crear las tablas base, nunca antes.
  ensureColumn("users", "unanswered_followups", "INTEGER DEFAULT 0");
  ensureColumn("vet_recommendations", "osm_key", "TEXT");
  ensureColumn("vet_recommendations", "opening_hours", "TEXT");
  ensureColumn("vet_recommendations", "next_change", "TEXT");
  ensureColumn("vet_recommendations", "sponsored", "INTEGER DEFAULT 0");
  ensureColumn("vet_recommendations", "badge", "TEXT");
  ensureColumn("follow_ups", "delay_hours", "REAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS partners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      vet_name TEXT NOT NULL,
      address TEXT,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      radius_km REAL NOT NULL DEFAULT 5,
      tier INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'none' CHECK (status IN ('none','pending','active','cancelled')),
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      plan_amount INTEGER,
      osm_key TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_partners_status ON partners(status);

    CREATE TABLE IF NOT EXISTS notification_prefs (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      push_enabled INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      keys TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, endpoint)
    );
  `);
}

/** Ejecuta un conjunto de escrituras dentro de una transacción atómica. */
export function withTransaction<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function now(): string {
  return new Date().toISOString();
}