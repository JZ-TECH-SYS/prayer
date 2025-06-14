const os = require("os");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { gerarNomeUnico } = require("./arquivos");
const { verificarCompartilhamento } = require("./sistema");
const { erro } = require("../core/notificacao");
const iconv = require("iconv-lite");
const { print } = require('pdf-to-printer');


async function imprimirCuponTermica(base64, impressora) {
  if (!base64 || !impressora) {
    return { status: "error", message: "Base64 ou impressora não informados" };
  }

  try {
    const nomeTemp = `temp_${Date.now()}.pdf`;
    const caminhoPDF = path.join(os.tmpdir(), nomeTemp);

    // Salva o PDF em arquivo temporário
    fs.writeFileSync(caminhoPDF, Buffer.from(base64, "base64"));

    console.log("Imprimindo PDF...", caminhoPDF);
    // Envia via printer.printDirect
    try {
      await print(caminhoPDF, {
        printer: impressora,
        scale: "fit",
        silent: true,
        monochrome: true
      }).then(console.log);
    } finally {
      // Remove o arquivo temporário
      fs.unlink(caminhoPDF);
    }

    return { status: "success", message: "PDF enviado para a impressora", acao: "imprimirPDF" };
  } catch (e) {
    return { status: "error", message: e.message };
  }
}

async function imprimirTexto(dados) {
  const { impressora, msg } = dados;
  console.log("Imprimindo IMpresora...", impressora);
  console.log("Imprimindo msg...", msg);
  if (!impressora || !msg) {
    console.error("Impressora ou mensagem não informada!");
    return { status: "error", message: "Dados inválidos" };
  }

  const compartilhada = await verificarCompartilhamento(impressora);
  if (!compartilhada) {
    return { status: "error", message: "Impressora não compartilhada" };
  }

  // converte msg (UTF-8) para CP850
  const buffer = iconv.encode(msg, "CP850");
  const filePath = path.join(os.tmpdir(), gerarNomeUnico("txt"));
  fs.writeFileSync(filePath, buffer);

  return new Promise((resolve) => {
    const printerPath = `\\\\localhost\\${impressora}`;
    const cmd = `copy /b "${filePath}" "${printerPath}"`;

    exec(cmd, (error) => {
      if (error) {
        console.error("Erro ao imprimir:", error.message);
        return resolve({ status: "error", message: error.message });
      }
      resolve({ status: "success", message: "Impresso com sucesso", acao: "imprimir" });
    });
  });
}


module.exports = {
  imprimirTexto,
  imprimirCuponTermica
};