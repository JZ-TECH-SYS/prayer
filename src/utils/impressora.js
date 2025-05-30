const os = require("os");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { gerarNomeUnico } = require("./arquivos");
const { verificarCompartilhamento } = require("./sistema");
const { erro } = require("../core/notificacao");
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
        printer:impressora,
        scale: "fit",
        silent: true
      }).then(console.log);
    }finally {
      // Remove o arquivo temporário
      fs.unlink(caminhoPDF);
    }

    return { status: "success", message: "PDF enviado para a impressora", acao: "imprimirPDF" };
  } catch (e) {
    return { status: "error", message: e.message };
  }
}

function imprimirTexto(dados) {
  const { impressora, msg } = dados;
  return new Promise(async (resolve) => {
    if (!impressora || !msg) {
      erro("Impressora ou mensagem não informada!");
      return resolve({ status: "error", message: "Dados inválidos" });
    }

    const compartilhada = await verificarCompartilhamento(impressora);
    if (!compartilhada) {
      return resolve({ status: "error", message: "Impressora não compartilhada" });
    }

    const filePath = path.join(os.tmpdir(), gerarNomeUnico("txt"));
    fs.writeFileSync(filePath, msg, "utf8");

    exec(`copy "${filePath}" \\\\localhost\\"${impressora}"`, (error) => {
      if (error) erro(`Erro ao imprimir: ${error.message}`);
    });

    resolve({ status: "success", message: "Impresso com sucesso", acao: "imprimir" });
  });
}

module.exports = {
  imprimirTexto,
  imprimirCuponTermica
};