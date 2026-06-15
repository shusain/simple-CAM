import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronBridge } from './types';

function registerMenuHandler(channel: string, callback: () => void): () => void {
  const handler = () => callback();
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const electronBridge: ElectronBridge = {
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: (payload) => ipcRenderer.invoke('project:save', payload),
  exportGcode: (payload) => ipcRenderer.invoke('gcode:export', payload),
  getOctoprintSettings: () => ipcRenderer.invoke('octoprint:getSettings'),
  saveOctoprintSettings: (payload) => ipcRenderer.invoke('octoprint:saveSettings', payload),
  uploadToOctoprint: (payload) => ipcRenderer.invoke('octoprint:upload', payload),
  onMenuNew: (callback) => registerMenuHandler('menu:new', callback),
  onMenuOpen: (callback) => registerMenuHandler('menu:open', callback),
  onMenuSave: (callback) => registerMenuHandler('menu:save', callback),
  onMenuExportGcode: (callback) => registerMenuHandler('menu:exportGcode', callback),
  onMenuOctoprintSettings: (callback) => registerMenuHandler('menu:octoprintSettings', callback),
  onMenuZoomIn: (callback) => registerMenuHandler('menu:zoomIn', callback),
  onMenuZoomOut: (callback) => registerMenuHandler('menu:zoomOut', callback),
  onMenuZoomReset: (callback) => registerMenuHandler('menu:zoomReset', callback),
};

contextBridge.exposeInMainWorld('electron', electronBridge);
