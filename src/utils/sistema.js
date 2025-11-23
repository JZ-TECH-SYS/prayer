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
      // Usar método seguro que evita problemas com Get-Printer
      try {
        // Primeira tentativa: PowerShell com WMI (mais confiável)
        const ps = `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-WmiObject -Class Win32_Printer | ForEach-Object { $_.Name }"`;
        const { stdout } = await execPromise(ps, { timeout: 10000 });
        nomes = stdout.split("\n").map(l => l.trim()).filter(Boolean);
      } catch (psError) {
        logger.warn("Método primário WMI falhou, tentando alternativa", {
          erro: psError.message,
          metodoFalhou: "PowerShell WMI",
          proximaTentativa: "módulo impressoras"
        });

        // Segunda tentativa: usar a função já corrigida do módulo impressoras
        try {
          const { getPrinters } = require("../helpers/impressoras");
          const impressoras = getPrinters();
          nomes = impressoras.map(p => p.Name).filter(Boolean);
        } catch (moduleError) {
          logger.warn("Método alternativo falhou, usando fallback final", {
            erro: moduleError.message,
            metodoFalhou: "módulo impressoras",
            ultimaTentativa: "PowerShell básico"
          });

          // Terceira tentativa: fallback mais simples
          const fallbackPs = `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-WmiObject -Class Win32_Printer | Select-Object -ExpandProperty Name"`;
          const { stdout } = await execPromise(fallbackPs, { timeout: 5000 });
          nomes = stdout.split("\n").map(l => l.trim()).filter(Boolean);
        }
      }
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
