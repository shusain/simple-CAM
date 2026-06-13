const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: (payload) => ipcRenderer.invoke('project:save', payload),
  exportGcode: (payload) => ipcRenderer.invoke('gcode:export', payload),
  getOctoprintSettings: () => ipcRenderer.invoke('octoprint:getSettings'),
  saveOctoprintSettings: (payload) => ipcRenderer.invoke('octoprint:saveSettings', payload),
  uploadToOctoprint: (payload) => ipcRenderer.invoke('octoprint:upload', payload),

  onMenuNew: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('menu:new', handler);
    return () => ipcRenderer.removeListener('menu:new', handler);
  },
  onMenuOpen: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('menu:open', handler);
    return () => ipcRenderer.removeListener('menu:open', handler);
  },
  onMenuSave: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('menu:save', handler);
    return () => ipcRenderer.removeListener('menu:save', handler);
  },
  onMenuExportGcode: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('menu:exportGcode', handler);
    return () => ipcRenderer.removeListener('menu:exportGcode', handler);
  },
  onMenuOctoprintSettings: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('menu:octoprintSettings', handler);
    return () => ipcRenderer.removeListener('menu:octoprintSettings', handler);
  },
  onMenuZoomIn: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('menu:zoomIn', handler);
    return () => ipcRenderer.removeListener('menu:zoomIn', handler);
  },
  onMenuZoomOut: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('menu:zoomOut', handler);
    return () => ipcRenderer.removeListener('menu:zoomOut', handler);
  },
  onMenuZoomReset: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('menu:zoomReset', handler);
    return () => ipcRenderer.removeListener('menu:zoomReset', handler);
  },
});
