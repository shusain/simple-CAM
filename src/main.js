const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const fs = require('fs/promises');
const path = require('path');

let mainWindow;

function getOctoprintSettingsPath() {
  return path.join(app.getPath('userData'), 'octoprint-settings.json');
}

function normalizeOctoprintSettings(raw) {
  const baseUrlRaw = typeof raw?.baseUrl === 'string' ? raw.baseUrl.trim() : '';
  const hasScheme = /^https?:\/\//i.test(baseUrlRaw);
  return {
    baseUrl: baseUrlRaw ? (hasScheme ? baseUrlRaw : `http://${baseUrlRaw}`) : '',
    apiKey: typeof raw?.apiKey === 'string' ? raw.apiKey.trim() : '',
  };
}

async function readOctoprintSettings() {
  try {
    const raw = await fs.readFile(getOctoprintSettingsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeOctoprintSettings(parsed);
  } catch {
    return { baseUrl: '', apiKey: '' };
  }
}

async function writeOctoprintSettings(settings) {
  const normalized = normalizeOctoprintSettings(settings);
  await fs.writeFile(getOctoprintSettingsPath(), JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

function sendMenuEvent(channel) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel);
  }
}

function createAppMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Project',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendMenuEvent('menu:new'),
        },
        {
          label: 'Open Project',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendMenuEvent('menu:open'),
        },
        {
          label: 'Save Project',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendMenuEvent('menu:save'),
        },
        { type: 'separator' },
        {
          label: 'Export G-code',
          accelerator: 'CmdOrCtrl+E',
          click: () => sendMenuEvent('menu:exportGcode'),
        },
        {
          label: 'OctoPrint Settings',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => sendMenuEvent('menu:octoprintSettings'),
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        {
          label: 'Zoom Work Area In',
          accelerator: 'CmdOrCtrl+=',
          click: () => sendMenuEvent('menu:zoomIn'),
        },
        {
          label: 'Zoom Work Area Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => sendMenuEvent('menu:zoomOut'),
        },
        {
          label: 'Reset Work Area Zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => sendMenuEvent('menu:zoomReset'),
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Simple CAM',
              message: 'Simple CAM for MPCNC / Marlin',
              detail:
                'Draw drill and cut patterns on a snap grid and export Marlin-compatible G-code.',
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    backgroundColor: '#111827',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  const startUrl = rendererUrl || `file://${path.join(__dirname, '../dist/index.html')}`;

  mainWindow.loadURL(startUrl);
  mainWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});

  if (rendererUrl) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  createAppMenu();
}

ipcMain.handle('project:open', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Open CAM Project',
      filters: [
        { name: 'CAM Project', extensions: ['cam', 'json'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (canceled || !filePaths?.length) {
      return { canceled: true };
    }

    const filePath = filePaths[0];
    const raw = await fs.readFile(filePath, 'utf8');
    const project = JSON.parse(raw);

    return {
      canceled: false,
      filePath,
      project,
    };
  } catch (error) {
    return {
      canceled: false,
      error: error instanceof Error ? error.message : 'Unknown error while opening project',
    };
  }
});

ipcMain.handle('project:save', async (_event, payload) => {
  try {
    const suggestedName = payload?.suggestedName || 'project.cam.json';
    const project = payload?.project || {};

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save CAM Project',
      defaultPath: suggestedName,
      filters: [
        { name: 'CAM Project', extensions: ['cam', 'json'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (canceled || !filePath) {
      return { canceled: true };
    }

    await fs.writeFile(filePath, JSON.stringify(project, null, 2), 'utf8');

    return {
      canceled: false,
      filePath,
    };
  } catch (error) {
    return {
      canceled: false,
      error: error instanceof Error ? error.message : 'Unknown error while saving project',
    };
  }
});

ipcMain.handle('gcode:export', async (_event, payload) => {
  try {
    const suggestedName = payload?.suggestedName || 'output.gcode';
    const gcode = payload?.gcode || '';

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export G-code',
      defaultPath: suggestedName,
      filters: [
        { name: 'G-code', extensions: ['gcode', 'gc', 'ngc'] },
        { name: 'Text', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (canceled || !filePath) {
      return { canceled: true };
    }

    await fs.writeFile(filePath, gcode, 'utf8');

    return {
      canceled: false,
      filePath,
    };
  } catch (error) {
    return {
      canceled: false,
      error: error instanceof Error ? error.message : 'Unknown error while exporting G-code',
    };
  }
});

ipcMain.handle('octoprint:getSettings', async () => {
  try {
    const settings = await readOctoprintSettings();
    return {
      ok: true,
      settings,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to load OctoPrint settings',
    };
  }
});

ipcMain.handle('octoprint:saveSettings', async (_event, payload) => {
  try {
    const settings = await writeOctoprintSettings(payload?.settings || {});
    return {
      ok: true,
      settings,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to save OctoPrint settings',
    };
  }
});

ipcMain.handle('octoprint:upload', async (_event, payload) => {
  try {
    const stored = await readOctoprintSettings();
    const baseUrl = stored.baseUrl.replace(/\/+$/, '');
    const apiKey = stored.apiKey;
    const gcode = typeof payload?.gcode === 'string' ? payload.gcode : '';
    const fileName = typeof payload?.fileName === 'string' && payload.fileName.trim()
      ? payload.fileName.trim()
      : `simple-cam-${Date.now()}.gcode`;
    const runAfterUpload = Boolean(payload?.runAfterUpload);

    if (!baseUrl || !apiKey) {
      return {
        ok: false,
        error: 'OctoPrint base URL and API key are required',
      };
    }

    if (!gcode.trim()) {
      return {
        ok: false,
        error: 'No G-code content to upload',
      };
    }

    const form = new FormData();
    form.append('select', 'true');
    form.append('print', runAfterUpload ? 'true' : 'false');
    form.append('file', new Blob([gcode], { type: 'text/plain' }), fileName);

    const response = await fetch(`${baseUrl}/api/files/local`, {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
      },
      body: form,
    });

    if (!response.ok) {
      const detail = await response.text();
      return {
        ok: false,
        error: `OctoPrint upload failed (${response.status} ${response.statusText})${
          detail ? `: ${detail}` : ''
        }`,
      };
    }

    const body = await response.json();
    return {
      ok: true,
      fileName,
      runAfterUpload,
      response: body,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to send file to OctoPrint',
    };
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (!mainWindow) {
    createWindow();
  }
});
