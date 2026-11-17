// src/helpers/winspool-worker.js
//
// Fala direto com o spooler do Windows (winspool.drv) via koffi, numa worker thread.
// Por que numa worker: OpenPrinter numa impressora de rede fora do ar pode demorar; aqui isso
// nunca trava o processo principal do Electron (antes o execSync do PowerShell travava tudo).
// Cada worker atende um pedido por vez; o winspool.js mantém vários workers e garante a ordem
// por impressora (o próximo job só chama StartDocPrinter depois que o anterior recebeu o número).
// No print, avisa {fase:"iniciado"} logo após o StartDocPrinter e depois manda o resultado final.

const { parentPort } = require("worker_threads");
const koffi = require("koffi");

const winspool = koffi.load("winspool.drv");
const kernel32 = koffi.load("kernel32.dll");

const HANDLE = koffi.pointer("HANDLE", koffi.opaque());

const DOC_INFO_1W = koffi.struct("DOC_INFO_1W", {
  pDocName: "str16",
  pOutputFile: "str16",
  pDatatype: "str16",
});

const PRINTER_INFO_4W = koffi.struct("PRINTER_INFO_4W", {
  pPrinterName: "str16",
  pServerName: "str16",
  Attributes: "uint32",
});

const PRINTER_INFO_2W = koffi.struct("PRINTER_INFO_2W", {
  pServerName: "str16",
  pPrinterName: "str16",
  pShareName: "str16",
  pPortName: "str16",
  pDriverName: "str16",
  pComment: "str16",
  pLocation: "str16",
  pDevMode: "void *",
  pSepFile: "str16",
  pPrintProcessor: "str16",
  pDatatype: "str16",
  pParameters: "str16",
  pSecurityDescriptor: "void *",
  Attributes: "uint32",
  Priority: "uint32",
  DefaultPriority: "uint32",
  StartTime: "uint32",
  UntilTime: "uint32",
  Status: "uint32",
  cJobs: "uint32",
  AveragePPM: "uint32",
});

const GetLastError = kernel32.func("uint32 __stdcall GetLastError()");
const EnumPrintersW = winspool.func(
  "bool __stdcall EnumPrintersW(uint32 Flags, str16 Name, uint32 Level, _Out_ uint8_t *pPrinterEnum, uint32 cbBuf, _Out_ uint32 *pcbNeeded, _Out_ uint32 *pcReturned)"
);
const OpenPrinterW = winspool.func("bool __stdcall OpenPrinterW(str16 pPrinterName, _Out_ HANDLE *phPrinter, void *pDefault)");
const ClosePrinter = winspool.func("bool __stdcall ClosePrinter(HANDLE hPrinter)");
const StartDocPrinterW = winspool.func("uint32 __stdcall StartDocPrinterW(HANDLE hPrinter, uint32 Level, DOC_INFO_1W *pDocInfo)");
const EndDocPrinter = winspool.func("bool __stdcall EndDocPrinter(HANDLE hPrinter)");
const AbortPrinter = winspool.func("bool __stdcall AbortPrinter(HANDLE hPrinter)");
const StartPagePrinter = winspool.func("bool __stdcall StartPagePrinter(HANDLE hPrinter)");
const EndPagePrinter = winspool.func("bool __stdcall EndPagePrinter(HANDLE hPrinter)");
const WritePrinter = winspool.func(
  "bool __stdcall WritePrinter(HANDLE hPrinter, const uint8_t *pBuf, uint32 cbBuf, _Out_ uint32 *pcWritten)"
);

const PRINTER_ENUM_LOCAL = 0x2;
const PRINTER_ENUM_CONNECTIONS = 0x4;
const PRINTER_ATTRIBUTE_SHARED = 0x8;
const PRINTER_ATTRIBUTE_WORK_OFFLINE = 0x400;

const MENSAGENS = {
  5: "acesso negado à impressora",
  1801: "impressora não existe no Windows (nome inválido)",
  1804: "a impressora não aceita impressão RAW (driver não suporta o tipo de dado)",
  1722: "servidor de impressão indisponível",
};

