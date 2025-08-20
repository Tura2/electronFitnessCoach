const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { openDb } = require('./db');
const { v4: uuid } = require('uuid');
const { registerInvitesIpc, upsertGoogleEventForSession, deleteGoogleEventForSession } = require('./invitations');
const { registerHistoryIpc } = require('./history');

let db;

function loadLocalEnv() {
  try {
    const fp = path.join(__dirname, 'env.local.json');
    const raw = fs.readFileSync(fp, 'utf8');
    const env = JSON.parse(raw);
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
  } catch {}
}

function getSetting(db, key, fallback = null) {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key=@key').get({ key });
    if (!row) return fallback;
    try { return JSON.parse(row.value); } catch { return row.value; }
  } catch { return fallback; }
}
function setSetting(db, key, value) {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (@key, @value)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run({ key, value: str });
}

function isDev() {
  return !!process.env.VITE_DEV_SERVER_URL || !app.isPackaged;
}

function resolveIcon() {
  const file = process.platform === 'win32' ? 'app.ico' : 'icon-256.png';
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icons', file)        // packaged
    : path.join(__dirname, '..', 'resources', 'icons', file); // dev
}

const iconPath = path.join(__dirname, 'resources', 'icons', 'app.ico');
async function createWindow() {
  app.setAppUserModelId('com.offir.fitnesscoach'); 
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: resolveIcon(),
    title: 'Fitness Coach Calendar',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
   win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    const isExternal = /^https?:\/\//i.test(url) && !url.includes('localhost:5173');
    if (isExternal) { e.preventDefault(); shell.openExternal(url); }
  });
  const devServerURL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
  if (isDev()) {
    await win.loadURL(devServerURL);
    win.webContents.openDevTools({ mode: 'bottom' });
  } else {
    const indexHtml = path.join(__dirname, 'ui', 'dist', 'index.html');
    await win.loadFile(indexHtml);
  }
}

