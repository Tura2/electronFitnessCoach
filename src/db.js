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
  const db = new Database(dbPath);

  // יצירת טבלאות אם לא קיימות
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS trainees (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT,
      email TEXT,
      phone TEXT,
      status TEXT CHECK(status IN('invited','active','inactive')) DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      trainee_id TEXT,
      start_time TEXT,  -- ISO string
      end_time   TEXT,
      location   TEXT,
      status     TEXT,  -- planned/sent/cancelled/completed
      notes      TEXT,
      FOREIGN KEY (trainee_id) REFERENCES trainees(id)
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sent_messages (
      id TEXT PRIMARY KEY,
      trainee_id TEXT,
      template_id TEXT,
      channel TEXT,         -- email/sms/whatsapp (עתידי)
      sent_at TEXT DEFAULT (datetime('now')),
      context_json TEXT,
      FOREIGN KEY (trainee_id) REFERENCES trainees(id),
      FOREIGN KEY (template_id) REFERENCES templates(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  return db;
}

module.exports = { openDb };
