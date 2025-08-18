// src/preload.js
(() => {
  'use strict';

  // --- Try to get Electron APIs safely (works with/without sandbox) ---
  let electron = {};
  try { electron = require('electron'); } catch (_) { /* require may be unavailable in sandboxed bundles */ }

  const contextBridge = electron.contextBridge;
  const ipcRenderer   = electron.ipcRenderer;

  // If ipcRenderer is missing, make a stub that throws a helpful error
  const ipc = ipcRenderer || {
    invoke: () => Promise.reject(new Error('[preload] ipcRenderer is not available. Check BrowserWindow.webPreferences (preload path, sandbox, nodeIntegration).')),
    on: () => {},
    removeAllListeners: () => {}
  };

  // Expose helper that falls back to window if contextBridge is unavailable
  function expose(name, api) {
    if (contextBridge && typeof contextBridge.exposeInMainWorld === 'function' && process?.contextIsolated) {
      try { contextBridge.exposeInMainWorld(name, api); return; } catch (_) {}
    }
    // Fallback (e.g., sandboxed preload that inlines into renderer)
    try { Object.defineProperty(window, name, { value: api, writable: false }); }
    catch { window[name] = api; }
  }

  // --- Small wrapper to keep call sites clean ---
  const inv = (channel, payload) => ipc.invoke(channel, payload);

  // ---- API object (matches your main.js IPC channels) ----
  const api = {
    /* ---- Trainees ---- */
    listTrainees: () => inv('trainees:list'),
    createTrainee: (data) => inv('trainees:create', data),
    updateTrainee: (id, data) => inv('trainees:update', { id, data }),
    deleteTrainee: (id) => inv('trainees:delete', id),

    /* ---- Sessions (Practices) ---- */
    listSessions: (start, end) => inv('sessions:list', { start, end }),
    createSession: (data) => inv('sessions:create', data),
    updateSession: (id, data) => inv('sessions:update', { id, data }),
    deleteSession: (id, alsoDeleteGoogle = true) =>
      inv('sessions:delete', { id, alsoDeleteGoogle }),

    /* ---- Messages / Invites (Google only) ---- */
    listInvitesWeek: (start, end) => inv('invites:listWeek', { start, end }),
    sendInviteGoogle: (sessionId) => inv('invites:sendGoogle', sessionId),
    sendAllInvitesGoogle: (start, end) =>
      inv('invites:sendAllGoogle', { start, end }),

    /* ---- Google Calendar helpers ---- */
    listGoogleEvents: (start, end) =>
      inv('google:listEvents', { start, end }),
    googleUpsertSession: (sessionId, withAttendee = false) =>
      inv('google:upsertSession', { sessionId, withAttendee }),
    googleDeleteForSession: (sessionId) =>
      inv('google:deleteForSession', sessionId),

    // Back-compat aliases (your earlier names)
    upsertGoogleForSession: (sessionId, withAttendee = false) =>
      inv('google:upsertSession', { sessionId, withAttendee }),
    deleteGoogleForSession: (sessionId) =>
      inv('google:deleteForSession', sessionId),

    /* ---- History ---- */
    historyList: (start, end) => inv('history:list', { start, end }),

    /* ---- Settings ---- */
    getSettings: (keys) => inv('settings:bulkGet', keys),
    setSettings: (obj) => inv('settings:bulkSet', obj),
    getSetting: (key) => inv('settings:get', key),
    setSetting: (key, value) => inv('settings:set', { key, value }),
  };

  expose('api', api);

  // Optional: quick sanity log in dev
  try {
    if (process?.env?.NODE_ENV !== 'production') {
      console.debug('[preload] API exposed. contextIsolated=%s sandbox?%s',
        String(process?.contextIsolated),
        typeof process?.sandboxed === 'boolean' ? String(process.sandboxed) : 'unknown'
      );
    }
  } catch {}
})();
