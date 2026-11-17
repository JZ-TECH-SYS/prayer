// src/helpers/winspool.js
//
// Interface assíncrona para o spooler do Windows. Toda chamada nativa roda em
// winspool-worker.js (worker threads), então o processo principal nunca trava.
//
// Por que vários workers: em algumas máquinas o próprio spooler leva segundos por job
// (StartDocPrinter ~1 s + EndDocPrinter ~3 s, igual a qualquer impressão do Windows).
// Com um worker só, 3 vales esperavam um ao outro (~12 s); em paralelo saem em ~5 s.
//
// Ordem garantida por impressora: o próximo job só começa depois que o anterior passou do
// StartDocPrinter (momento em que o Windows define a posição do job na fila).

const path = require("path");
const { Worker } = require("worker_threads");

const TIMEOUT_PADRAO = 30000;
const MAX_WORKERS = 4;

let seq = 0;
const ociosos = [];
const todos = new Set();
const pendentes = new Map(); // id -> { resolve, reject, timer, worker, aoIniciar }
const espera = []; // pedidos aguardando worker livre
const portoes = new Map(); // impressora -> { aberto: bool, fila: [] }

function caminhoWorker() {
  // No app empacotado o worker e o koffi ficam em app.asar.unpacked (asarUnpack no package.json).
  return path.join(__dirname, "winspool-worker.js").replace(/app\.asar([\\/])/, "app.asar.unpacked$1");
}

function criarWorker() {
  const w = new Worker(caminhoWorker());
  todos.add(w);
  w.on("message", (msg) => {
    const p = pendentes.get(msg.id);
    if (!p) return;
    if (msg.fase === "iniciado") {
      if (p.aoIniciar) p.aoIniciar();
      p.aoIniciar = null;
      return;
    }
    pendentes.delete(msg.id);
    clearTimeout(p.timer);
    if (p.aoIniciar) p.aoIniciar(); // falhou antes do StartDoc: libera a impressora mesmo assim
    liberar(w);
    if (msg.ok) p.resolve({ result: msg.result, ms: msg.ms });
    else {
      const e = new Error(msg.error.message);
      e.win32 = msg.error.win32;
      e.etapa = msg.error.etapa;
      e.ms = msg.ms;
      p.reject(e);
    }
  });
  const morreu = (err) => {
    if (!todos.has(w)) return;
    descartar(w);
    for (const [id, p] of pendentes) {
      if (p.worker !== w) continue;
      pendentes.delete(id);
      clearTimeout(p.timer);
      if (p.aoIniciar) p.aoIniciar();
      p.reject(err || new Error("worker do spooler finalizado"));
    }
    despachar();
  };
  w.on("error", morreu);
  w.on("exit", () => morreu());
  // Não segura o app aberto só por causa dos workers.
  w.unref();
  return w;
}

function descartar(w) {
  todos.delete(w);
  const i = ociosos.indexOf(w);
  if (i >= 0) ociosos.splice(i, 1);
}

function liberar(w) {
  if (todos.has(w)) ociosos.push(w);
  despachar();
}

function obterWorkerLivre() {
  if (ociosos.length) return ociosos.pop();
  if (todos.size < MAX_WORKERS) return criarWorker();
  return null;
}

function despachar() {
  while (espera.length) {
    const w = obterWorkerLivre();
    if (!w) return;
    executar(w, espera.shift());
  }
}

function executar(w, pedido) {
  const { id, op, payload, timeout, resolve, reject, aoIniciar } = pedido;
  const timer = setTimeout(() => {
    const p = pendentes.get(id);
    if (!p) return;
    pendentes.delete(id);
    // Worker preso (ex.: impressora de rede que não responde): descarta; outro assume os próximos.
    descartar(w);
    try { w.terminate(); } catch (_) { }
    if (p.aoIniciar) p.aoIniciar();
    reject(new Error(`spooler não respondeu em ${timeout / 1000}s (${op})`));
    despachar();
  }, timeout);
  pendentes.set(id, { resolve, reject, timer, worker: w, aoIniciar });
  w.postMessage({ id, op, ...payload });
}

function chamar(op, payload, { timeout = TIMEOUT_PADRAO, aoIniciar = null } = {}) {
  return new Promise((resolve, reject) => {
    espera.push({ id: ++seq, op, payload, timeout, resolve, reject, aoIniciar });
    despachar();
  });
}

async function listarImpressorasSpooler({ detalhado = false } = {}) {
  const { result } = await chamar("list", { detalhado });
  return result;
}

function portao(impressora) {
  const chave = String(impressora).toLowerCase();
  if (!portoes.has(chave)) portoes.set(chave, { aberto: true, fila: [] });
  return portoes.get(chave);
}

function proximoDoPortao(p) {
  const prox = p.fila.shift();
  if (prox) prox();
  else p.aberto = true;
}

/**
 * Envia bytes RAW (ESC/POS, ZPL, EPL...) direto para a fila da impressora.
 * O job aparece na fila do Windows assim que StartDocPrinter devolve o número do job.
 * Jobs da mesma impressora entram na fila na ordem em que foram pedidos.
 */
function imprimirRawSpooler(impressora, dados, documento) {
  const p = portao(impressora);
  return new Promise((resolve, reject) => {
    const iniciar = () => {
      let liberado = false;
      const liberarPortao = () => {
        if (liberado) return;
        liberado = true;
        proximoDoPortao(p);
      };
      chamar("print", { impressora, dados, documento }, { aoIniciar: liberarPortao })
        .then(({ result, ms }) => resolve({ ...result, ms }))
        .catch(reject)
        .finally(liberarPortao);
    };
    if (p.aberto) {
      p.aberto = false;
      iniciar();
    } else {
      p.fila.push(iniciar);
    }
  });
}

function disponivel() {
  return process.platform === "win32";
}

module.exports = {
  disponivel,
  listarImpressorasSpooler,
  imprimirRawSpooler,
};
