const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { openDb } = require('./db');
const { v4: uuid } = require('uuid');

let db;

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 780,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (!app.isPackaged) win.webContents.openDevTools({ mode: 'bottom' });
}

app.whenReady().then(() => {
  db = openDb(app);
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers (Trainees CRUD) ---
function registerIpc() {
  ipcMain.handle('trainees:list', () => {
    const stmt = db.prepare(`SELECT * FROM trainees ORDER BY created_at DESC`);
    return stmt.all();
  });

  ipcMain.handle('trainees:create', (_e, payload) => {
    const id = uuid();
    const { first_name, last_name = '', email = '', phone = '', status = 'active' } = payload || {};
    const stmt = db.prepare(`
      INSERT INTO trainees (id, first_name, last_name, email, phone, status)
      VALUES (@id, @first_name, @last_name, @email, @phone, @status)
    `);
    stmt.run({ id, first_name, last_name, email, phone, status });
    return { ok: true, id };
  });

  ipcMain.handle('trainees:update', (_e, { id, data }) => {
    const fields = ['first_name','last_name','email','phone','status'];
    const sets = [];
    const params = { id };
    for (const f of fields) {
      if (data[f] !== undefined) { sets.push(`${f}=@${f}`); params[f] = data[f]; }
    }
    if (!sets.length) return { ok: false, error: 'No fields to update' };
    const stmt = db.prepare(`UPDATE trainees SET ${sets.join(', ')} WHERE id=@id`);
    stmt.run(params);
    return { ok: true };
  });

  ipcMain.handle('trainees:delete', (_e, id) => {
    const stmt = db.prepare(`DELETE FROM trainees WHERE id=@id`);
    stmt.run({ id });
    return { ok: true };
  });
}
