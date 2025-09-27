const { app, Tray, Menu, shell } = require("electron");
const path = require("path");
const { erro } = require("./core/notificacao");
const { startWebSocketServer, stopWebSocketServer } = require("./core/socket");
const { logger, getLogDir } = require("./core/logger");
const { openLogViewer } = require("./core/logViewer");
const { openPrinterTester } = require("./core/printerTester");

let tray = null;
let webSocketServerRunning = false;
app.setAppUserModelId('com.prayer.app');

// Função para atualizar o status visual do tray
function atualizarStatusTray() {
  if (!tray) return;
  
  const status = webSocketServerRunning ? "🟢 Online" : "🔴 Offline";
  const porta = webSocketServerRunning ? "8080" : "N/A";
  
  tray.setToolTip(`🙏 Prayer System - Gerenciador de Impressão
Status: ${status}
Porta: ${porta}
💡 Duplo clique = Teste de Impressão`);

  // Atualizar menu com status atual
  const menu = Menu.buildFromTemplate([
    { 
      label: webSocketServerRunning ? "🟢 Servidor Online" : "🔴 Servidor Offline", 
      enabled: false,
      type: "normal"
    },
    { type: "separator" },
    { 
      label: "🚀 Iniciar Servidor", 
      click: () => {
        const sucesso = startWebSocketServer();
        webSocketServerRunning = sucesso;
        setTimeout(() => {
          atualizarStatusTray();
          if (sucesso) {
            mostrarNotificacao("🚀 Servidor Iniciado", "Prayer System está online na porta 8080");
          }
        }, 1000);
      },
      enabled: !webSocketServerRunning,
      toolTip: "Iniciar o servidor WebSocket na porta 8080"
    },
    { 
      label: "⏹️ Parar Servidor", 
      click: () => {
        stopWebSocketServer();
        webSocketServerRunning = false;
        setTimeout(() => {
          atualizarStatusTray();
          mostrarNotificacao("⏹️ Servidor Parado", "Prayer System foi desconectado");
        }, 1000);
      },
      enabled: webSocketServerRunning,
      toolTip: "Parar o servidor WebSocket"
    },
    { type: "separator" },
    { 
      label: "📊 Ver Logs", 
      click: () => {
        logger.info("📊 Abrindo visualizador de logs via tray");
        openLogViewer();
      },
      toolTip: "Abrir visualizador de logs em tempo real"
    },
    { 
      label: "🖨️ Teste de Impressão", 
      click: () => {
        logger.info("🖨️ Abrindo teste de impressão via tray");
        openPrinterTester();
      },
      toolTip: "Abrir ferramenta de teste de impressoras"
    },
    { 
      label: "📁 Pasta de Logs", 
      click: () => {
        logger.info("📁 Abrindo pasta de logs via tray");
        shell.openPath(getLogDir());
      },
      toolTip: "Abrir pasta contendo arquivos de log"
    },
    { type: "separator" },
    { 
      label: "ℹ️ Sobre o Prayer", 
      click: () => {
        const { dialog } = require('electron');
        const versao = require('../package.json').version || '1.0.0';
        dialog.showMessageBox({
          type: 'info',
          title: '🙏 Prayer System',
          message: 'Prayer - Gerenciador de Impressão',
          detail: `Versão: ${versao}\nDesenvolvido por: JZ-TECH-SYS\nBranch: clickjoias\n\n🚀 Sistema de impressão avançado\n🖨️ Suporte a múltiplas impressoras\n📊 Logs em tempo real\n🎨 Interface moderna`,
          icon: path.join(__dirname, "img/print.png")
        });
        logger.info("ℹ️ Informações do sistema exibidas");
      },
      toolTip: "Informações sobre o Prayer System"
    },
    { 
      label: "❌ Sair", 
      click: () => { 
        logger.info("❌ Encerrando aplicação via menu do tray");
        mostrarNotificacao("👋 Até logo!", "Prayer System foi encerrado");
        setTimeout(() => {
          stopWebSocketServer(); 
          app.quit(); 
        }, 500);
      },
      toolTip: "Encerrar o Prayer System"
    }
  ]);

  tray.setContextMenu(menu);
}

// Garante que apenas uma instância do app rode
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  return;
}

function criarTray() {
  tray = new Tray(path.join(__dirname, "img/print.png"));

  // Adicionar evento de clique duplo para ação rápida (abrir teste de impressão)
  tray.on('double-click', () => {
    logger.info("Duplo clique no tray - abrindo teste de impressão");
    openPrinterTester();
  });

  // Adicionar evento de clique simples para atualizar status
  tray.on('click', () => {
    atualizarStatusTray();
  });

  // Configurar menu inicial
  atualizarStatusTray();
}

app.whenReady().then(() => {
  criarTray();
  logger.info("🚀 Prayer System iniciado - Tray criado com ícones");
  
  // Iniciar servidor e atualizar status do tray
  webSocketServerRunning = startWebSocketServer();
  setTimeout(() => {
    atualizarStatusTray();
    logger.info("📊 Status do tray atualizado");
  }, 1000);
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

// Função para mostrar notificação do sistema quando disponível
function mostrarNotificacao(titulo, mensagem, icone = null) {
  if (tray) {
    // No Windows, usar balloon (tooltip expandido)
    try {
      tray.displayBalloon({
        title: titulo,
        content: mensagem,
        icon: icone || path.join(__dirname, "img/print.png")
      });
    } catch (error) {
      // Fallback: apenas log se balloon não funcionar
      logger.info(`💬 ${titulo}: ${mensagem}`);
    }
  }
}
