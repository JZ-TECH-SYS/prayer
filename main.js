const { app, Tray, Menu } = require('electron');
const path = require('path');
const { erro } = require('./src/notificacao');
const { startWebSocketServer, stopWebSocketServer } = require('./src/socket');

let tray = null;
let webSocketServerRunning = false;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
    return;
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'src/img/print.png')); // Coloque o ícone da bandeja aqui
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Iniciar', click: startWebSocketServer },
    { label: 'Parar', click: stopWebSocketServer },
    { label: 'Sair', click: () => { stopWebSocketServer(); app.quit(); } },
  ]);

  tray.setToolTip('Gerenciado de Impressão');
  tray.setContextMenu(contextMenu);
}

app.whenReady().then(() => {
  createTray();
  webSocketServerRunning = startWebSocketServer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (!webSocketServerRunning) {
      app.quit();
    }
  }
});

app.on('before-quit', () => {
  if(!webSocketServerRunning){
    erro('Serviço de impressão parado!');
    stopWebSocketServer();
  }
});
