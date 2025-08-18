// src/invitations.js — fixed & hardened
// - Robust Google OAuth (persist/refresh tokens)
// - Cached event listing (TTL + in-flight dedupe)
// - Rate-limited bulk invites to avoid QPM spikes
// - Safe all‑day handling (date vs dateTime)
// - Resilient upsert (patch→insert fallback) and delete
// - IPC handlers return consistent { ok, ... } shapes

const { google } = require('googleapis');
const http = require('http');
const { shell } = require('electron');
const { v4: uuid } = require('uuid');

// ===== Config =====
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events', // read/write events
  // 'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
];
const LOCAL_REDIRECT = 'http://127.0.0.1:5174/oauth2callback';

// Optional: soft rate limit across bulk calls (ms between requests)
// Can be overridden from Settings with key "google.minIntervalMs"
const DEFAULT_MIN_INTERVAL_MS = 1200; // ~50 ops/min

// ===== Small DB helpers =====
function getSetting(db, key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key=@key').get({ key });
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}
function setSetting(db, key, value) {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (@key,@value)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run({ key, value: str });
}

function joinSession(db, sessionId) {
  const sql = `
    SELECT s.*, t.first_name, t.last_name, t.email
    FROM sessions s
    LEFT JOIN trainees t ON t.id = s.trainee_id
    WHERE s.id=@id
  `;
  return db.prepare(sql).get({ id: sessionId });
}

function listSessionsForRange(db, startISO, endISO) {
  const sql = `
    SELECT s.*, t.first_name, t.last_name, t.email
    FROM sessions s
    LEFT JOIN trainees t ON t.id = s.trainee_id
    WHERE s.start_time < @end AND (s.end_time IS NULL OR s.end_time > @start)
    ORDER BY s.start_time ASC
  `;
  return db.prepare(sql).all({ start: startISO, end: endISO });
}

// ===== OAuth client (persists + refreshes tokens) =====
async function getGoogleClient(db) {
  const clientId = getSetting(db, 'google.clientId');
  const clientSecret = getSetting(db, 'google.clientSecret');
  if (!clientId || !clientSecret) throw new Error('Google OAuth not configured (Settings → Google)');

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, LOCAL_REDIRECT);

  // persist refreshed tokens
  oAuth2Client.on('tokens', (tokens) => {
    if (!tokens) return;
    const prev = getSetting(db, 'google.tokens', {}) || {};
    setSetting(db, 'google.tokens', { ...prev, ...tokens });
  });

  const stored = getSetting(db, 'google.tokens', null);
  if (stored && (stored.access_token || stored.refresh_token)) {
    oAuth2Client.setCredentials(stored);
    return oAuth2Client;
  }

  // First-time auth flow
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  const code = await new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        if (req.url.startsWith('/oauth2callback')) {
          const u = new URL(req.url, LOCAL_REDIRECT);
          const err = u.searchParams.get('error');
          if (err) { res.statusCode = 400; res.end('OAuth error: ' + err); srv.close(); return reject(new Error(err)); }
          const code = u.searchParams.get('code');
          res.end('You can close this window.');
          srv.close();
          resolve(code);
        } else {
          res.statusCode = 404; res.end('Not found');
        }
      } catch (e) { srv.close(); reject(e); }
    });
    srv.listen(5174, '127.0.0.1', () => shell.openExternal(authUrl));
    srv.on('error', reject);
  });

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  setSetting(db, 'google.tokens', tokens);
  return oAuth2Client;
}

// ===== Utilities =====
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Normalize Google event start/end to strings the UI expects:
// - all‑day → 'YYYY-MM-DD'
// - timed  → ISO string
function normalizeGRange(ev) {
  const start = ev.start?.dateTime || ev.start?.date || null;
  const end = ev.end?.dateTime || ev.end?.date || null;
  return { start, end };
}

// ===== Cached Google list with in-flight dedupe =====
const _listCache = new Map(); // key -> { ts, items }
const _inFlight = new Map();  // key -> Promise
const LIST_TTL_MS = 60_000;   // 60s

async function listGoogleEvents(db, { start, end }) {
  const key = `${start}|${end}`;
  const now = Date.now();
  const cached = _listCache.get(key);
  if (cached && now - cached.ts < LIST_TTL_MS) return cached.items;
  if (_inFlight.has(key)) return _inFlight.get(key);

  const p = (async () => {
    const auth = await getGoogleClient(db);
    const calendar = google.calendar({ version: 'v3', auth });
    const calendarId = getSetting(db, 'google.calendarId', 'primary');
    const { data } = await calendar.events.list({
      calendarId,
      timeMin: start,
      timeMax: end,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
      fields: 'items(id,summary,start,end)'
    });
    const items = (data.items || []).map(ev => {
      const { start, end } = normalizeGRange(ev);
      return {
        id: ev.id,
        summary: ev.summary || '(no title)',
        start, // 'YYYY-MM-DD' for all‑day, ISO string for timed
        end,
      };
    });
    _listCache.set(key, { ts: Date.now(), items });
    _inFlight.delete(key);
    return items;
  })();

  _inFlight.set(key, p);
  return p;
}

