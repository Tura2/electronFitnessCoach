// src/invitations.js
const { google } = require('googleapis');
const http = require('http');
const { shell } = require('electron');
const { v4: uuid } = require('uuid');

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];
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

/* ---------- Google Calendar (OAuth) ---------- */
async function getGoogleClient(db) {
  const clientId = getSetting(db, 'google.clientId');
  const clientSecret = getSetting(db, 'google.clientSecret');
  if (!clientId || !clientSecret) throw new Error('Google OAuth not configured (Settings → Google).');

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, LOCAL_REDIRECT);

  const stored = getSetting(db, 'google.tokens', null);
  if (stored && stored.access_token) {
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

async function sendInviteGoogle(db, sessionId) {
  const session = joinSession(db, sessionId);
  if (!session) throw new Error('Session not found');

  // We need athlete email to send an attendee invite.
  if (!session.email) throw new Error('This athlete has no email');

  const tz = getSetting(db, 'calendar.tz', 'Asia/Jerusalem');
  const coachName = getSetting(db, 'coach.name', 'Fitness Coach');
  const calendarId = getSetting(db, 'google.calendarId', 'primary');

  const auth = await getGoogleClient(db);
  const calendar = google.calendar({ version: 'v3', auth });

  const start = session.start_time;
  const end = session.end_time || new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();
  const traineeName = `${session.first_name || ''} ${session.last_name || ''}`.trim() || 'Athlete';

  const resp = await calendar.events.insert({
    calendarId,
    sendUpdates: 'all',
    requestBody: {
      summary: `Training with ${coachName}`,
      description: session.notes || '',
      start: { dateTime: start, timeZone: tz },
      end:   { dateTime: end,   timeZone: tz },
      attendees: [{ email: session.email, displayName: traineeName }],
      reminders: { useDefault: true },
      source: { title: 'Fitness Coach App' },
    },
  });

  markSent(db, sessionId, 'google-calendar', { eventId: resp.data.id });
  return { ok: true, eventId: resp.data.id };
}

/* ---------- Common helpers ---------- */
function markSent(db, sessionId, channel, extra = {}) {
  db.prepare(`UPDATE sessions SET status='sent' WHERE id=@id`).run({ id: sessionId });
  db.prepare(`
    INSERT INTO sent_messages (id, trainee_id, template_id, channel, context_json)
    VALUES (@id, @trainee_id, NULL, @channel, @ctx)
  `).run({
    id: uuid(),
    trainee_id: joinSession(db, sessionId)?.trainee_id || null,
    channel,
    ctx: JSON.stringify({ sessionId, ...extra, at: new Date().toISOString() }),
  });
}

/* ---------- IPC registration ---------- */
function registerInvitesIpc(ipcMain, db) {
  ipcMain.handle('invites:listWeek', (_e, { start, end }) => listSessionsForRange(db, start, end));

  // Google only
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
}

module.exports = { registerInvitesIpc };
