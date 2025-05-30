const os = require("os");
const { exec } = require("child_process");
const util = require("util");
const { erro } = require("../core/notificacao");

const execPromise = util.promisify(exec);

function verificarCompartilhamento(printerName) {
  return new Promise((resolve, reject) => {
    exec("net share", (error, stdout) => {
      if (error) return reject(error.message);
      resolve(stdout.toLowerCase().includes(printerName.toLowerCase()));
    });
  });
}

async function listarImpressoras() {
  try {
    const cmd = os.platform() === "win32" ? "wmic printer get name" : "lpstat -p";
    const { stdout } = await execPromise(cmd);
    const nomes = stdout.split("\n").map(l => l.trim()).filter(l => l && l !== "Name" && l !== "printer");

    return JSON.stringify({
      status: "success",
      acao: "todasImpressoras",
      data: nomes
    });
  } catch (error) {
    erro(`Erro ao listar impressoras: ${error.message}`);
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
