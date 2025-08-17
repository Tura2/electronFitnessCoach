// src/invitations.js
const { google } = require('googleapis');
const http = require('http');
const { shell } = require('electron');
const { v4: uuid } = require('uuid');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',            // read/write events
  // 'https://www.googleapis.com/auth/calendar.calendarlist.readonly' // add later if you want to let user choose a calendar dynamically
];
const LOCAL_REDIRECT = 'http://127.0.0.1:5174/oauth2callback';

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

/* -------------------- Google OAuth -------------------- */
async function getGoogleClient(db) {
  const clientId = getSetting(db, 'google.clientId');
  const clientSecret = getSetting(db, 'google.clientSecret');
  if (!clientId || !clientSecret) throw new Error('Google OAuth not configured (Settings → Google).');

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

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  const code = await new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      if (req.url.startsWith('/oauth2callback')) {
        const u = new URL(req.url, LOCAL_REDIRECT);
        const code = u.searchParams.get('code');
        res.end('You can close this window.');
        srv.close(); resolve(code);
      }
    });
    srv.listen(5174, '127.0.0.1', () => shell.openExternal(authUrl));
    srv.on('error', reject);
  });

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  setSetting(db, 'google.tokens', tokens);
  return oAuth2Client;
}

/* -------------------- Google: list events -------------------- */
async function listGoogleEvents(db, { start, end }) {
  const auth = await getGoogleClient(db);
  const calendar = google.calendar({ version: 'v3', auth });

  const calendarId = getSetting(db, 'google.calendarId', 'primary');

  const { data } = await calendar.events.list({
    calendarId,
    timeMin: start, timeMax: end,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 2500,
  });

  const items = (data.items || []).map(ev => {
    const startISO = ev.start?.dateTime || (ev.start?.date ? new Date(ev.start.date).toISOString() : null);
    const endISO   = ev.end?.dateTime   || (ev.end?.date ? new Date(ev.end.date).toISOString()   : null);
    return {
      id: ev.id,
      summary: ev.summary || '(no title)',
      start: startISO,
      end: endISO,
    };
  });
  return items;
}

/* -------------------- Google: upsert event (no attendees by default) -------------------- */
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
    reminders: { useDefault: true },
    source: { title: 'Fitness Coach App' },
  };
  if (withAttendee && s.email) {
    body.attendees = [{ email: s.email, displayName: traineeName }];
  }

  let eventId = s.google_event_id || null;
  let resp;
  if (eventId) {
    resp = await calendar.events.patch({
      calendarId, eventId,
      sendUpdates: withAttendee ? 'all' : 'none',
      requestBody: body,
    });
    eventId = resp?.data?.id || eventId;
  } else {
    resp = await calendar.events.insert({
      calendarId,
      sendUpdates: withAttendee ? 'all' : 'none',
      requestBody: body,
    });
    eventId = resp?.data?.id;
    if (eventId) {
      db.prepare(`UPDATE sessions SET google_event_id=@eventId WHERE id=@id`).run({ id: sessionId, eventId });
    }
  }

  // mark as sent only when we actually invite attendee
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

/* -------------------- Google: delete by session -------------------- */
async function deleteGoogleEventForSession(db, sessionId) {
  const s = joinSession(db, sessionId);
  if (!s?.google_event_id) return { ok: true, skipped: true };

  const calendarId = getSetting(db, 'google.calendarId', 'primary');
  const auth = await getGoogleClient(db);
  const calendar = google.calendar({ version: 'v3', auth });

  await calendar.events.delete({ calendarId, eventId: s.google_event_id, sendUpdates: 'all' });
  db.prepare(`UPDATE sessions SET google_event_id=NULL WHERE id=@id`).run({ id: sessionId });
  return { ok: true };
}

/* -------------------- Invites (Messages page) -------------------- */
async function sendInviteGoogle(db, sessionId) {
  // just reuse upsert with attendee
  return upsertGoogleEventForSession(db, sessionId, { withAttendee: true });
}

/* -------------------- IPC -------------------- */
function registerInvitesIpc(ipcMain, db) {
  ipcMain.handle('invites:listWeek', (_e, { start, end }) => listSessionsForRange(db, start, end));
  ipcMain.handle('invites:sendGoogle', async (_e, sessionId) => {
    try { return await sendInviteGoogle(db, sessionId); }
    catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('invites:sendAllGoogle', async (_e, { start, end }) => {
    const rows = listSessionsForRange(db, start, end);
    const results = [];
    for (const r of rows) {
      try { results.push({ id: r.id, ...(await sendInviteGoogle(db, r.id)) }); }
      catch (e) { results.push({ id: r.id, ok: false, error: e.message }); }
    }
    return results;
  });

  // new:
  ipcMain.handle('google:listEvents', async (_e, { start, end }) => {
    try { return { ok: true, items: await listGoogleEvents(db, { start, end }) }; }
    catch (e) { return { ok: false, error: e.message, items: [] }; }
  });
  ipcMain.handle('google:upsertSession', async (_e, { sessionId, withAttendee = false }) => {
    try { return await upsertGoogleEventForSession(db, sessionId, { withAttendee }); }
    catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('google:deleteForSession', async (_e, sessionId) => {
    try { return await deleteGoogleEventForSession(db, sessionId); }
    catch (e) { return { ok: false, error: e.message }; }
  });
}

module.exports = {
  registerInvitesIpc,
  upsertGoogleEventForSession,
  deleteGoogleEventForSession
};
