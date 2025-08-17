// src/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listTrainees: () => ipcRenderer.invoke('trainees:list'),
  createTrainee: (data) => ipcRenderer.invoke('trainees:create', data),
  updateTrainee: (id, data) => ipcRenderer.invoke('trainees:update', { id, data }),
  deleteTrainee: (id) => ipcRenderer.invoke('trainees:delete', id),
});
