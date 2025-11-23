const { BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { logger, getLogFilePath, getLogDir } = require("./logger");

let win = null;
let ipcRegistered = false;
let streamListener = null; // listener atual do live

function openLogViewer() {
  if (win && !win.isDestroyed()) {
    win.focus();
    return win;
  }

  // Garante handlers IPC registrados apenas uma vez
  if (!ipcRegistered) {
    ipcMain.handle('request-initial-log', () => {
      try {
        const file = getLogFilePath();
        if (fs.existsSync(file)) {
          const text = fs.readFileSync(file, 'utf8');
          const lines = text.split(/\r?\n/);
          const initial = lines.slice(-2000).join('\n');
          if (win && !win.isDestroyed()) {
            win.webContents.send('log-file', file);
            win.webContents.send('log-initial', initial);
          }
        }
      } catch (_) { }
    });

    ipcMain.handle('open-log-file', () => {
      try {
        const file = getLogFilePath();
        shell.openPath(file);
      } catch (_) { }
    });

    ipcMain.handle('list-log-files', () => {
      try {
        const dir = getLogDir();
        const files = fs.readdirSync(dir)
          .filter(f => /^prayer-\d{4}-\d{2}-\d{2}\.log$/i.test(f))
          .sort() // ordena crescente por nome (data)
          .map(f => ({ name: f, path: path.join(dir, f) }));
        if (win && !win.isDestroyed()) win.webContents.send('log-list', files);
      } catch (_) { }
    });

    ipcMain.handle('load-log-file', (_, filePath) => {
      try {
        if (!filePath || !fs.existsSync(filePath)) return;
        const text = fs.readFileSync(filePath, 'utf8');
        const lines = text.split(/\r?\n/);
        const initial = lines.slice(-2000).join('\n');
        if (win && !win.isDestroyed()) {
          win.webContents.send('log-file', filePath);
          win.webContents.send('log-initial', initial);
        }
      } catch (_) { }
    });

    // live é sempre o arquivo do dia; sem handler de switch

    ipcRegistered = true;
  }

  win = new BrowserWindow({
    width: 900,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload', 'logViewerPreload.js'),
    },
    title: "Logs - Prayer",
  });

  // Carrega HTML local (mais confiável)
  const htmlPath = path.join(__dirname, '..', 'assets', 'html', 'logViewer.html');
  win.loadFile(htmlPath);

  // Ao criar, envia caminho do arquivo atual e lista de arquivos
  win.webContents.on('did-finish-load', () => {
    try {
      const file = getLogFilePath();
      if (win && !win.isDestroyed()) {
        win.webContents.send('log-file', file);
        win.webContents.send('log-today', file);
      }
    } catch (_) { }
  });

  // stream em tempo real (arquivo atual)
  streamListener = ({ line }) => {
    try { if (win && !win.isDestroyed()) win.webContents.send('log-line', line); } catch (_) { }
  };
  logger.on('log', streamListener);

  win.on('closed', () => {
    if (streamListener) logger.off('log', streamListener);
    win = null;
  });

  return win;
}

module.exports = { openLogViewer };
