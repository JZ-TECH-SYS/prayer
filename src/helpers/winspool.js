// src/helpers/winspool.js
//
// Interface assíncrona para o spooler do Windows. Toda chamada nativa roda em
// winspool-worker.js (worker thread), então o processo principal nunca trava.

const path = require("path");
const { Worker } = require("worker_threads");

const TIMEOUT_PADRAO = 30000;

let worker = null;
let seq = 0;
const pendentes = new Map();

function caminhoWorker() {
  // No app empacotado o worker e o koffi ficam em app.asar.unpacked (asarUnpack no package.json).
  return path.join(__dirname, "winspool-worker.js").replace(/app\.asar([\\/])/, "app.asar.unpacked$1");
}

function rejeitarTodos(err) {
  for (const { reject, timer } of pendentes.values()) {
    clearTimeout(timer);
    reject(err);
  }
  pendentes.clear();
}

function obterWorker() {
  if (worker) return worker;
  worker = new Worker(caminhoWorker());
  worker.on("message", (msg) => {
    const p = pendentes.get(msg.id);
    if (!p) return;
    pendentes.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.ok) p.resolve({ result: msg.result, ms: msg.ms });
    else {
      const e = new Error(msg.error.message);
      e.win32 = msg.error.win32;
      e.etapa = msg.error.etapa;
      e.ms = msg.ms;
      p.reject(e);
    }
  });
  worker.on("error", (e) => {
    worker = null;
    rejeitarTodos(e);
  });
  worker.on("exit", () => {
    worker = null;
    rejeitarTodos(new Error("worker do spooler finalizado"));
  });
  // Não segura o app aberto só por causa do worker.
  worker.unref();
  return worker;
}

function chamar(op, payload, timeout = TIMEOUT_PADRAO) {
  return new Promise((resolve, reject) => {
    const w = obterWorker();
    const id = ++seq;
    const timer = setTimeout(() => {
      pendentes.delete(id);
      // Worker preso (ex.: impressora de rede que não responde): descarta e recria no próximo pedido.
      try { w.terminate(); } catch (_) { }
      worker = null;
      reject(new Error(`spooler não respondeu em ${timeout / 1000}s (${op})`));
    }, timeout);
    pendentes.set(id, { resolve, reject, timer });
    w.postMessage({ id, op, ...payload });
  });
}

async function listarImpressorasSpooler({ detalhado = false } = {}) {
  const { result } = await chamar("list", { detalhado });
  return result;
}

/**
 * Envia bytes RAW (ESC/POS, ZPL, EPL...) direto para a fila da impressora.
 * O job aparece na fila do Windows assim que WritePrinter termina.
 */
async function imprimirRawSpooler(impressora, dados, documento) {
  const { result, ms } = await chamar("print", { impressora, dados, documento });
  return { ...result, ms };
}

function disponivel() {
  return process.platform === "win32";
}

module.exports = {
  disponivel,
  listarImpressorasSpooler,
  imprimirRawSpooler,
};
