const { BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { gerarNomeUnico } = require("./arquivos");
const { erro } = require("../core/notificacao");

// 🔹 Cria uma janela com HTML puro
function createWindowHTML(html, show = false) {
  const win = new BrowserWindow({
    width: 800,
    height: 1000,
    show,
    webPreferences: {
      nodeIntegration: false
    }
  });

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  return win;
}

// 🔹 Apenas visualizar um PDF base64 (abre janela com iframe)
function visualizarPDFBase64(base64) {
  const html = `
    <html>
      <body style="margin:0;padding:0">
        <iframe src="data:application/pdf;base64,${base64}"
                width="100%" height="100%" style="border:0"></iframe>
      </body>
    </html>
  `;
  createWindowHTML(html, true); // show = true
}

// 🔹 Imprimir um PDF base64 de forma confiável
async function imprimirPDFBase64(base64, impressora) {
  const filePath = path.join(os.tmpdir(), gerarNomeUnico("pdf"));
  fs.writeFileSync(filePath, Buffer.from(base64, "base64"));

  const win = new BrowserWindow({
    width: 800,
    height: 1000,
    show: false,
    webPreferences: {
      nodeIntegration: false
    }
  });

  win.loadFile(filePath);

  return new Promise((resolve) => {
    win.webContents.on("did-finish-load", () => {
      // Dá um tempo pro PDF carregar/renderizar internamente
      setTimeout(() => {
        win.webContents.print({ silent: true, deviceName: impressora }, (success, err) => {
          if (!success) erro(`Erro ao imprimir PDF: ${err}`);
          win.close();

          resolve({
            status: success ? "success" : "error",
            message: success ? "PDF impresso com sucesso!" : err,
            acao: "imprimirBase64"
          });
        });
      }, 3000);
    });
  });
}

module.exports = {
  createWindowHTML,
  visualizarPDFBase64,
  imprimirPDFBase64
};
