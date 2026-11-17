// tools/simulador-termica/termica.js
//
// Impressora térmica de mentira: escuta em 127.0.0.1:9100 (porta RAW padrão das térmicas de rede),
// recebe os bytes ESC/POS que o Windows manda e desenha o cupom no terminal.
// Cada job também é salvo em ./saida/<n>.bin (bytes crus) e ./saida/<n>.txt (como saiu no "papel").
//
// Uso: node tools/simulador-termica/termica.js [porta]

const net = require("net");
const fs = require("fs");
const path = require("path");

const PORTA = +process.argv[2] || 9100;
const LARGURA = 42;
const SAIDA = path.join(__dirname, "saida");
fs.mkdirSync(SAIDA, { recursive: true });

let jobs = 0;

function renderizar(buf) {
  const linhas = [];
  let linha = "";
  let alinhamento = 0; // 0 esq, 1 centro, 2 dir
  let negrito = false;
  let grande = false;
  let cortes = 0;
  let codigos = [];

  const fechar = () => {
    let txt = grande ? linha.toUpperCase().split("").join(" ") : linha;
    if (negrito && txt.trim()) txt = "*" + txt + "*";
    if (txt.length < LARGURA) {
      const sobra = LARGURA - txt.length;
      if (alinhamento === 1) txt = " ".repeat(Math.floor(sobra / 2)) + txt;
      else if (alinhamento === 2) txt = " ".repeat(sobra) + txt;
    }
    linhas.push(txt);
    linha = "";
  };

  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b === 0x1b) {
      const c = buf[++i];
      if (c === 0x40) { alinhamento = 0; negrito = false; grande = false; }        // ESC @
      else if (c === 0x61) alinhamento = buf[++i] % 48 % 3;                        // ESC a n
      else if (c === 0x21) { const n = buf[++i]; negrito = !!(n & 0x08); grande = !!(n & 0x30); } // ESC ! n
      else if (c === 0x45) negrito = !!buf[++i];                                   // ESC E n
      else i++;                                                                     // outro ESC x n
      continue;
    }
    if (b === 0x1d) {
      const c = buf[++i];
      if (c === 0x68 || c === 0x77 || c === 0x48 || c === 0x66) { i++; continue; } // GS h/w/H/f n
      if (c === 0x56) { cortes++; i++; if (buf[i] === 0x41 || buf[i] === 0x42) i++; continue; } // GS V m [n]
      if (c === 0x6b) {                                                             // GS k m dados
        const m = buf[++i];
        let dados = "";
        if (m <= 6) { while (i + 1 < buf.length && buf[i + 1] !== 0x00) dados += String.fromCharCode(buf[++i]); i++; }
        else { const n = buf[++i]; for (let k = 0; k < n; k++) dados += String.fromCharCode(buf[++i]); }
        codigos.push(dados);
        if (linha) fechar();
        const salva = alinhamento; alinhamento = 1;
        linha = "||| ||| | || |||| | ||| || |"; fechar();
        linha = `[codigo de barras ${m === 6 ? "Codabar" : "tipo " + m}: ${dados}]`; fechar();
        alinhamento = salva;
        continue;
      }
      i++;
      continue;
    }
    if (b === 0x0a) { fechar(); continue; }
    if (b === 0x0d || b === 0x00) continue;
    linha += b < 0x20 ? "" : String.fromCharCode(b);
  }
  if (linha) fechar();
  while (linhas.length && !linhas[linhas.length - 1].trim()) linhas.pop();
  return { linhas, cortes, codigos };
}

function utf8Suspeito(buf) {
  // Bytes UTF-8 de acento/NBSP (0xC2/0xC3 seguidos de 0x80-0xBF) saem como lixo numa térmica em CP850.
  const achados = [];
  for (let i = 0; i < buf.length - 1; i++) {
    if ((buf[i] === 0xc2 || buf[i] === 0xc3) && buf[i + 1] >= 0x80 && buf[i + 1] <= 0xbf) {
      achados.push(buf.slice(i, i + 2).toString("hex"));
      i++;
    }
  }
  return achados;
}

const server = net.createServer((sock) => {
  const n = ++jobs;
  const inicio = Date.now();
  const partes = [];
  sock.on("data", (d) => partes.push(d));
  sock.on("error", () => { });
  sock.on("close", () => {
    const buf = Buffer.concat(partes);
    if (!buf.length) return;
    const { linhas, cortes, codigos } = renderizar(buf);
    const hora = new Date().toLocaleTimeString("pt-BR", { hour12: false }) + "." + String(Date.now() % 1000).padStart(3, "0");
    const papel = [
      "+" + "-".repeat(LARGURA + 2) + "+",
      ...linhas.map((l) => "| " + l.slice(0, LARGURA).padEnd(LARGURA) + " |"),
      "+" + (cortes ? "~".repeat(LARGURA + 2) : "-".repeat(LARGURA + 2)) + "+",
    ].join("\n");
    fs.writeFileSync(path.join(SAIDA, `${n}.bin`), buf);
    fs.writeFileSync(path.join(SAIDA, `${n}.txt`), papel + "\n");
    console.log(`\n[${hora}] JOB #${n} recebido: ${buf.length} bytes, ${Date.now() - inicio} ms de conexão, corte: ${cortes ? "sim" : "NÃO"}${codigos.length ? ", código: " + codigos.join(",") : ""}`);
    const suspeitos = utf8Suspeito(buf);
    if (suspeitos.length) console.log(`  aviso: ${suspeitos.length} caractere(s) UTF-8 (${[...new Set(suspeitos)].join(" ")}) — numa térmica em CP850 saem como lixo`);
    console.log(papel);
  });
});

server.on("error", (e) => {
  console.error(e.code === "EADDRINUSE" ? `Porta ${PORTA} ocupada.` : e.message);
  process.exit(1);
});

server.listen(PORTA, "127.0.0.1", () => {
  console.log(`Térmica simulada ouvindo em 127.0.0.1:${PORTA}. Jobs em ${SAIDA}. Ctrl+C para sair.`);
});
