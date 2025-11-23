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
    snapshotPrinters(logger);

    const alvo = resolvePrinter(impressora);
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
    alvo = resolvePrinter(impressora);
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

  // converte msg (UTF-8) para CP850
  const buffer = iconv.encode(msg, "UTF-8");
  const filePath = criarArquivoTemporario(buffer, "txt", { tipo: "RAW" });
  if (!filePath) {
    return {
      status: "error",
      message: "Falha ao criar arquivo temporário (TXT)",
    };
  }
  const hex = Buffer.from(String(impressora), "utf8").toString("hex");
  logger.info("Arquivo temporário preparado para impressão", {
    impressora,
    filePath,
    bytes: buffer.length,
    nomeHex: hex,
    alvo,
    msg: msg.substring(0, 150) // primeiros 150 chars do conteúdo
  });

  return new Promise((resolve) => {
    // Preferir COMPARTILHAMENTO (UNC) para RAW
    const destino = alvo.sharePath || `\\\\localhost\\${alvo.queueName}`;
    const cmd = `copy /b "${filePath}" "${destino}"`;

    logger.info("Iniciando envio para impressora", {
      impressora,
      cmd,
      destino,
      queueName: alvo.queueName
    });

    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error("Erro ao imprimir:", error.message);
        logger.error("Falha no método primário de impressão", {
          impressora,
          erro: error.message,
          stdout,
          stderr,
          destino,
          metodo: "copy /b",
          tentandoFallback: !!alvo.queueName
        });
        // Fallback opcional: tentar print.exe pela fila (para texto simples)
        if (alvo.queueName) {
          const fallback = `print /d:"${alvo.queueName}" "${filePath}"`;
          logger.warn("Executando método alternativo de impressão", {
            impressora,
            comandoFallback: fallback,
            metodo: "print.exe",
            motivo: "copy /b falhou"
          });
          return exec(fallback, (err2, out2, errOut2) => {

            if (err2) {
              logger.error("Todos os métodos de impressão falharam", {
                impressora,
                erroFallback: err2.message,
                saidaFallback: out2,
                erroSaidaFallback: errOut2,
                metodosTestados: ["copy /b", "print.exe"]
              });
              return resolve({ status: "error", message: error.message });
            }
            logger.info("Impressão concluída via método alternativo", {
              impressora,
              metodo: "print.exe",
              saida: out2,
              status: "SUCESSO_FALLBACK"
            });
            return resolve({
              status: "success",
              message: "Impresso com sucesso (fallback)",
              acao: "imprimir",
            });
          });
        }

        return resolve({
          status: "error",
          message: `Falha de impressão: ${error.message}`,
        });
      }

      logger.info("Impressão concluída com sucesso", {
        impressora,
        queueName: alvo.queueName,
        stdout: stdout.trim(),
        bytes: buffer.length,
        metodo: "copy /b"
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
