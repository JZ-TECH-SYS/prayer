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
        logger.error("Falha ao verificar compartilhamento", { error: error.message });
        return reject(error.message);
      }
      const ok = stdout.toLowerCase().includes(printerName.toLowerCase());
      logger.debug("Compartilhamento verificado", { printerName, ok });
      resolve(ok);
    });
  });
}

async function listarImpressoras() {
  try {
    let nomes = [];
    if (os.platform() === "win32") {
      const ps = `powershell -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name"`;
      const { stdout } = await execPromise(ps);
      nomes = stdout.split("\n").map(l => l.trim()).filter(Boolean);
    } else {
      const { stdout } = await execPromise("lpstat -p");
      nomes = stdout.split("\n").map(l => l.trim()).filter(l => l && l !== "printer");
    }
    logger.info("Impressoras listadas", { total: nomes.length });

    return JSON.stringify({
      status: "success",
      acao: "todasImpressoras",
      data: nomes
    });
  } catch (error) {
    erro(`Erro ao listar impressoras: ${error.message}`);
    logger.error("Erro ao listar impressoras", { error: error.message });
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
