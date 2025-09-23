const { app, Tray, Menu, shell } = require("electron");
const path = require("path");
const { erro } = require("./core/notificacao");
const { startWebSocketServer, stopWebSocketServer } = require("./core/socket");
const { logger, getLogDir } = require("./core/logger");
const { openLogViewer } = require("./core/logViewer");

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
    { label: "Ver Logs", click: openLogViewer },
  { label: "Abrir pasta de logs", click: () => shell.openPath(getLogDir()) },
    { type: "separator" },
    { label: "Sair", click: () => { stopWebSocketServer(); app.quit(); } }
  ]);

  tray.setToolTip("Prayer - Gerenciador de Impressão");
  tray.setContextMenu(menu);
}

app.whenReady().then(() => {
  criarTray();
  logger.info("Aplicação iniciada");
  webSocketServerRunning = startWebSocketServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !webSocketServerRunning) {
    logger.info("Encerrando aplicação (todas as janelas fechadas)");
    app.quit();
  }
});

app.on("before-quit", () => {
  if (!webSocketServerRunning) {
    erro("Serviço de impressão foi encerrado.");
    logger.warn("Serviço de impressão encerrado");
    stopWebSocketServer();
  }
});
