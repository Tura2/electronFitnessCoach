// src/db.js
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function openDb(app) {
  const dataDir = app.getPath('userData');
  ensureDir(dataDir);
  const dbPath = path.join(dataDir, 'fitcoach.db');

  // Creates the file if it doesn't exist
  const db = new Database(dbPath);

  // Recommended pragmas for local apps
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // ----- Base schema (fresh installs get the latest shape) -----
  db.exec(`
    -- === SCHEMA ===

    CREATE TABLE IF NOT EXISTS trainees (
      id         TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name  TEXT,
      email      TEXT,
      phone      TEXT,
      status     TEXT CHECK(status IN ('invited','active','inactive')) DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id               TEXT PRIMARY KEY,
      trainee_id       TEXT,
      start_time       TEXT,  -- ISO string
      end_time         TEXT,
      location         TEXT,
      status           TEXT,  -- planned/sent/cancelled/completed
      notes            TEXT,
      google_event_id  TEXT,  -- for Google Calendar integration
      FOREIGN KEY (trainee_id) REFERENCES trainees(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS templates (
      id      TEXT PRIMARY KEY,
      name    TEXT NOT NULL,
      subject TEXT NOT NULL,
      body    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sent_messages (
      id           TEXT PRIMARY KEY,
      trainee_id   TEXT,
      template_id  TEXT,
      channel      TEXT,   -- email/sms/whatsapp (future)
      sent_at      TEXT DEFAULT (datetime('now')),
      context_json TEXT,
      FOREIGN KEY (trainee_id) REFERENCES trainees(id) ON DELETE SET NULL,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // ----- Migration for existing DBs that were created before google_event_id existed -----
  try {
    // If the column already exists, SQLite will throw "duplicate column name" and we'll ignore it.
    db.prepare('ALTER TABLE sessions ADD COLUMN google_event_id TEXT').run();
  } catch (_) {
    // ignore if already added
  }

  // ----- Indexes -----
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_trainees_created ON trainees(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_trainees_name ON trainees(first_name, last_name);
    CREATE INDEX IF NOT EXISTS idx_sessions_time ON sessions(start_time, end_time);
    CREATE INDEX IF NOT EXISTS idx_sessions_google ON sessions(google_event_id);
  `);

  return db;
}

module.exports = { openDb };
