const { app, shell, dialog } = require("electron");
const path = require("path");
const { startWebSocketServer, stopWebSocketServer } = require("./core/socket");
const { logger, getLogDir } = require("./core/logger");
const { openLogViewer } = require("./core/logViewer");
const { openPrinterTester } = require("./core/printerTester");
const { createTrayController } = require("./core/trayController");
const { createUpdateManager } = require("./core/updateManager");

let webSocketServerRunning = false;
let lastDownloadedUpdate = null;

const isDev = !app.isPackaged;
const appVersion = app.getVersion();
const iconPath = path.join(__dirname, "img/print.png");
app.setAppUserModelId("com.prayer.app");

// Tray controller
const trayController = createTrayController({
  appVersion,
  iconPath,
  onStartServer: () => handleServerToggle("start"),
  onStopServer: () => handleServerToggle("stop"),
  onOpenLogViewer: () => {
    logger.info("📊 Abrindo visualizador de logs via tray");
    openLogViewer();
  },
  onOpenPrinterTester: () => {
    logger.info("🖨️ Abrindo teste de impressão via tray");
    openPrinterTester();
  },
  onOpenLogFolder: () => {
    logger.info("📁 Abrindo pasta de logs via tray");
    shell.openPath(getLogDir());
  },
  onShowAbout: () => showAboutDialog(),
  onQuit: () => handleQuitRequest(),
  onRequestUpdate: () => handleManualUpdateCheck(),
  onInstallUpdate: () => promptInstalarAtualizacao(lastDownloadedUpdate),
});

// Update manager
const updateManager = createUpdateManager({ logger, isDev });

updateManager.on("state", (state) => {
  trayController.setUpdateState(state);
});

updateManager.on("checking", () => {
  showTrayNotification("🔍 Buscando atualização", "Verificando versão mais recente no GitHub");
});

updateManager.on("update-available", (info) => {
  logger.info("⬇️ Atualização disponível", info);
  showTrayNotification("⬇️ Atualização encontrada", `Versão ${info.version} será baixada em segundo plano`);
});

updateManager.on("update-not-available", () => {
  logger.info("✅ Nenhuma atualização disponível");
  showTrayNotification("✅ Você está atualizado", `Versão atual: ${appVersion}`);
});

updateManager.on("error", (error) => {
  logger.error("❌ Erro no auto-update", { error });
  showTrayNotification("❌ Falha no update", error?.message || "Erro desconhecido");
});

updateManager.on("update-downloaded", (info) => {
  lastDownloadedUpdate = info;
  logger.info("✅ Atualização baixada", info);
  showTrayNotification("✅ Atualização pronta", "Clique para instalar a nova versão");
  promptInstalarAtualizacao(info);
});

// Garantir instância única
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  return;
}

app.whenReady().then(() => {
  trayController.init();
  logger.info("🚀 Prayer System iniciado - Tray criado com ícones");

  webSocketServerRunning = startWebSocketServer();
  trayController.setServerRunning(webSocketServerRunning);
  logger.info("📊 Status do tray atualizado");

  updateManager.init();
  trayController.setUpdateState(updateManager.getState());

  if (updateManager.isEnabled()) {
    setTimeout(() => {
      updateManager
        .checkForUpdates()
        .catch((error) => logger.error("❌ Falha ao buscar atualização automática", { error }));
    }, 4000);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !webSocketServerRunning) {
    logger.info("Encerrando aplicação (todas as janelas fechadas)");
    app.quit();
  }
});

app.on("before-quit", () => {
  if (webSocketServerRunning) {
    logger.info("🛑 Encerrando servidor antes de fechar a aplicação");
    stopWebSocketServer();
  }
  logger.info("👋 Prayer System encerrado");
});

function handleServerToggle(action) {
  if (action === "start") {
    const success = startWebSocketServer();
    webSocketServerRunning = success;
    trayController.setServerRunning(webSocketServerRunning);
    if (success) {
      showTrayNotification("🚀 Servidor Iniciado", "Prayer System está online na porta 8080");
    }
    return success;
  }

  stopWebSocketServer();
  webSocketServerRunning = false;
  trayController.setServerRunning(false);
  showTrayNotification("⏹️ Servidor Parado", "Prayer System foi desconectado");
  return true;
}

function handleManualUpdateCheck() {
  if (!updateManager.isEnabled()) {
    showTrayNotification("ℹ️ Atualização", "Disponível apenas em builds instalados");
    logger.warn("⚠️ Tentativa de update manual em modo desenvolvimento");
    return;
  }

  updateManager
    .checkForUpdates({ manual: true })
    .catch((error) => {
      logger.error("❌ Falha ao buscar atualização manual", { error });
      showTrayNotification("❌ Falha ao buscar atualização", error?.message || "Verifique sua conexão");
    });
}

function showAboutDialog() {
  dialog.showMessageBox({
    type: "info",
    title: "🙏 Prayer System",
    message: "Prayer - Gerenciador de Impressão",
    detail: `Versão: ${appVersion}\nDesenvolvido por: JZ-TECH-SYS\nBranch: clickjoias\n\n🚀 Sistema de impressão avançado\n🖨️ Suporte a múltiplas impressoras\n📊 Logs em tempo real\n🎨 Interface moderna`,
    icon: iconPath,
  });
  logger.info("ℹ️ Informações do sistema exibidas");
}

function handleQuitRequest() {
  logger.info("❌ Encerrando aplicação via menu do tray");
  showTrayNotification("👋 Até logo!", "Prayer System foi encerrado");
  setTimeout(() => {
    stopWebSocketServer();
    app.quit();
  }, 500);
}

function promptInstalarAtualizacao(info) {
  if (!info && !lastDownloadedUpdate) {
    return;
  }

  const versao = info?.version || lastDownloadedUpdate?.version || "nova";
  const response = dialog.showMessageBoxSync({
    type: "question",
    buttons: ["Instalar agora", "Mais tarde"],
    defaultId: 0,
    cancelId: 1,
    title: "Atualização pronta",
    message: `A versão ${versao} já foi baixada. Deseja instalar agora?`,
    detail: "O aplicativo reiniciará para concluir a instalação.",
    icon: iconPath,
  });

  if (response === 0) {
    logger.info("🚀 Instalando atualização", { versao });
    showTrayNotification("🚀 Atualizando", "Aplicativo será reiniciado");
    setImmediate(() => updateManager.installUpdate());
  } else {
    logger.info("⏸️ Atualização adiada", { versao });
  }
}

function showTrayNotification(titulo, mensagem, icone = iconPath) {
  const trayInstance = trayController.getTrayInstance?.();
  if (!trayInstance) {
    logger.info(`💬 ${titulo}: ${mensagem}`);
    return;
  }

  try {
    trayInstance.displayBalloon({
      title: titulo,
      content: mensagem,
      icon: icone,
    });
  } catch (_) {
    logger.info(`💬 ${titulo}: ${mensagem}`);
  }
}
