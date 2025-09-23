const { execSync } = require("child_process");

function runPS(ps) {
  return execSync(`powershell -NoProfile -Command "${ps}"`, { encoding: "utf8" });
}

function getPrinters() {
  try {
    const ps = `Get-Printer | Select-Object Name,ShareName,DriverName,PortName,Shared,WorkOffline | ConvertTo-Json -Compress`;
    const out = runPS(ps);
    const list = JSON.parse(out);
    return Array.isArray(list) ? list : [list];
  } catch {
    return [];
  }
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

module.exports = {
  getPrinters,
  hasShareExact,
  resolvePrinter,
  sanitizeShareName,
  snapshotPrinters
};
