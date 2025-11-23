const { Tray, Menu } = require("electron");
const path = require("path");

function createTrayController(options = {}) {
    const {
        appVersion = "0.0.0",
        iconPath = path.join(__dirname, "../img/print.png"),
        onStartServer,
        onStopServer,
        onOpenLogViewer,
        onOpenPrinterTester,
        onOpenLogFolder,
        onShowAbout,
        onQuit,
        onRequestUpdate,
        onInstallUpdate,
    } = options;

    const state = {
        serverRunning: false,
        update: {
            checking: false,
            ready: false,
            version: null,
        },
    };

    let tray = null;

    function init() {
        if (tray) {
            return tray;
        }

        tray = new Tray(iconPath);

        tray.on("double-click", () => {
            onOpenPrinterTester?.();
        });

        tray.on("click", () => {
            rebuildMenu();
        });

        rebuildMenu();
        return tray;
    }

    function rebuildMenu() {
        if (!tray) return;

        tray.setToolTip(buildTooltip());
        tray.setContextMenu(Menu.buildFromTemplate(buildMenuTemplate()));
    }

    function buildTooltip() {
        const status = state.serverRunning ? "🟢 Online" : "🔴 Offline";
        const porta = state.serverRunning ? "8080" : "N/A";

        return `🙏 Prayer System - Gerenciador de Impressão\nVersão: ${appVersion}\nStatus: ${status}\nPorta: ${porta}\n💡 Duplo clique = Teste de Impressão`;
    }

    function buildMenuTemplate() {
        return [
            {
                label: buildVersionLabel(),
                click: () => {
                    if (state.update.ready) {
                        onInstallUpdate?.();
                    } else {
                        onRequestUpdate?.();
                    }
                },
                enabled: !state.update.checking || state.update.ready,
                toolTip: state.update.ready
                    ? "Instalar atualização disponível"
                    : "Clique para buscar atualizações",
            },
            { type: "separator" },
            {
                label: state.serverRunning ? "🟢 Servidor Online" : "🔴 Servidor Offline",
                enabled: false,
                type: "normal",
            },
            { type: "separator" },
            {
                label: "🚀 Iniciar Servidor",
                click: () => onStartServer?.(),
                enabled: !state.serverRunning,
                toolTip: "Iniciar servidor WebSocket na porta 8080",
            },
            {
                label: "⏹️ Parar Servidor",
                click: () => onStopServer?.(),
                enabled: state.serverRunning,
                toolTip: "Parar servidor WebSocket",
            },
            { type: "separator" },
            {
                label: "📊 Ver Logs",
                click: () => onOpenLogViewer?.(),
            },
            {
                label: "🖨️ Teste de Impressão",
                click: () => onOpenPrinterTester?.(),
            },
            {
                label: "📁 Pasta de Logs",
                click: () => onOpenLogFolder?.(),
            },
            { type: "separator" },
            {
                label: "ℹ️ Sobre o Prayer",
                click: () => onShowAbout?.(),
            },
            {
                label: "❌ Sair",
                click: () => onQuit?.(),
            },
        ];
    }

    function buildVersionLabel() {
        if (state.update.ready && state.update.version) {
            return `⬆️ Instalar atualização v${state.update.version}`;
        }

        if (state.update.checking) {
            return "🔄 Buscando atualizações...";
        }

        return `🆕 Versão atual v${appVersion}`;
    }

    function setServerRunning(running) {
        state.serverRunning = Boolean(running);
        rebuildMenu();
    }

    function setUpdateState(updateState = {}) {
        state.update = {
            ...state.update,
            ...updateState,
        };
        rebuildMenu();
    }

    function getTrayInstance() {
        return tray;
    }

    return {
        init,
        refresh: rebuildMenu,
        setServerRunning,
        setUpdateState,
        getTrayInstance,
    };
}

module.exports = {
    createTrayController,
};
