const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const fs = require('fs/promises');
const path = require('path');

let mainWindow;

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
