const os = require("os");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { gerarNomeUnico } = require("./arquivos");
const { erro } = require("../core/notificacao");
const iconv = require("iconv-lite");
const { print } = require("pdf-to-printer");
const { logger, getLogDir } = require("../core/logger");
const { resolvePrinter, snapshotPrinters } = require("../helpers/impressoras");
const { disponivel, imprimirRawSpooler } = require("../helpers/winspool");
function criarArquivoTemporario(buffer, ext, contextoLog) {
  const erros = [];
  const baseLogDir =
    getLogDir && typeof getLogDir === "function" ? getLogDir() : null;
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
        logger.info("Arquivo temporário criado com sucesso", {
          arquivo: filePath,
          tamanhoBytes: size,
          diretorio: dir,
          tipo: contextoLog?.tipo || "ARQUIVO",
          ...(contextoLog || {}),
        });
        return filePath;
      }
      erros.push({
        dir,
        motivo: `verificação falhou (ok=${ok}, size=${size})`,
      });
    } catch (e) {
      erros.push({ dir, erro: e && e.message });
    }
  }
  logger.error("Falha crítica: impossível criar arquivo temporário", {
    diretoriosTentados: candidatos,
    errosEncontrados: erros,
    tipoArquivo: contextoLog?.tipo || "DESCONHECIDO",
    ...(contextoLog || {}),
  });
  return null;
}

async function imprimirCuponTermica(base64, impressora) {
  if (!base64 || !impressora) {
    logger.error("Parâmetros obrigatórios ausentes para cupom térmico", {
      hasBase64: !!base64,
      hasImpressora: !!impressora,
      tipo: "CUPOM TÉRMICO PDF"
    });
    return { status: "error", message: "Base64 ou impressora não informados" };
  }

  try {
    // snapshot para contexto
    await snapshotPrinters(logger);

    const alvo = await resolvePrinter(impressora);
    if (!alvo || !alvo.queueName) {
      logger.error("Impressora não localizada no sistema", {
        impressoraSolicitada: impressora,
        dadosEncontrados: alvo,
        tipo: "PDF"
      });
      return { status: "error", message: "Impressora (fila) não encontrada" };
    }

    const bufferPDF = Buffer.from(base64, "base64");
    const caminhoPDF = criarArquivoTemporario(bufferPDF, "pdf", {
      tipo: "PDF",
    });
    if (!caminhoPDF) {
      return {
        status: "error",
        message: "Falha ao criar arquivo temporário (PDF)",
      };
    }

    logger.info("Iniciando impressão de cupom térmico PDF", {
      arquivo: caminhoPDF,
      impressora: alvo.queueName,
      tamanhoBytes: bufferPDF.length,
      tipo: "PDF TÉRMICO"
    });
    // Envia via printer.printDirect
    try {
      await print(caminhoPDF, {
        printer: alvo.queueName, // NOME DA FILA aqui
        scale: "fit",
        silent: true,
        monochrome: true,
      }).then(() => logger.info("PDF térmico enviado para fila de impressão", {
        impressora: alvo.queueName,
        metodo: "pdf-to-printer",
        status: "SUCESSO"
      }));
    } finally {
      // Remove o arquivo temporário
      try {
        fs.unlinkSync(caminhoPDF);
      } catch (_) { }
    }

    return {
      status: "success",
      message: "PDF enviado para a impressora",
      acao: "imprimirPDF",
    };
  } catch (e) {
    logger.error("Falha na impressão do cupom térmico PDF", {
      erro: e && e.message,
      impressora,
      stack: e && e.stack,
      tipo: "PDF TÉRMICO"
    });
    return { status: "error", message: e.message };
  }
}