function falha(etapa) {
  const code = GetLastError();
  const e = new Error(`${etapa} falhou (Win32 ${code}${MENSAGENS[code] ? ": " + MENSAGENS[code] : ""})`);
  e.win32 = code;
  e.etapa = etapa;
  return e;
}

function enumerar(level, type) {
  const flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
  const needed = [0];
  const count = [0];
  EnumPrintersW(flags, null, level, null, 0, needed, count);
  if (!needed[0]) return [];
  const buf = Buffer.alloc(needed[0]);
  if (!EnumPrintersW(flags, null, level, buf, buf.length, needed, count)) throw falha("EnumPrinters");
  const size = koffi.sizeof(type);
  const out = [];
  for (let i = 0; i < count[0]; i++) out.push(koffi.decode(buf, i * size, type));
  return out;
}

function listar(detalhado) {
  if (!detalhado) {
    // Nível 4 vem do registro: rápido, não consulta servidor de rede.
    return enumerar(4, PRINTER_INFO_4W).map((p) => ({
      Name: p.pPrinterName,
      ServerName: p.pServerName || null,
      Shared: !!(p.Attributes & PRINTER_ATTRIBUTE_SHARED),
      WorkOffline: !!(p.Attributes & PRINTER_ATTRIBUTE_WORK_OFFLINE),
    }));
  }
  return enumerar(2, PRINTER_INFO_2W).map((p) => ({
    Name: p.pPrinterName,
    ShareName: p.pShareName || null,
    DriverName: p.pDriverName || "",
    PortName: p.pPortName || "",
    Shared: !!(p.Attributes & PRINTER_ATTRIBUTE_SHARED),
    WorkOffline: !!(p.Attributes & PRINTER_ATTRIBUTE_WORK_OFFLINE),
    Status: p.Status,
    Jobs: p.cJobs,
  }));
}

function imprimirRaw(impressora, dados, documento, aoIniciar) {
  const h = [null];
  if (!OpenPrinterW(impressora, h, null)) throw falha("OpenPrinter");
  let docAberto = false;
  try {
    const jobId = StartDocPrinterW(h[0], 1, { pDocName: documento || "PrayerApp RAW", pOutputFile: null, pDatatype: "RAW" });
    if (!jobId) throw falha("StartDocPrinter");
    docAberto = true;
    // O número do job (ordem na fila) já está definido: o próximo job da mesma impressora pode começar.
    aoIniciar(jobId);
    if (!StartPagePrinter(h[0])) throw falha("StartPagePrinter");
    const buf = Buffer.from(dados);
    const escritos = [0];
    if (!WritePrinter(h[0], buf, buf.length, escritos)) throw falha("WritePrinter");
    if (escritos[0] !== buf.length) {
      const e = new Error(`WritePrinter gravou ${escritos[0]} de ${buf.length} bytes`);
      e.etapa = "WritePrinter";
      throw e;
    }
    if (!EndPagePrinter(h[0])) throw falha("EndPagePrinter");
    if (!EndDocPrinter(h[0])) throw falha("EndDocPrinter");
    docAberto = false;
    return { jobId, bytes: buf.length };
  } catch (e) {
    if (docAberto) {
      try { AbortPrinter(h[0]); } catch (_) { }
    }
    throw e;
  } finally {
    ClosePrinter(h[0]);
  }
}

parentPort.on("message", (msg) => {
  const { id, op } = msg;
  const inicio = Date.now();
  try {
    let result;
    if (op === "list") result = listar(!!msg.detalhado);
    else if (op === "print") {
      result = imprimirRaw(msg.impressora, msg.dados, msg.documento, (jobId) =>
        parentPort.postMessage({ id, fase: "iniciado", jobId, ms: Date.now() - inicio })
      );
    }
    else throw new Error(`operação desconhecida: ${op}`);
    parentPort.postMessage({ id, ok: true, result, ms: Date.now() - inicio });
  } catch (e) {
    parentPort.postMessage({
      id,
      ok: false,
      error: { message: e.message, win32: e.win32 || null, etapa: e.etapa || null },
      ms: Date.now() - inicio,
    });
  }
});
