const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Cache simples para evitar chamadas repetidas
let printersCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 30000; // 30 segundos

function runPS(ps) {
  try {
    // Criar um arquivo temporário com nome mais único para evitar conflitos
    const tempFile = path.join(os.tmpdir(), `prayer-ps-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.ps1`);
    
    // Escrever o script no arquivo temporário
    fs.writeFileSync(tempFile, ps, { encoding: "utf8" });
    
    const result = execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tempFile}"`, { 
      encoding: "utf8",
      timeout: 15000,
      maxBuffer: 1024 * 1024,
      stdio: ['pipe', 'pipe', 'ignore'] // Ignorar stderr
    });
    
    // Limpar arquivo temporário de forma mais segura
    setTimeout(() => {
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch (e) {
        // Ignorar erro ao limpar arquivo temporário
      }
    }, 1000);
    
    return result;
  } catch (error) {
    console.error("Erro ao executar PowerShell:", error.message);
    throw error;
  }
}

function getPrintersViaPowerShellSimple() {
  try {
    // Usar apenas PowerShell sem arquivos temporários para evitar conflitos
    const psCommand = `Get-WmiObject -Class Win32_Printer | ForEach-Object { Write-Output "$($_.Name)|$($_.ShareName)|$($_.DriverName)|$($_.PortName)|$($_.Shared)|$($_.WorkOffline)" }`;
    
    const result = execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${psCommand}"`, {
      encoding: "utf8",
      timeout: 10000,
      maxBuffer: 512 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'] // Ignorar stdin e stderr
    });
    
    const lines = result.split('\n')
      .map(line => line.trim())
      .filter(line => line && line.includes('|'));
    
    const printers = [];
    
    for (const line of lines) {
      const parts = line.split('|').map(p => (p || '').trim());
      if (parts.length >= 4 && parts[0]) {
        printers.push({
          Name: parts[0] || "",
          ShareName: parts[1] || null,
          DriverName: parts[2] || "",
          PortName: parts[3] || "",
          Shared: parts[4] === "True",
          WorkOffline: parts[5] === "True"
        });
      }
    }
    
    return printers;
  } catch (error) {
    console.error("Erro ao obter impressoras via PowerShell simples:", error.message);
    return [];
  }
}

function getPrintersViaWMI() {
  try {
    const ps = `$printers = Get-WmiObject -Class Win32_Printer | Select-Object Name,ShareName,DriverName,PortName,Shared,WorkOffline
if ($printers) {
    $printers | ConvertTo-Json -Compress
} else {
    Write-Output "[]"
}`;
    
    const out = runPS(ps);
    const cleanOut = out.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
    
    if (!cleanOut || cleanOut === '[]') {
      return [];
    }
    
    const list = JSON.parse(cleanOut);
    return Array.isArray(list) ? list : [list];
  } catch (error) {
    console.error("Erro ao obter impressoras via WMI:", error.message);
    return [];
  }
}

function getPrinters() {
  // Verificar cache primeiro
  const now = Date.now();
  if (printersCache && (now - cacheTimestamp) < CACHE_DURATION) {
    return printersCache;
  }

  let lastError = null;
  let result = [];
  
  // Primeira tentativa: usar PowerShell simples (sem arquivos temporários)
  try {
    result = getPrintersViaPowerShellSimple();
    if (result && result.length > 0) {
      printersCache = result;
      cacheTimestamp = now;
      return result;
    }
  } catch (error) {
    lastError = error;
    console.error("Erro ao obter impressoras via PowerShell simples:", error.message);
  }

  // Segunda tentativa: usar Get-WmiObject via arquivo temporário
  try {
    result = getPrintersViaWMI();
    if (result && result.length > 0) {
      printersCache = result;
      cacheTimestamp = now;
      return result;
    }
  } catch (error) {
    lastError = error;
    console.error("Erro ao obter impressoras via WMI/PowerShell:", error.message);
  }

  // Terceira tentativa: fallback básico - apenas listar nomes
  try {
    const psCommand = `Get-WmiObject -Class Win32_Printer | ForEach-Object { $_.Name }`;
    const result = execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${psCommand}"`, {
      encoding: "utf8",
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    
    const names = result.split('\n')
      .map(line => line.trim())
      .filter(name => name);
    
    if (names.length > 0) {
      const basicPrinters = names.map(name => ({
        Name: name,
        ShareName: null,
        DriverName: "",
        PortName: "",
        Shared: false,
        WorkOffline: false
      }));
      
      printersCache = basicPrinters;
      cacheTimestamp = now;
      return basicPrinters;
    }
  } catch (error) {
    lastError = error;
    console.error("Erro ao obter impressoras com fallback básico:", error.message);
  }

  // Se todas as tentativas falharam, usar cache antigo se disponível
  if (printersCache) {
    console.warn("Usando cache antigo de impressoras devido a erros.");
    return printersCache;
  }

  // Se não há cache e todas as tentativas falharam, retornar array vazio
  if (lastError) {
    console.error("Todas as tentativas de obter impressoras falharam. Último erro:", lastError.message);
  }
  
  return [];
}

