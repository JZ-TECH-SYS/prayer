const { app, Tray, Menu } = require("electron");
const path = require("path");
const { erro } = require("./core/notificacao");
const { startWebSocketServer, stopWebSocketServer } = require("./core/socket");

let tray = null;
let webSocketServerRunning = false;
app.setAppUserModelId('com.prayer.app');

// Garante que apenas uma instância do app rode
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  return;
}

function criarTray() {
  tray = new Tray(path.join(__dirname, "img/print.png"));

  const menu = Menu.buildFromTemplate([
    { label: "Iniciar", click: startWebSocketServer },
    { label: "Parar", click: stopWebSocketServer },
    { type: "separator" },
    { label: "Sair", click: () => { stopWebSocketServer(); app.quit(); } }
  ]);

  tray.setToolTip("Prayer - Gerenciador de Impressão");
  tray.setContextMenu(menu);
}

app.whenReady().then(() => {
  criarTray();
  webSocketServerRunning = startWebSocketServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !webSocketServerRunning) {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (!webSocketServerRunning) {
    erro("Serviço de impressão foi encerrado.");
    stopWebSocketServer();
  }
});
