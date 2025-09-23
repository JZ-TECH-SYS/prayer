// src/core/socket.js

const WebSocket = require("ws");
const { gerenciarAcaoImpressao } = require("./printer");
const { sucesso, alerta, erro } = require("./notificacao");
const { logger } = require("./logger");
const { snapshotPrinters } = require("../helpers/impressoras");

let wss = null;
let isRunning = false;

async function startWebSocketServer() {
  if (isRunning) {
    sucesso("Servidor já em execução.");
  logger.warn("Tentativa de iniciar servidor já em execução");
    return isRunning;
  }

  wss = new WebSocket.Server({ port: 8080 });
  logger.info("WebSocket.Server criado na porta 8080");

  wss.on("connection", (ws) => {
    sucesso("Cliente conectado!");
  logger.info("Cliente conectado");

    ws.on("message", async (msg) => {
      let dados;
      try {
        dados = JSON.parse(msg);
  logger.debug("Mensagem recebida", dados);
      } catch (err) {
        erro("JSON inválido recebido.");
  logger.error("JSON inválido recebido", { raw: String(msg) });
        return ws.send(JSON.stringify({ status: "error", message: "JSON inválido!" }));
      }

      if (!dados.acao) {
        erro("Ação não especificada.");
  logger.warn("Ação não especificada em mensagem", dados);
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
  logger.debug("Resposta enviada", respostaObj);
        ws.send(respostaStr);
      } catch (e) {
        console.error("Erro ao processar ação:", e);
  logger.error("Erro ao processar ação", { error: e && e.message });
        ws.send(JSON.stringify({ status: "error", message: e.message || "Erro interno" }));
      }
    });

    ws.on("close", () => {
      alerta("Cliente desconectado.");
  logger.info("Cliente desconectado");
    });
  });

  sucesso("Servidor WebSocket iniciado na porta 8080.");
  logger.info("Servidor WebSocket iniciado na porta 8080");
  isRunning = true;
  return isRunning;
}

function stopWebSocketServer() {
  if (wss) {
    wss.close();
    isRunning = false;
    erro("Servidor WebSocket parado.");
  logger.warn("Servidor WebSocket parado");
  }
}

module.exports = {
  startWebSocketServer,
  stopWebSocketServer
};
