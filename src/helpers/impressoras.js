const { exec } = require("child_process");
const util = require("util");
const { disponivel, listarImpressorasSpooler } = require("./winspool");

const execPromise = util.promisify(exec);

// Listar pelo spooler custa poucos ms; o cache curto só evita repetir a chamada
// quando chegam vários pedidos de impressão em sequência.
const CACHE_DURATION = 5000;
let printersCache = null;
let cacheTimestamp = 0;

async function getPrintersViaSpooler() {
  // Nível 2 traz ShareName/Driver/Porta; nível 4 (registro) garante que conexões de rede
  // que não responderam ao nível 2 continuem na lista.
  const [detalhadas, nomes] = await Promise.all([
    listarImpressorasSpooler({ detalhado: true }),
    listarImpressorasSpooler({ detalhado: false }),
  ]);
  const porNome = new Map(detalhadas.map((p) => [p.Name.toLowerCase(), p]));
  for (const p of nomes) {
    if (!porNome.has(p.Name.toLowerCase())) {
      porNome.set(p.Name.toLowerCase(), {
        Name: p.Name,
        ShareName: null,
        DriverName: "",
        PortName: "",
        Shared: p.Shared,
        WorkOffline: p.WorkOffline,
      });
    }
  }
  return [...porNome.values()];
}

// Reserva para quando o spooler nativo não carregar: PowerShell assíncrono (não trava o app).
async function getPrintersViaPowerShell() {
  const ps =
    "Get-CimInstance -ClassName Win32_Printer | Select-Object Name,ShareName,DriverName,PortName,Shared,WorkOffline | ConvertTo-Json -Compress";
  const encoded = Buffer.from(ps, "utf16le").toString("base64");
  const { stdout } = await execPromise(`powershell.exe -NoProfile -NonInteractive -EncodedCommand ${encoded}`, {
    timeout: 15000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  const txt = stdout.trim();
  if (!txt) return [];
  const list = JSON.parse(txt);
  return (Array.isArray(list) ? list : [list]).map((p) => ({
    Name: p.Name || "",
    ShareName: p.ShareName || null,
    DriverName: p.DriverName || "",
    PortName: p.PortName || "",
    Shared: !!p.Shared,
    WorkOffline: !!p.WorkOffline,
  }));
}

async function getPrinters() {
  const now = Date.now();
  if (printersCache && now - cacheTimestamp < CACHE_DURATION) return printersCache;

  let result = null;
  if (disponivel()) {
    try {
      result = await getPrintersViaSpooler();
    } catch (e) {
      console.error("Spooler nativo indisponível, usando PowerShell:", e.message);
    }
  }
  if (!result) {
    try {
      result = await getPrintersViaPowerShell();
    } catch (e) {
      console.error("Erro ao obter impressoras via PowerShell:", e.message);
      return printersCache || [];
    }
  }
  printersCache = result;
  cacheTimestamp = now;
  return result;
}

function sanitizeHint(raw) {
  return String(raw || "")
    .replace(/^\\\\(localhost|127\.0\.0\.1|%COMPUTERNAME%)\\/, "")
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F]/g, "") // controles
    .replace(/ /g, " ")               // NBSP -> espaço normal
    .trim();
}

function sanitizeShareName(raw) {
  let s = (raw || "")
    .replace(/^\\\\(localhost|127\.0\.0\.1|%COMPUTERNAME%)\\/, "")
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F]/g, "") // controles
    .replace(/ /g, " ")               // NBSP -> espaço normal
    .trim();

  // caracteres seguros para share name
  if (!/^[\w.\-$]{1,80}$/.test(s)) {
    throw new Error(`Nome de compartilhamento inválido: "${raw}" -> "${s}"`);
  }
  return s;
}

async function hasShareExact(share) {
  const printers = await getPrinters();
  return printers.some((p) => (p.ShareName || "").toLowerCase() === String(share).toLowerCase());
}

/**
 * Resolve o nome recebido do cliente para a fila do Windows.
 * queueName = nome da fila (usado no OpenPrinter); sharePath só para destino UNC.
 */
async function resolvePrinter(hintRaw) {
  if (!hintRaw) return null;

  const printers = await getPrinters();

  // UNC (\\servidor\share): se for uma conexão instalada, usa a fila; senão copy /b direto.
  if (/^\\\\/.test(hintRaw) && !/^\\\\(localhost|127\.0\.0\.1)\\/i.test(hintRaw)) {
    const con = printers.find((x) => (x.Name || "").toLowerCase() === hintRaw.toLowerCase());
    return { queueName: con ? con.Name : null, sharePath: hintRaw, meta: con || null };
  }

  const hint = sanitizeHint(hintRaw).toLowerCase();
  const montar = (p) => ({ queueName: p.Name, sharePath: p.ShareName ? `\\\\localhost\\${p.ShareName}` : null, meta: p });

  // 1) nome da fila (é o que o todasImpressoras devolve)
  let p = printers.find((x) => (x.Name || "").toLowerCase() === hint);
  if (p) return montar(p);

  // 2) nome do compartilhamento
  p = printers.find((x) => (x.ShareName || "").toLowerCase() === hint);
  if (p) return montar(p);

  // 3) aproximado
  p = printers.find((x) => (x.Name || "").toLowerCase().includes(hint) || (x.ShareName || "").toLowerCase().includes(hint));
  if (p) return montar(p);

  return null;
}

async function snapshotPrinters(logger) {
  const printers = await getPrinters();
  if (logger) {
    logger.info("Printers snapshot", {
      user: process.env.USERNAME || process.env.USER || null,
      printers,
    });
  }
  return printers;
}

function clearPrintersCache() {
  printersCache = null;
  cacheTimestamp = 0;
}

module.exports = {
  getPrinters,
  getPrintersOriginal: getPrinters,
  clearPrintersCache,
  hasShareExact,
  resolvePrinter,
  sanitizeShareName,
  snapshotPrinters,
};
