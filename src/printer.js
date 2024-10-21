const os = require("os");
const fs = require("fs");
const path = require("path");
const util = require("util");
const { erro } = require("./notificacao");
const { BrowserWindow } = require("electron");
const { exec } = require("child_process");

const execPromise = util.promisify(exec);

const erroImpressora = JSON.stringify({
  status: "error",
  message: "Impressora ou mensagem não informada!",
});

async function verificarCompartilhamento(printerName) {
  return new Promise((resolve, reject) => {
    exec('net share', (error, stdout, stderr) => {
      if (error) {
        reject(`Erro ao verificar compartilhamento: ${error.message}`);
      }
      const compartilhadas = stdout.toLowerCase();
      resolve(compartilhadas.includes(printerName.toLowerCase()));
    });
  });
}

function gerarNomeUnico() {
  const now = new Date();
  const timestamp = now.getFullYear().toString() + 
                    (now.getMonth() + 1).toString().padStart(2, '0') + 
                    now.getDate().toString().padStart(2, '0') + 
                    now.getHours().toString().padStart(2, '0') + 
                    now.getMinutes().toString().padStart(2, '0') + 
                    now.getSeconds().toString().padStart(2, '0') + 
                    now.getMilliseconds().toString().padStart(3, '0');
  const randomPart = Math.floor(Math.random() * 10000);  // Número aleatório de 4 dígitos
  return `temp_file_print_${timestamp}_${randomPart}.txt`;
}

function createWindow(dados) {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: false, // Não mostra a janela
    webPreferences: {
      nodeIntegration: true,
    },
  });

  win.loadURL(
    `data:text/html,<html><body><pre>${dados.msg}</pre></body></html>`
  );
  return win;
}

async function imprimirHTML(dados) {
  try {
    const printWindow = createWindow(dados);
    printWindow.webContents.on("did-finish-load", () => {
      printWindow.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: dados.impresora,
        },
        (success, failureReason) => {
          if (!success) {
            erro(`Erro na impressão: ${failureReason}`);
          }

          printWindow.close();
        }
      );
    });

    return JSON.stringify({
      status: "success",
      message: "Impressão realizada com sucesso!",
      acao: "imprimirHTML"
    });
  } catch (error) {
    console.error(`Erro ao imprimir: ${error.message}`);
    return JSON.stringify({
      status: "error",
      message: "Erro ao imprimir.",
      details: error.message,
    });
  }
}

async function todasImpressoras() {
  try {
    let comando = os.platform() === "win32" ? "wmic printer get name" : "lpstat -p";
    const { stdout, stderr } = await execPromise(comando);
    if (stderr) {
      throw new Error(`Erro: ${stderr}`);
    }

    const devices = [];
    stdout.split("\n").forEach((line) => {
      const printerName = line.trim();
      if (printerName && printerName !== "Name" && printerName !== "printer") {
        devices.push(printerName);
      }
    });

    return JSON.stringify({
      status: "success",
      message: "Impressoras encontradas!",
      acao: "todasImpressoras",
      data: devices
    });
  } catch (error) {
    erro(`Erro ao listar impressoras: ${error.message}`);
    return JSON.stringify({
      status: "error",
      message: "Erro ao listar impressoras.",
      acao: "todasImpressoras"
    });
  }
}

async function imprimir(dados) {
  let printerName = dados.impresora;
  let data = dados.msg;

  // Verificar se a impressora está compartilhada
  const impressoraCompartilhada = await verificarCompartilhamento(printerName);
  if (!impressoraCompartilhada) {
    erro(`Impressora ${printerName} não está compartilhada.`);
    return JSON.stringify({
      status: "error",
      message: `Impressora ${printerName} não está compartilhada.`,
      acao: "imprimir"
    });
  }

  const uniqueFileName = gerarNomeUnico();
  const tempFilePath = path.join(os.tmpdir(), uniqueFileName);
  fs.writeFileSync(tempFilePath, data, "utf8");

  const command = `copy "${tempFilePath}" \\\\localhost\\"${printerName}"`;
  exec(command, (error, stdout, stderr) => {
    if (error) {
      erro(`Erro ao imprimir: ${error.message}`);
      return;
    }
  });

  return JSON.stringify({
    status: "success",
    message: "Impressão realizada com sucesso!",
    acao: "imprimir"
  });
}

async function gerenciarAcaoImpressao(dados) {
  let response = { status: "success", message: "Ação realizada com sucesso!" };
  switch (dados.acao) {
    case "todasImpressoras":
      response = await todasImpressoras();
      break;
    case "imprimir":
      if (!dados.impresora || !dados.msg) {
        erro("Impressora ou mensagem não informada!");
        return erroImpressora;
      }
      response = await imprimir(dados);
      break;
    case "imprimirHTML":
      if (!dados.impresora || !dados.msg) {
        erro("Impressora ou mensagem não informada!");
        return erroImpressora;
      }
      response = await imprimirHTML(dados);
      break;
    default:
      erro("Ação não reconhecida!");
      response = { status: "erro", message: "Ação não reconhecida!" };
      break;
  }

  return response;
}

module.exports = {
  gerenciarAcaoImpressao
};
