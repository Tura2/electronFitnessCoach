// src/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  /* ---- Trainees ---- */
  listTrainees: () => ipcRenderer.invoke('trainees:list'),
  createTrainee: (data) => ipcRenderer.invoke('trainees:create', data),
  updateTrainee: (id, data) => ipcRenderer.invoke('trainees:update', { id, data }),
  deleteTrainee: (id) => ipcRenderer.invoke('trainees:delete', id),

  /* ---- Sessions (Practices) ---- */
  listSessions: (start, end) => ipcRenderer.invoke('sessions:list', { start, end }),
  createSession: (data) => ipcRenderer.invoke('sessions:create', data),
  updateSession: (id, data) => ipcRenderer.invoke('sessions:update', { id, data }),
  // alsoDeleteGoogle=true will remove the mirrored Google event if it exists
  deleteSession: (id, alsoDeleteGoogle = true) =>
    ipcRenderer.invoke('sessions:delete', { id, alsoDeleteGoogle }),

  /* ---- Messages / Invites (Google only) ---- */
  listInvitesWeek: (start, end) => ipcRenderer.invoke('invites:listWeek', { start, end }),
  sendInviteGoogle: (sessionId) => ipcRenderer.invoke('invites:sendGoogle', sessionId),
  sendAllInvitesGoogle: (start, end) =>
    ipcRenderer.invoke('invites:sendAllGoogle', { start, end }),

  /* ---- Google Calendar helpers ---- */
  // Load Google events for the visible range (used to overlay on the calendar)
  listGoogleEvents: (start, end) =>
    ipcRenderer.invoke('google:listEvents', { start, end }),
  // Create/update the mirrored Google event for a session.
  // withAttendee=true will also add the athlete as an attendee and trigger Google invite emails.
  upsertGoogleForSession: (sessionId, withAttendee = false) =>
    ipcRenderer.invoke('google:upsertSession', { sessionId, withAttendee }),
  // Remove the mirrored Google event for a given local session
  deleteGoogleForSession: (sessionId) =>
    ipcRenderer.invoke('google:deleteForSession', sessionId),

  /* ---- History ---- */
  historyList: (start, end) => ipcRenderer.invoke('history:list', { start, end }),

  /* ---- Settings ---- */
  getSettings: (keys) => ipcRenderer.invoke('settings:bulkGet', keys),
  setSettings: (obj) => ipcRenderer.invoke('settings:bulkSet', obj),
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', { key, value }),
});
