const os = require("os");
const { exec } = require("child_process");
const util = require("util");
const { erro } = require("../core/notificacao");
const { logger } = require("../core/logger");

const execPromise = util.promisify(exec);

function verificarCompartilhamento(printerName) {
  return new Promise((resolve, reject) => {
    exec("net share", (error, stdout) => {
      if (error) {
        logger.error("Falha na verificação de compartilhamento de impressora", {
          impressora: printerName,
          erro: error.message,
          comando: "net share"
        });
        return reject(error.message);
      }
      const ok = stdout.toLowerCase().includes(printerName.toLowerCase());
      logger.info("Verificação de compartilhamento concluída", {
        impressora: printerName,
        compartilhada: ok,
        metodo: "net share"
      });
      resolve(ok);
    });
  });
}

async function listarImpressoras() {
  try {
    let nomes = [];
    if (os.platform() === "win32") {
      // Spooler do Windows (winspool) numa worker thread; o PowerShell assíncrono fica só
      // como reserva dentro do getPrinters. Nada aqui trava o processo principal.
      const { getPrinters, clearPrintersCache } = require("../helpers/impressoras");
      clearPrintersCache(); // a lista pedida pelo cliente sempre reflete o Windows agora
      const impressoras = await getPrinters();
      nomes = impressoras.map(p => p.Name).filter(Boolean);
    } else {
      const { stdout } = await execPromise("lpstat -p");
      nomes = stdout.split("\n").map(l => l.trim()).filter(l => l && l !== "printer");
    }

    logger.info("Listagem de impressoras concluída com sucesso", {
      totalEncontradas: nomes.length,
      impressoras: nomes.slice(0, 5), // primeiras 5 para não poluir o log
      sistemaOperacional: os.platform()
    });

    return JSON.stringify({
      status: "success",
      acao: "todasImpressoras",
      data: nomes
    });
  } catch (error) {
    erro(`Erro ao listar impressoras: ${error.message}`);
    logger.error("Falha crítica na listagem de impressoras", {
      erro: error.message,
      stack: error.stack,
      sistemaOperacional: os.platform(),
      tentativasEsgotadas: true
    });
    return JSON.stringify({
      status: "error",
      acao: "todasImpressoras"
    });
  }
}

module.exports = {
  verificarCompartilhamento,
  listarImpressoras
};