function sanitizeHint(raw) {
  return String(raw || "")
    .replace(/^\\\\(localhost|127\.0\.0\.1|%COMPUTERNAME%)\\/, "")
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F]/g, "") // controles
    .replace(/\u00A0/g, " ")               // NBSP -> espaço normal
    .trim();
}

function sanitizeShareName(raw) {
  let s = (raw || "")
    .replace(/^\\\\(localhost|127\.0\.0\.1|%COMPUTERNAME%)\\/, "")
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F]/g, "") // controles
    .replace(/\u00A0/g, " ")               // NBSP -> espaço normal
    .trim();

  // caracteres seguros para share name
  if (!/^[\w.\-$]{1,80}$/.test(s)) {
    throw new Error(`Nome de compartilhamento inválido: "${raw}" -> "${s}"`);
  }
  return s;
}

function hasShareExact(share) {
  const printers = getPrinters();
  return printers.some(p => (p.ShareName || "").toLowerCase() === String(share).toLowerCase());
}

function resolvePrinter(hintRaw) {
  if (!hintRaw) return null;

  // Se já veio UNC, usar direto no COPY
  if (/^\\\\/.test(hintRaw)) {
    return { queueName: null, sharePath: hintRaw, meta: null };
  }

  const printers = getPrinters();
  const hint = sanitizeHint(hintRaw);

  // 1) bate com ShareName (preferência para RAW)
  let p = printers.find(x => (x.ShareName || "").toLowerCase() === hint.toLowerCase());
  if (p) return { queueName: p.Name, sharePath: `\\\\localhost\\${p.ShareName}`, meta: p };

  // 2) bate com Name (fila) — útil para PDF
  p = printers.find(x => (x.Name || "").toLowerCase() === hint.toLowerCase());
  if (p) return { queueName: p.Name, sharePath: p.ShareName ? `\\\\localhost\\${p.ShareName}` : null, meta: p };

  // 3) tentativa de fuzzy (opcional)
  p = printers.find(x => {
    const n1 = (x.Name || "").toLowerCase();
    const n2 = (x.ShareName || "").toLowerCase();
    return n1.includes(hint.toLowerCase()) || n2.includes(hint.toLowerCase());
  });
  if (p) return { queueName: p.Name, sharePath: p.ShareName ? `\\\\localhost\\${p.ShareName}` : null, meta: p };

  return null;
}

function snapshotPrinters(logger) {
  const printers = getPrinters();
  if (logger) {
    logger.info("Printers snapshot", {
      user: process.env.USERNAME || process.env.USER || null,
      printers
    });
  }
  return printers;
}

// Função para limpar cache manualmente
function clearPrintersCache() {
  printersCache = null;
  cacheTimestamp = 0;
  console.log("🧹 Cache de impressoras limpo manualmente");
}

// Wrapper principal que trata erros EPIPE especificamente
function getPrintersSeguro() {
  try {
    return getPrinters();
  } catch (error) {
    // Se for erro EPIPE, tentar uma vez mais após um pequeno delay
    if (error.code === 'EPIPE' || error.message.includes('EPIPE') || error.message.includes('broken pipe')) {
      console.warn("Erro EPIPE detectado, tentando novamente após delay...");
      try {
        // Limpar cache para forçar nova tentativa
        printersCache = null;
        cacheTimestamp = 0;
        
        // Delay pequeno antes de tentar novamente
        const start = Date.now();
        while (Date.now() - start < 100) {
          // Busy wait de 100ms
        }
        
        return getPrinters();
      } catch (secondError) {
        console.error("Segunda tentativa também falhou:", secondError.message);
        
        // Retornar lista básica de emergência se disponível
        if (printersCache && printersCache.length > 0) {
          return printersCache;
        }
        
        // Lista de emergência com impressoras comuns
        return [
          { Name: "Microsoft Print to PDF", ShareName: null, DriverName: "Microsoft Print To PDF", PortName: "PORTPROMPT:", Shared: false, WorkOffline: false }
        ];
      }
    }
    
    // Para outros tipos de erro, apenas logar e retornar vazio
    console.error("Erro ao obter impressoras:", error.message);
    return [];
  }
}

module.exports = {
  getPrinters: getPrintersSeguro, // Usar a versão segura como padrão
  getPrintersOriginal: getPrinters, // Manter acesso à versão original se necessário
  clearPrintersCache, // Função para limpar cache
  hasShareExact,
  resolvePrinter,
  sanitizeShareName,
  snapshotPrinters
};
