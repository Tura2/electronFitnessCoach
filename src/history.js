// src/history.js
// History queries + lightweight migration for sent_messages.session_id

function migrateHistory(db) {
  // Add session_id column if missing; ignore if it already exists
  try { db.exec(`ALTER TABLE sent_messages ADD COLUMN session_id TEXT`); } catch (_) {}
  // Indexes for speed
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sent_messages_session ON sent_messages(session_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sent_messages_sentat ON sent_messages(sent_at)`);

  // Best-effort backfill from context_json (requires SQLite JSON1, typically available)
  try {
    db.exec(`
      UPDATE sent_messages
      SET session_id = json_extract(context_json, '$.sessionId')
      WHERE (session_id IS NULL OR session_id = '')
        AND context_json IS NOT NULL
        AND json_valid(context_json) = 1
        AND json_extract(context_json, '$.sessionId') IS NOT NULL
    `);
  } catch (_) { /* if json1 unavailable, skip */ }
}

// Convert anything to ISO (start-of-day), end exclusive ISO (end-of-day +1)
function toRangeISO({ start, end }) {
  const s = start ? new Date(start) : new Date(Date.now() - 30*864e5);
  const e = end ? new Date(end) : new Date();
  const s0 = new Date(s); s0.setHours(0,0,0,0);
  const e0 = new Date(e); e0.setHours(0,0,0,0); e0.setDate(e0.getDate()+1);
  return { startISO: s0.toISOString(), endISO: e0.toISOString() };
}

function registerHistoryIpc(ipcMain, db) {
  migrateHistory(db);

  // List "sent" sessions grouped by session, with participants count in date range
  ipcMain.handle('history:list', (_e, { start, end } = {}) => {
    const { startISO, endISO } = toRangeISO({ start, end });

    // Use a CTE to normalize session_id (either column or from context_json)
    const sql = `
      WITH sm AS (
        SELECT
          COALESCE(session_id,
                   CASE
                     WHEN context_json IS NOT NULL
                          AND json_valid(context_json) = 1
                     THEN json_extract(context_json, '$.sessionId')
                     ELSE NULL
                   END) AS sid,
          trainee_id,
          sent_at
        FROM sent_messages
      )
      SELECT
        s.id,
        s.start_time,
        s.end_time,
        s.location,
        COUNT(DISTINCT sm.trainee_id) AS participants,
        MIN(sm.sent_at) AS first_sent_at,
        MAX(sm.sent_at) AS last_sent_at
      FROM sm
      JOIN sessions s ON s.id = sm.sid
      WHERE sm.sid IS NOT NULL
        AND sm.sent_at >= @start AND sm.sent_at < @end
      GROUP BY s.id
      ORDER BY s.start_time DESC
    `;
    try {
      const rows = db.prepare(sql).all({ start: startISO, end: endISO });
      return rows;
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

module.exports = { registerHistoryIpc };
