const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('jecbridge', {
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  listProjects: () => ipcRenderer.invoke('projects:list'),
  chooseFolder: () => ipcRenderer.invoke('projects:choose-folder'),
  addProject: (projectPath) => ipcRenderer.invoke('projects:add', { path: projectPath }),
  removeProject: (id) => ipcRenderer.invoke('projects:remove', id),
  startProject: (id) => ipcRenderer.invoke('projects:start', id),
  stopProject: (id) => ipcRenderer.invoke('projects:stop', id),
  getLogs: (id) => ipcRenderer.invoke('projects:logs', id),
  onProjectsChanged: (callback) => { const listener = (_event, projects) => callback(projects); ipcRenderer.on('projects:changed', listener); return () => ipcRenderer.removeListener('projects:changed', listener) },
  onProcessLog: (callback) => { const listener = (_event, data) => callback(data); ipcRenderer.on('process:log', listener); return () => ipcRenderer.removeListener('process:log', listener) },
  onProcessExit: (callback) => { const listener = (_event, data) => callback(data); ipcRenderer.on('process:exit', listener); return () => ipcRenderer.removeListener('process:exit', listener) },
})
