// src/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Trainees
  listTrainees: () => ipcRenderer.invoke('trainees:list'),
  createTrainee: (data) => ipcRenderer.invoke('trainees:create', data),
  updateTrainee: (id, data) => ipcRenderer.invoke('trainees:update', { id, data }),
  deleteTrainee: (id) => ipcRenderer.invoke('trainees:delete', id),

  // Sessions
  listSessions: (start, end) => ipcRenderer.invoke('sessions:list', { start, end }),
  createSession: (data) => ipcRenderer.invoke('sessions:create', data),
  updateSession: (id, data) => ipcRenderer.invoke('sessions:update', { id, data }),
  deleteSession: (id) => ipcRenderer.invoke('sessions:delete', id),

  // Invites — Google only
  listInvitesWeek: (start, end) => ipcRenderer.invoke('invites:listWeek', { start, end }),
  sendInviteGoogle: (sessionId) => ipcRenderer.invoke('invites:sendGoogle', sessionId),
  sendAllInvitesGoogle: (start, end) => ipcRenderer.invoke('invites:sendAllGoogle', { start, end }),

  // Settings
  getSetting: (key) => ipcRenderer.invoke('settings:getOne', key),
  getSettings: (keys) => ipcRenderer.invoke('settings:getMany', keys),
  setSettings: (map) => ipcRenderer.invoke('settings:setMany', map),

  // History
  historyList: (start, end) => ipcRenderer.invoke('history:list', { start, end }),
});
