const os = require("os");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { gerarNomeUnico } = require("./arquivos");
const { erro } = require("../core/notificacao");
const iconv = require("iconv-lite");
const { print } = require('pdf-to-printer');
const { logger, getLogDir } = require("../core/logger");
const { resolvePrinter, snapshotPrinters } = require("../helpers/impressoras");
function criarArquivoTemporario(buffer, ext, contextoLog) {
  const erros = [];
  const baseLogDir = getLogDir && typeof getLogDir === 'function' ? getLogDir() : null;
  const candidatos = [
    // 1) exatamente a mesma pasta dos logs (mais chance de permissão ok)
    baseLogDir,
    // 2) subpasta "spool" junto aos logs
    baseLogDir ? path.join(baseLogDir, "spool") : null,
    // 3) caminhos baseados no TMP
    path.join(os.tmpdir(), "prayer"),
    path.join(os.tmpdir(), "prayer", "spool"),
  ].filter(Boolean);

  for (const dir of candidatos) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, gerarNomeUnico(ext));
      fs.writeFileSync(filePath, buffer);
      const ok = fs.existsSync(filePath);
      const size = ok ? fs.statSync(filePath).size : 0;
      if (ok && size === buffer.length) {
        logger.debug("Arquivo temporário criado", { filePath, bytes: size, dir, ...(contextoLog || {}) });
        return filePath;
      }
      erros.push({ dir, motivo: `verificação falhou (ok=${ok}, size=${size})` });
    } catch (e) {
      erros.push({ dir, erro: e && e.message });
    }
  }
  logger.error("Falha ao criar arquivo temporário em todos os diretórios", { candidatos, erros, ...(contextoLog || {}) });
  return null;
}



async function imprimirCuponTermica(base64, impressora) {
  if (!base64 || !impressora) {
  logger.error("imprimirCuponTermica: base64 ou impressora não informados");
  return { status: "error", message: "Base64 ou impressora não informados" };
  }

  try {
    // snapshot para contexto
    snapshotPrinters(logger);

    const alvo = resolvePrinter(impressora);
    if (!alvo || !alvo.queueName) {
      logger.error("Fila não encontrada para PDF", { impressora, alvo });
      return { status: "error", message: "Impressora (fila) não encontrada" };
    }

    const bufferPDF = Buffer.from(base64, "base64");
    const caminhoPDF = criarArquivoTemporario(bufferPDF, "pdf", { tipo: "PDF" });
    if (!caminhoPDF) {
      return { status: "error", message: "Falha ao criar arquivo temporário (PDF)" };
    }

  logger.info("Imprimindo PDF temporário", { caminhoPDF, fila: alvo.queueName });
    // Envia via printer.printDirect
    try {
      await print(caminhoPDF, {
    printer: alvo.queueName, // NOME DA FILA aqui
        scale: "fit",
        silent: true,
        monochrome: true
      }).then(() => logger.info("PDF enviado para spooler"));
    } finally {
      // Remove o arquivo temporário
  try { fs.unlinkSync(caminhoPDF); } catch (_) {}
    }

    return { status: "success", message: "PDF enviado para a impressora", acao: "imprimirPDF" };
  } catch (e) {
    logger.error("Falha ao imprimir PDF", { error: e && e.message });
    return { status: "error", message: e.message };
  }
}

async function imprimirTexto(dados) {
  const { impressora, msg } = dados;
  logger.info("Solicitada impressão de texto", { impressora, size: (msg||'').length });
  if (!impressora || !msg) {
    console.error("Impressora ou mensagem não informada!");
    logger.error("Impressora ou mensagem não informada", { impressora: !!impressora, hasMsg: !!msg });
    return { status: "error", message: "Dados inválidos" };
  }

  // Resolução canônica do destino
  let alvo;
  try {
    alvo = resolvePrinter(impressora);
  } catch (e) {
    logger.error("Nome de impressora inválido", { error: e.message, impressora });
    return { status: "error", message: "Nome de impressora inválido" };
  }
  if (!alvo || !(alvo.sharePath || alvo.queueName)) {
    logger.error("Impressora não localizada", { impressora, alvo });
    return { status: "error", message: "Impressora não localizada" };
  }

  // converte msg (UTF-8) para CP850
  const buffer = iconv.encode(msg, "CP850");
  const filePath = criarArquivoTemporario(buffer, "txt", { tipo: "RAW" });
  if (!filePath) {
    return { status: "error", message: "Falha ao criar arquivo temporário (TXT)" };
  }
  const hex = Buffer.from(String(impressora), "utf8").toString("hex");
  logger.info("Arquivo RAW criado", { filePath, bytes: buffer.length, nomeHex: hex, alvo });

  return new Promise((resolve) => {
    // Preferir COMPARTILHAMENTO (UNC) para RAW
    const destino = alvo.sharePath || `\\\\localhost\\${alvo.queueName}`;
    const cmd = `copy /b "${filePath}" "${destino}"`;

    logger.info("Executando comando de impressão", { cmd });

    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error("Erro ao imprimir:", error.message);
        logger.error("Erro ao imprimir (copy /b)", { error: error.message, stdout, stderr, destino, alvo });
        // Fallback opcional: tentar print.exe pela fila (para texto simples)
        if (alvo.queueName) {
          const fallback = `print /d:"${alvo.queueName}" "${filePath}"`;
          logger.warn("Tentando fallback print.exe", { fallback });
          return exec(fallback, (err2, out2, errOut2) => {
            try { fs.unlinkSync(filePath); } catch (_) {}
            if (err2) {
              logger.error("Fallback print.exe também falhou", { err2: err2.message, out2, errOut2 });
              return resolve({ status: "error", message: error.message });
            }
            logger.info("RAW enviado com sucesso via fallback", { out2 });
            return resolve({ status: "success", message: "Impresso com sucesso (fallback)", acao: "imprimir" });
          });
        }
        try { fs.unlinkSync(filePath); } catch (_) {}
        return resolve({ status: "error", message: `Falha de impressão: ${error.message}` });
      }
      try { fs.unlinkSync(filePath); } catch (_) {}
      logger.info("Impressão enviada com sucesso (copy /b)", { stdout });
      resolve({ status: "success", message: "Impresso com sucesso", acao: "imprimir" });
    });
  });
}


module.exports = {
  imprimirTexto,
  imprimirCuponTermica
};