async function imprimirTexto(dados) {
  const { impressora, msg } = dados;
  logger.info("Nova solicitação de impressão recebida", {
    impressora,
    size: (msg || "").length,
    tipo: "TEXTO RAW"
  });
  if (!impressora || !msg) {
    console.error("Impressora ou mensagem não informada!");
    logger.error("Dados obrigatórios não informados", {
      impressora: !!impressora,
      hasMsg: !!msg,
    });
    return { status: "error", message: "Dados inválidos" };
  }

  // Resolução canônica do destino
  let alvo;
  try {
    alvo = await resolvePrinter(impressora);
  } catch (e) {
    logger.error("Nome de impressora inválido", {
      error: e.message,
      impressora,
    });
    return { status: "error", message: "Nome de impressora inválido" };
  }
  if (!alvo || !(alvo.sharePath || alvo.queueName)) {
    logger.error("Impressora não localizada", { impressora, alvo });
    return { status: "error", message: "Impressora não localizada" };
  }

  // Mantém os mesmos bytes das versões anteriores (texto em UTF-8).
  const buffer = iconv.encode(msg, "UTF-8");

  // 1) Caminho principal: direto no spooler (OpenPrinter/StartDocPrinter RAW/WritePrinter).
  //    Não depende de compartilhamento nem de \\localhost, não abre processo externo e o job
  //    entra na fila do Windows na hora.
  if (alvo.queueName && disponivel()) {
    const inicio = Date.now();
    try {
      const r = await imprimirRawSpooler(alvo.queueName, buffer, "PrayerApp RAW");
      logger.info("Impressão concluída com sucesso", {
        impressora,
        queueName: alvo.queueName,
        jobId: r.jobId,
        bytes: r.bytes,
        ms: Date.now() - inicio,
        metodo: "winspool WritePrinter (RAW)",
      });
      return { status: "success", message: "Impresso com sucesso", acao: "imprimir", jobId: r.jobId };
    } catch (e) {
      logger.error("Falha ao imprimir pelo spooler", {
        impressora,
        queueName: alvo.queueName,
        erro: e.message,
        win32: e.win32,
        etapa: e.etapa,
        ms: Date.now() - inicio,
        metodo: "winspool WritePrinter (RAW)",
      });
      // Só tenta o compartilhamento se houver um; sem ele, devolve o erro real ao cliente.
      if (!alvo.sharePath) {
        return { status: "error", message: `Falha de impressão: ${e.message}`, acao: "imprimir" };
      }
    }
  }

  // 2) Destino UNC (\\servidor\share não instalado como fila) ou spooler indisponível:
  //    copy /b para o compartilhamento. Sem print.exe: ele "imprime" num arquivo e responde sucesso.
  if (!alvo.sharePath) {
    return { status: "error", message: "Impressora sem fila nem compartilhamento utilizável", acao: "imprimir" };
  }

  const filePath = criarArquivoTemporario(buffer, "txt", { tipo: "RAW" });
  if (!filePath) {
    return {
      status: "error",
      message: "Falha ao criar arquivo temporário (TXT)",
    };
  }

  return new Promise((resolve) => {
    const destino = alvo.sharePath;
    const cmd = `copy /b "${filePath}" "${destino}"`;
    const inicio = Date.now();

    logger.info("Iniciando envio para compartilhamento", {
      impressora,
      cmd,
      destino,
      queueName: alvo.queueName,
    });

    exec(cmd, { timeout: 30000, windowsHide: true }, (error, stdout, stderr) => {
      try { fs.unlinkSync(filePath); } catch (_) { }
      if (error) {
        logger.error("Falha ao imprimir pelo compartilhamento", {
          impressora,
          erro: error.message,
          stdout,
          stderr,
          destino,
          ms: Date.now() - inicio,
          metodo: "copy /b",
        });
        return resolve({ status: "error", message: `Falha de impressão: ${error.message}`, acao: "imprimir" });
      }

      logger.info("Impressão concluída com sucesso", {
        impressora,
        destino,
        stdout: stdout.trim(),
        bytes: buffer.length,
        ms: Date.now() - inicio,
        metodo: "copy /b",
      });
      resolve({
        status: "success",
        message: "Impresso com sucesso",
        acao: "imprimir",
      });
    });
  });
}

module.exports = {
  imprimirTexto,
  imprimirCuponTermica,
};
