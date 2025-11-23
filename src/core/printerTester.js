const { BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { logger } = require("./logger");
const { getPrinters } = require("../helpers/impressoras");
const { imprimirTexto } = require("../utils/impressora");
const { createWindowHTML } = require("../utils/janela");

let win = null;
let ipcRegistered = false;

function openPrinterTester() {
  if (win && !win.isDestroyed()) {
    win.focus();
    return win;
  }

  if (!ipcRegistered) {
    // Lista impressoras (detalhada)
    ipcMain.handle("printer-test/list-printers", async (_e, payload) => {
      try {
        // Se payload contém _cache, forçar limpeza do cache
        if (payload && payload._cache) {
          logger.info("Limpeza de cache solicitada pela UI", { cacheKey: payload._cache });
          // Limpar cache do módulo de impressoras
          const { clearPrintersCache } = require("../helpers/impressoras");
          clearPrintersCache();
        }
        
        const list = getPrinters();
        return { status: "success", data: list };
      } catch (e) {
        logger.error("Falha ao listar impressoras (UI)", { error: e && e.message });
        return { status: "error", message: e && e.message };
      }
    });

    // Imprimir texto simples (RAW)
    ipcMain.handle("printer-test/print-text", async (_e, payload) => {
      const { printer, text, _cache } = payload || {};
      try {
        if (_cache) {
          logger.info("Cache busting aplicado para impressão de texto", { cacheKey: _cache, printer });
        }
        
        const res = await imprimirTexto({ impressora: printer, msg: text });
        return typeof res === "string" ? JSON.parse(res) : res;
      } catch (e) {
        logger.error("Falha ao imprimir texto (UI)", { error: e && e.message });
        return { status: "error", message: e && e.message };
      }
    });

    // Imprimir HTML (usa motor do Electron)
    ipcMain.handle("printer-test/print-html", async (_e, payload) => {
      const { printer, html, _cache } = payload || {};
      try {
        if (_cache) {
          logger.info("Cache busting aplicado para impressão HTML", { cacheKey: _cache, printer });
        }
        
        const tmp = createWindowHTML(html);
        return await new Promise((resolve) => {
          tmp.webContents.on("did-finish-load", () => {
            tmp.webContents.print(
              {
                silent: true,
                printBackground: true,
                deviceName: printer,
                margins: { marginType: "none" },
              },
              (success, err) => {
                logger[success ? "info" : "error"]("Resultado print-html (UI)", { success, err });
                try { tmp.close(); } catch (_) {}
                resolve({
                  status: success ? "success" : "error",
                  message: success ? "Impresso!" : err,
                  acao: "imprimirHTML",
                });
              }
            );
          });
        });
      } catch (e) {
        logger.error("Falha ao imprimir HTML (UI)", { error: e && e.message });
        return { status: "error", message: e && e.message };
      }
    });

    ipcRegistered = true;
  }

  win = new BrowserWindow({
    width: 720,
    height: 520,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload", "printerTesterPreload.js"),
    },
    title: "Teste de Impressão - Prayer",
  });

  const htmlPath = path.join(__dirname, "..", "assets", "html", "printerTester.html");
  win.loadFile(htmlPath);

  win.on("closed", () => {
    win = null;
  });

  return win;
}

module.exports = { openPrinterTester };
