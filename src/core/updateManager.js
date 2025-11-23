const { autoUpdater } = require("electron-updater");
const { EventEmitter } = require("events");

function createUpdateManager(options = {}) {
    const {
        logger,
        isDev = false,
    } = options;

    const emitter = new EventEmitter();
    const state = {
        checking: false,
        ready: false,
        version: null,
        lastError: null,
    };

    function log(level, message, meta) {
        if (!logger || typeof logger[level] !== "function") return;
        logger[level](message, meta);
    }

    function init() {
        if (isDev) {
            log("info", "ℹ️ Auto-update desativado em modo desenvolvimento");
            return;
        }

        autoUpdater.logger = {
            info: (msg) => log("info", `🔄 AutoUpdate: ${msg}`),
            warn: (msg) => log("warn", `🔄 AutoUpdate: ${msg}`),
            error: (msg) => log("error", `🔄 AutoUpdate: ${msg}`),
        };

        autoUpdater.autoDownload = true;

        autoUpdater.on("checking-for-update", () => {
            updateState({ checking: true, lastError: null });
            emitter.emit("checking");
        });

        autoUpdater.on("update-available", (info) => {
            emitter.emit("update-available", info);
        });

        autoUpdater.on("update-not-available", (info) => {
            updateState({ checking: false });
            emitter.emit("update-not-available", info);
        });

        autoUpdater.on("error", (error) => {
            updateState({ checking: false, lastError: error });
            emitter.emit("error", error);
        });

        autoUpdater.on("update-downloaded", (info) => {
            updateState({
                checking: false,
                ready: true,
                version: info.version,
            });
            emitter.emit("update-downloaded", info);
        });
    }

    function updateState(partial) {
        Object.assign(state, partial);
        emitter.emit("state", { ...state });
    }

    function getState() {
        return { ...state };
    }

    async function checkForUpdates({ manual = false } = {}) {
        if (isDev) {
            throw new Error("Auto-update indisponível em modo desenvolvimento");
        }

        if (state.checking) {
            return state;
        }

        updateState({ checking: true });

        if (manual) {
            return autoUpdater.checkForUpdates();
        }

        return autoUpdater.checkForUpdatesAndNotify();
    }

    function installUpdate() {
        if (!state.ready) {
            return false;
        }

        autoUpdater.quitAndInstall();
        return true;
    }

    return {
        init,
        on: (...args) => emitter.on(...args),
        once: (...args) => emitter.once(...args),
        off: (...args) => emitter.off(...args),
        getState,
        checkForUpdates,
        installUpdate,
        isEnabled: () => !isDev,
    };
}

module.exports = {
    createUpdateManager,
};
