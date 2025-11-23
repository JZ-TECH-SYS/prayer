// src/core/socket.js

const WebSocket = require("ws");
const { gerenciarAcaoImpressao } = require("./printer");
const { sucesso, alerta, erro } = require("./notificacao");
const { logger } = require("./logger");
const { snapshotPrinters } = require("../helpers/impressoras");

let wss = null;
let isRunning = false;

// Diagnóstico simples da porta ocupada (Windows)
async function diagnosePort(port = 8080) {
  try {
    const { exec } = require('child_process');
    exec(`netstat -ano | findstr :${port}`, (err, stdout) => {
      if (err) {
        logger.warn("Diagnóstico de porta falhou", { porta: port, erro: err.message });
        return;
      }
      const linhas = stdout.split('\n').map(l => l.trim()).filter(Boolean);
      const pids = [...new Set(linhas.map(l => l.split(/\s+/).pop()).filter(Boolean))];
      logger.warn("Porta em uso detectada", { porta: port, linhas, pids });
    });
  } catch (e) {
    logger.warn("Diagnóstico de porta não suportado", { erro: e.message });
  }
}

async function startWebSocketServer() {
  if (isRunning) {
    sucesso("Servidor já em execução.");
    logger.warn("Tentativa de iniciar servidor WebSocket duplicado", {
      porta: 8080,
      status: "JÁ_EXECUTANDO"
    });
    return isRunning;
  }

  try {
    wss = new WebSocket.Server({ port: 8080 });
  } catch (e) {
    if (e && e.code === 'EADDRINUSE') {
      erro("Porta 8080 já está em uso.");
      logger.error("Falha ao iniciar WebSocket: porta ocupada", {
        porta: 8080,
        erro: e.message,
        code: e.code,
        dica: "Verifique se outra instância do Prayer está aberta ou finalize o processo que usa a porta."
      });
      diagnosePort(8080);
      return false;
    }
    logger.error("Erro inesperado ao criar servidor WebSocket", {
      porta: 8080,
      erro: e.message,
      code: e.code
    });
    return false;
  }

  logger.info("Servidor WebSocket inicializado com sucesso", {
    porta: 8080,
    status: "ATIVO"
  });

  wss.on("connection", (ws) => {
    sucesso("Cliente conectado!");
    logger.info("Nova conexão WebSocket estabelecida", {
      clientesConectados: wss.clients.size,
      timestamp: new Date().toISOString()
    });

    ws.on("message", async (msg) => {
      let dados;
      try {
        dados = JSON.parse(msg);
        logger.info("Nova requisição recebida via WebSocket", {
          acao: dados.acao,
          impressora: dados.impressora,
          tamanhoMsg: dados.msg ? dados.msg.length : 0,
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        erro("JSON inválido recebido.");
        logger.error("Formato JSON inválido na mensagem recebida", {
          erro: err.message,
          dadosBrutos: String(msg).substring(0, 200) + "...",
          tamanho: String(msg).length
        });
        return ws.send(JSON.stringify({ status: "error", message: "JSON inválido!" }));
      }

      if (!dados.acao) {
        erro("Ação não especificada.");
        logger.warn("Mensagem sem ação especificada", {
          camposRecebidos: Object.keys(dados),
          tamanhoMensagem: JSON.stringify(dados).length
        });
        return ws.send(JSON.stringify({ status: "error", message: "Ação não especificada!" }));
      }

      try {
        // rota de debug de impressoras
        if (dados.acao === "debug/printers") {
          snapshotPrinters(logger);
          return ws.send(JSON.stringify({ status: "ok", acao: "debug/printers" }));
        }

        const respostaObj = await gerenciarAcaoImpressao(dados);
        const respostaStr = typeof respostaObj === "string" ? respostaObj : JSON.stringify(respostaObj);
        logger.info("Resposta enviada ao cliente", {
          acao: dados.acao,
          status: respostaObj.status || "indefinido",
          tamanhoResposta: JSON.stringify(respostaObj).length
        });
        ws.send(respostaStr);
      } catch (e) {
        console.error("Erro ao processar ação:", e);
        logger.error("Falha crítica no processamento da ação", {
          acao: dados.acao,
          erro: e && e.message,
          stack: e && e.stack,
          dadosEntrada: {
            impressora: dados.impressora,
            tamanhoMsg: dados.msg ? dados.msg.length : 0
          }
        });
        ws.send(JSON.stringify({ status: "error", message: e.message || "Erro interno" }));
      }
    });

    ws.on("close", () => {
      alerta("Cliente desconectado.");
      logger.info("Cliente desconectado do WebSocket", {
        clientesRestantes: wss.clients.size,
        timestamp: new Date().toISOString()
      });
    });
  });

  sucesso("Servidor WebSocket iniciado na porta 8080.");
  logger.info("Sistema WebSocket totalmente operacional", {
    porta: 8080,
    status: "PRONTO_PARA_CONEXÕES"
  });
  isRunning = true;
  return isRunning;
}

function stopWebSocketServer() {
  if (wss) {
    try {
      wss.close();
    } catch (e) {
      logger.warn("Erro ao fechar servidor WebSocket", { erro: e.message });
    }
    isRunning = false;
    erro("Servidor WebSocket parado.");
    logger.warn("Servidor WebSocket finalizado", {
      motivo: "STOP_REQUEST",
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = {
  startWebSocketServer,
  stopWebSocketServer
};
