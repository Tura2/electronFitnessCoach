(() => {
  'use strict';

  let electron = {};
  try { electron = require('electron'); } catch (_) {}

  const contextBridge = electron.contextBridge;
  const ipcRenderer   = electron.ipcRenderer;

  const ipc = ipcRenderer || {
    invoke: () => Promise.reject(new Error('[preload] ipcRenderer is not available.')),
    on: () => {},
    removeAllListeners: () => {}
  };

  function expose(name, api) {
    if (contextBridge && typeof contextBridge.exposeInMainWorld === 'function' && process?.contextIsolated) {
      try { contextBridge.exposeInMainWorld(name, api); return; } catch (_) {}
    }
    try { Object.defineProperty(window, name, { value: api, writable: false }); }
    catch { window[name] = api; }
  }

  const inv = (channel, payload) => ipc.invoke(channel, payload);

  const api = {
    /* Trainees */
    listTrainees: () => inv('trainees:list'),
    createTrainee: (data) => inv('trainees:create', data),
    updateTrainee: (id, data) => inv('trainees:update', { id, data }),
    deleteTrainee: (id) => inv('trainees:delete', id),

    /* Sessions */
    listSessions: (start, end) => inv('sessions:list', { start, end }),
    createSession: (data) => inv('sessions:create', data),
    updateSession: (id, data) => inv('sessions:update', { id, data }),
    deleteSession: (id, alsoDeleteGoogle = true) => inv('sessions:delete', { id, alsoDeleteGoogle }),

    /* Invites */
    listInvitesWeek: (start, end) => inv('invites:listWeek', { start, end }),
    sendInviteGoogle: (sessionId) => inv('invites:sendGoogle', sessionId),
    sendAllInvitesGoogle: (start, end) => inv('invites:sendAllGoogle', { start, end }),

    /* Google Calendar */
    listGoogleEvents: (start, end) => inv('google:listEvents', { start, end }),
    googleUpsertSession: (sessionId, withAttendee = false) => inv('google:upsertSession', { sessionId, withAttendee }),
    googleDeleteForSession: (sessionId) => inv('google:deleteForSession', sessionId),
    upsertGoogleForSession: (sessionId, withAttendee = false) => inv('google:upsertSession', { sessionId, withAttendee }),
    deleteGoogleForSession: (sessionId) => inv('google:deleteForSession', sessionId),
    googleDisconnect: () => inv('google:disconnect'),

    /* History */
    historyList: (start, end) => inv('history:list', { start, end }),

    /* Settings */
    getSettings: (keys) => inv('settings:bulkGet', keys),
    setSettings: (obj) => inv('settings:bulkSet', obj),
    getSetting: (key) => inv('settings:get', key),
    setSetting: (key, value) => inv('settings:set', { key, value }),
  };

  expose('api', api);

  (async () => {
    try {
      const res = await inv('settings:get', 'ui.theme');
      const saved = typeof res?.value === 'string' ? res.value : null;
      const mode = (saved === 'light' || saved === 'dark') ? saved : 'dark';
      document.documentElement.setAttribute('data-theme', mode);
    } catch {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  })();
})();
