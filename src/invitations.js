const { google } = require('googleapis');
const http = require('http');
const { shell } = require('electron');
const { v4: uuid } = require('uuid');

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];
const LOCAL_REDIRECT = 'http://127.0.0.1:5174/oauth2callback';
const DEFAULT_MIN_INTERVAL_MS = 1200;

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

async function getGoogleClient(db) {
  const envId = process.env.GOOGLE_CLIENT_ID || '';
  const envSecret = process.env.GOOGLE_CLIENT_SECRET || '';

  const storedId = getSetting(db, 'google.clientId', '');
  const storedSecret = getSetting(db, 'google.clientSecret', '');

  const clientId = storedId || envId;
  const clientSecret = storedSecret || envSecret;

  if (!clientId) throw new Error('Google login unavailable (missing clientId).');

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret || undefined, LOCAL_REDIRECT);

  oAuth2Client.on('tokens', (tokens) => {
    if (!tokens) return;
    const prev = getSetting(db, 'google.tokens', {}) || {};
    setSetting(db, 'google.tokens', { ...prev, ...tokens });
  });

  const storedTokens = getSetting(db, 'google.tokens', null);
  if (storedTokens?.access_token || storedTokens?.refresh_token) {
    oAuth2Client.setCredentials(storedTokens);
    if (!storedId && clientId) setSetting(db, 'google.clientId', clientId);
    if (!storedSecret && clientSecret) setSetting(db, 'google.clientSecret', clientSecret);
    return oAuth2Client;
  }

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
        } else { res.statusCode = 404; res.end('Not found'); }
      } catch (e) { srv.close(); reject(e); }
    });
    srv.listen(5174, '127.0.0.1', () => shell.openExternal(authUrl));
    srv.on('error', reject);
  });

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  setSetting(db, 'google.tokens', tokens);
  if (!storedId && clientId) setSetting(db, 'google.clientId', clientId);
  if (!storedSecret && clientSecret) setSetting(db, 'google.clientSecret', clientSecret);
  return oAuth2Client;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizeGRange(ev) {
  const start = ev.start?.dateTime || ev.start?.date || null;
  const end = ev.end?.dateTime || ev.end?.date || null;
  return { start, end };
}

const _listCache = new Map();
const _inFlight = new Map();
const LIST_TTL_MS = 60_000;

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
      return { id: ev.id, summary: ev.summary || '(no title)', start, end };
    });
    _listCache.set(key, { ts: Date.now(), items });
    _inFlight.delete(key);
    return items;
  })();

  _inFlight.set(key, p);
  return p;
}

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
    reminders: { useDefault: true }
  };
  if (withAttendee && s.email) body.attendees = [{ email: s.email, displayName: traineeName }];

  const sendUpdates = withAttendee ? 'all' : 'none';
  let eventId = s.google_event_id || null;
  try {
    if (eventId) {
      const resp = await calendar.events.patch({ calendarId, eventId, sendUpdates, requestBody: body });
      eventId = resp?.data?.id || eventId;
    } else {
      const resp = await calendar.events.insert({ calendarId, sendUpdates, requestBody: body });
      eventId = resp?.data?.id;
      if (eventId) db.prepare(`UPDATE sessions SET google_event_id=@eventId WHERE id=@id`).run({ id: sessionId, eventId });
    }
  } catch (e) {
    const is404 = e?.code === 404 || e?.response?.status === 404;
    if (is404) {
      const resp = await calendar.events.insert({ calendarId, sendUpdates, requestBody: body });
      eventId = resp?.data?.id;
      if (eventId) db.prepare(`UPDATE sessions SET google_event_id=@eventId WHERE id=@id`).run({ id: sessionId, eventId });
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
    const is404 = e?.code === 404 || e?.response?.status === 404;
    if (!is404) throw e;
  }
  db.prepare(`UPDATE sessions SET google_event_id=NULL WHERE id=@id`).run({ id: sessionId });
  return { ok: true };
}

async function disconnectGoogle(db) {
  const tokens = getSetting(db, 'google.tokens', null);
  try {
    if (tokens) {
      const clientId = getSetting(db, 'google.clientId', process.env.GOOGLE_CLIENT_ID || '');
      const clientSecret = getSetting(db, 'google.clientSecret', process.env.GOOGLE_CLIENT_SECRET || '');
      const oAuth2Client = new google.auth.OAuth2(clientId || undefined, clientSecret || undefined, LOCAL_REDIRECT);
      oAuth2Client.setCredentials(tokens);
      try { await oAuth2Client.revokeCredentials(); } catch {}
    }
  } finally {
    setSetting(db, 'google.tokens', null);
    _listCache.clear();
  }
  return { ok: true };
}

let _lastCallAt = 0;
async function rateLimited(fn, minIntervalMs) {
  const now = Date.now();
  const waitMs = Math.max(0, _lastCallAt + minIntervalMs - now);
  if (waitMs) await sleep(waitMs);
  const res = await fn();
  _lastCallAt = Date.now();
  return res;
}

function registerInvitesIpc(ipcMain, db) {
  // Make registration idempotent (safe across hot reloads)
  const CHANNELS = [
    'invites:listWeek',
    'invites:sendGoogle',
    'invites:sendAllGoogle',
    'google:listEvents',
    'google:upsertSession',
    'google:deleteForSession',
    'google:disconnect',
  ];
  CHANNELS.forEach(ch => { try { ipcMain.removeHandler(ch); } catch {} });

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

  // NEW: allow disconnecting (clear stored tokens)
  ipcMain.handle('google:disconnect', async () => {
    try {
      setSetting(db, 'google.tokens', null);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  });
}

module.exports = {
  registerInvitesIpc,
  listGoogleEvents,
  upsertGoogleEventForSession,
  deleteGoogleEventForSession,
  disconnectGoogle,
};