// ===== Resilient upsert / delete =====
async function upsertGoogleEventForSession(db, sessionId, { withAttendee = false } = {}) {
  const s = joinSession(db, sessionId);
  if (!s) throw new Error('Session not found');

  const tz = getSetting(db, 'calendar.tz', 'Asia/Jerusalem');
  const coachName = getSetting(db, 'coach.name', 'Fitness Coach');
  const calendarId = getSetting(db, 'google.calendarId', 'primary');

  const auth = await getGoogleClient(db);
  const calendar = google.calendar({ version: 'v3', auth });

  const start = s.start_time;
  const end = s.end_time || new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();
  const traineeName = `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Athlete';

  const body = {
    summary: `Training with ${coachName}`,
    description: s.notes || '',
    start: { dateTime: start, timeZone: tz },
    end:   { dateTime: end,   timeZone: tz },
    location: s.location || undefined,
    reminders: { useDefault: true },
    source: { title: 'Fitness Coach App', url: 'https://github.com/Tura2/electronFitnessCoach' },
  };
  if (withAttendee && s.email) {
    body.attendees = [{ email: s.email, displayName: traineeName }];
  }

  const sendUpdates = withAttendee ? 'all' : 'none';
  let eventId = s.google_event_id || null;
  try {
    if (eventId) {
      const resp = await calendar.events.patch({ calendarId, eventId, sendUpdates, requestBody: body });
      eventId = resp?.data?.id || eventId;
    } else {
      const resp = await calendar.events.insert({ calendarId, sendUpdates, requestBody: body });
      eventId = resp?.data?.id;
      if (eventId) {
        db.prepare(`UPDATE sessions SET google_event_id=@eventId WHERE id=@id`).run({ id: sessionId, eventId });
      }
    }
  } catch (e) {
    // If event was deleted on Google, patch will 404 → try insert
    const is404 = e?.code === 404 || e?.response?.status === 404;
    if (is404) {
      const resp = await calendar.events.insert({ calendarId, sendUpdates, requestBody: body });
      eventId = resp?.data?.id;
      if (eventId) {
        db.prepare(`UPDATE sessions SET google_event_id=@eventId WHERE id=@id`).run({ id: sessionId, eventId });
      }
    } else {
      throw e;
    }
  }

  if (withAttendee) {
    db.prepare(`UPDATE sessions SET status='sent' WHERE id=@id`).run({ id: sessionId });
    db.prepare(`
      INSERT INTO sent_messages (id, trainee_id, template_id, channel, context_json)
      VALUES (@id, @trainee_id, NULL, 'google-calendar', @ctx)
    `).run({
      id: uuid(),
      trainee_id: s.trainee_id || null,
      ctx: JSON.stringify({ sessionId, eventId, at: new Date().toISOString(), invited: true }),
    });
  }

  return { ok: true, eventId };
}

async function deleteGoogleEventForSession(db, sessionId) {
  const s = joinSession(db, sessionId);
  if (!s?.google_event_id) return { ok: true, skipped: true };

  const calendarId = getSetting(db, 'google.calendarId', 'primary');
  const auth = await getGoogleClient(db);
  const calendar = google.calendar({ version: 'v3', auth });

  try {
    await calendar.events.delete({ calendarId, eventId: s.google_event_id, sendUpdates: 'all' });
  } catch (e) {
    // if already deleted (404), ignore
    const is404 = e?.code === 404 || e?.response?.status === 404;
    if (!is404) throw e;
  }
  db.prepare(`UPDATE sessions SET google_event_id=NULL WHERE id=@id`).run({ id: sessionId });
  return { ok: true };
}

// ===== Simple rate limiter for bulk ops =====
let _lastCallAt = 0;
async function rateLimited(fn, minIntervalMs) {
  const now = Date.now();
  const waitMs = Math.max(0, _lastCallAt + minIntervalMs - now);
  if (waitMs) await sleep(waitMs);
  const res = await fn();
  _lastCallAt = Date.now();
  return res;
}

// ===== IPC =====
function registerInvitesIpc(ipcMain, db) {
  ipcMain.handle('invites:listWeek', (_e, { start, end }) => listSessionsForRange(db, start, end));

  ipcMain.handle('invites:sendGoogle', async (_e, sessionId) => {
    try { return await upsertGoogleEventForSession(db, sessionId, { withAttendee: true }); }
    catch (e) { return { ok: false, error: e.message || String(e) }; }
  });

  ipcMain.handle('invites:sendAllGoogle', async (_e, { start, end }) => {
    const minIntervalMs = Number(getSetting(db, 'google.minIntervalMs', DEFAULT_MIN_INTERVAL_MS)) || DEFAULT_MIN_INTERVAL_MS;
    const rows = listSessionsForRange(db, start, end);
    const results = [];
    for (const r of rows) {
      try {
        const exec = () => upsertGoogleEventForSession(db, r.id, { withAttendee: true });
        const out = await rateLimited(exec, minIntervalMs);
        results.push({ id: r.id, ...out });
      } catch (e) {
        results.push({ id: r.id, ok: false, error: e.message || String(e) });
      }
    }
    return results;
  });

  ipcMain.handle('google:listEvents', async (_e, { start, end }) => {
    try { return { ok: true, items: await listGoogleEvents(db, { start, end }) }; }
    catch (e) { return { ok: false, error: e.message || String(e), items: [] }; }
  });

  ipcMain.handle('google:upsertSession', async (_e, { sessionId, withAttendee = false }) => {
    try { return await upsertGoogleEventForSession(db, sessionId, { withAttendee }); }
    catch (e) { return { ok: false, error: e.message || String(e) }; }
  });

  ipcMain.handle('google:deleteForSession', async (_e, sessionId) => {
    try { return await deleteGoogleEventForSession(db, sessionId); }
    catch (e) { return { ok: false, error: e.message || String(e) }; }
  });
}

module.exports = {
  registerInvitesIpc,
  listGoogleEvents,
  upsertGoogleEventForSession,
  deleteGoogleEventForSession,
};
