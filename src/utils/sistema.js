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
      // Usar método seguro que evita problemas com Get-Printer
      try {
        // Primeira tentativa: PowerShell com WMI (mais confiável)
        const ps = `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-WmiObject -Class Win32_Printer | ForEach-Object { $_.Name }"`;
        const { stdout } = await execPromise(ps, { timeout: 10000 });
        nomes = stdout.split("\n").map(l => l.trim()).filter(Boolean);
      } catch (psError) {
        logger.warn("Falha no PowerShell WMI, tentando método alternativo", { error: psError.message });
        
        // Segunda tentativa: usar a função já corrigida do módulo impressoras
        try {
          const { getPrinters } = require("../helpers/impressoras");
          const impressoras = getPrinters();
          nomes = impressoras.map(p => p.Name).filter(Boolean);
        } catch (moduleError) {
          logger.warn("Falha no módulo impressoras, usando fallback básico", { error: moduleError.message });
          
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
