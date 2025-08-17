const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Trainees (קיים אצלך)
  listTrainees: () => ipcRenderer.invoke('trainees:list'),
  createTrainee: (data) => ipcRenderer.invoke('trainees:create', data),
  updateTrainee: (id, data) => ipcRenderer.invoke('trainees:update', { id, data }),
  deleteTrainee: (id) => ipcRenderer.invoke('trainees:delete', id),

  // Athletes (trainees)
  listTrainees: () => ipcRenderer.invoke('trainees:list'),
  createTrainee: (data) => ipcRenderer.invoke('trainees:create', data),
  updateTrainee: (id, data) => ipcRenderer.invoke('trainees:update', { id, data }),
  deleteTrainee: (id) => ipcRenderer.invoke('trainees:delete', id),
  
  // Sessions (חדש)
  listSessions: (start, end) => ipcRenderer.invoke('sessions:list', { start, end }),
  createSession: (data) => ipcRenderer.invoke('sessions:create', data),
  updateSession: (id, data) => ipcRenderer.invoke('sessions:update', { id, data }),
  deleteSession: (id) => ipcRenderer.invoke('sessions:delete', id),
});