app.whenReady().then(() => {
  loadLocalEnv();
  db = openDb(app);
  registerIpc();
  registerInvitesIpc(ipcMain, db);
  registerHistoryIpc(ipcMain, db);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function registerIpc() {
  ipcMain.handle('trainees:list', () => {
    try {
      const stmt = db.prepare(`
        SELECT id, first_name, last_name, email, phone, status, created_at
        FROM trainees
        ORDER BY created_at DESC
      `);
      return stmt.all();
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('trainees:create', (_e, payload) => {
    try {
      const id = uuid();
      const { first_name, last_name = '', email = '', phone = '', status = 'active' } = payload || {};
      if (!first_name || !String(first_name).trim()) throw new Error('first_name is required');
      const stmt = db.prepare(`
        INSERT INTO trainees (id, first_name, last_name, email, phone, status)
        VALUES (@id, @first_name, @last_name, @email, @phone, @status)
      `);
      stmt.run({
        id,
        first_name: String(first_name).trim(),
        last_name: String(last_name || '').trim(),
        email: String(email || '').trim() || null,
        phone: String(phone || '').trim() || null,
        status
      });
      return { ok: true, id };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('trainees:update', (_e, { id, data }) => {
    try {
      if (!id) throw new Error('id is required');
      const fields = ['first_name','last_name','email','phone','status'];
      const sets = [];
      const params = { id };
      for (const f of fields) {
        if (data?.[f] !== undefined) { sets.push(`${f}=@${f}`); params[f] = data[f]; }
      }
      if (!sets.length) throw new Error('No fields to update');
      const stmt = db.prepare(`UPDATE trainees SET ${sets.join(', ')} WHERE id=@id`);
      const res = stmt.run(params);
      return { ok: res.changes > 0 };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('trainees:delete', (_e, id) => {
    try {
      if (!id) throw new Error('id is required');
      const run = db.transaction((id) => {
        db.prepare(`UPDATE sessions SET trainee_id = NULL WHERE trainee_id = @id`).run({ id });
        db.prepare(`UPDATE sent_messages SET trainee_id = NULL WHERE trainee_id = @id`).run({ id });
        const res = db.prepare(`DELETE FROM trainees WHERE id = @id`).run({ id });
        return res;
      });
      const res = run(id);
      return { ok: res.changes > 0 };
    } catch (e) {
      try {
        const fk = db.prepare('PRAGMA foreign_key_check').all();
        if (fk.length) e.message += ' | foreign_key_check=' + JSON.stringify(fk);
      } catch {}
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('sessions:list', (_e, { start, end } = {}) => {
    try {
      if (start && end) {
        const stmt = db.prepare(`
          SELECT * FROM sessions
          WHERE start_time < @end AND (end_time IS NULL OR end_time > @start)
          ORDER BY start_time ASC
        `);
        return stmt.all({ start, end });
      } else {
        const stmt = db.prepare(`SELECT * FROM sessions ORDER BY start_time ASC`);
        return stmt.all();
      }
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('sessions:create', async (_e, payload) => {
    try {
      const id = uuid();
      const {
        trainee_id = null,
        start_time,
        end_time,
        notes = '',
        status = 'planned',
        syncGoogle = false
      } = payload || {};
      if (!start_time) throw new Error('start_time is required');
      db.prepare(`
        INSERT INTO sessions (id, trainee_id, start_time, end_time, location, status, notes)
        VALUES (@id, @trainee_id, @start_time, @end_time, '', @status, @notes)
      `).run({ id, trainee_id, start_time, end_time: end_time || null, status, notes });
      if (syncGoogle) {
        try { await upsertGoogleEventForSession(db, id, { withAttendee: false }); } catch {}
      }
      return { ok: true, id };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('sessions:update', async (_e, { id, data }) => {
    try {
      if (!id) throw new Error('id is required');
      const fields = ['trainee_id','start_time','end_time','location','status','notes'];
      const sets = [];
      const params = { id };
      for (const f of fields) {
        if (data?.[f] !== undefined) { sets.push(`${f}=@${f}`); params[f] = data[f]; }
      }
      if (!sets.length) throw new Error('No fields to update');
      const res = db.prepare(`UPDATE sessions SET ${sets.join(', ')} WHERE id=@id`).run(params);
      if (data?.syncGoogle) {
        try { await upsertGoogleEventForSession(db, id, { withAttendee: false }); } catch {}
      }
      return { ok: res.changes > 0 };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('sessions:delete', async (_e, { id, alsoDeleteGoogle = true }) => {
    try {
      if (!id) throw new Error('id is required');
      if (alsoDeleteGoogle) { try { await deleteGoogleEventForSession(db, id); } catch {} }
      const res = db.prepare(`DELETE FROM sessions WHERE id=@id`).run({ id });
      return { ok: res.changes > 0 };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('settings:get', (_e, key) => {
    try {
      if (!key) throw new Error('key is required');
      const row = db.prepare(`SELECT value FROM settings WHERE key=@key`).get({ key });
      return { ok: true, value: row?.value ?? null };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('settings:set', (_e, { key, value }) => {
    try {
      if (!key) throw new Error('key is required');
      db.prepare(`
        INSERT INTO settings (key, value) VALUES (@key, @value)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value
      `).run({ key, value: String(value ?? '') });
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('settings:bulkGet', (_e, keys) => {
    try {
      if (!Array.isArray(keys)) throw new Error('keys[] is required');
      const out = {};
      for (const k of keys) out[k] = getSetting(db, k, null);
      return { ok: true, data: out };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('settings:bulkSet', (_e, kv) => {
    try {
      if (!kv || typeof kv !== 'object') throw new Error('object payload required');
      for (const [k, v] of Object.entries(kv)) setSetting(db, k, v);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  
   // --- External links ---
  ipcMain.handle('openExternal', (_e, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      return shell.openExternal(url);
    }
    throw new Error('Invalid URL for openExternal');
  });

  ipcMain.handle('google:disconnect', (_e) => {
    try {
      db.prepare(`DELETE FROM settings WHERE key IN ('google.tokens','google.calendarId')`).run();
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });
}
