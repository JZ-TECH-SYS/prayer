// src/core/socket.js

const WebSocket = require("ws");
const { gerenciarAcaoImpressao } = require("./printer");
const { sucesso, alerta, erro } = require("./notificacao");

let wss = null;
let isRunning = false;

async function startWebSocketServer() {
  if (isRunning) {
    sucesso("Servidor já em execução.");
    return isRunning;
  }

  wss = new WebSocket.Server({ port: 8080 });

  wss.on("connection", (ws) => {
    sucesso("Cliente conectado!");

    ws.on("message", async (msg) => {
      let dados;
      try {
        dados = JSON.parse(msg);
      } catch (err) {
        erro("JSON inválido recebido.");
        return ws.send(JSON.stringify({ status: "error", message: "JSON inválido!" }));
      }

      if (!dados.acao) {
        erro("Ação não especificada.");
        return ws.send(JSON.stringify({ status: "error", message: "Ação não especificada!" }));
      }

      try {
        const respostaObj = await gerenciarAcaoImpressao(dados);
        const respostaStr = typeof respostaObj === "string" ? respostaObj : JSON.stringify(respostaObj);
        ws.send(respostaStr);
      } catch (e) {
        console.error("Erro ao processar ação:", e);
        ws.send(JSON.stringify({ status: "error", message: e.message || "Erro interno" }));
      }
    });

    ws.on("close", () => {
      alerta("Cliente desconectado.");
    });
  });

  sucesso("Servidor WebSocket iniciado na porta 8080.");
  isRunning = true;
  return isRunning;
}

function stopWebSocketServer() {
  if (wss) {
    wss.close();
    isRunning = false;
    erro("Servidor WebSocket parado.");
  }
}

module.exports = {
  startWebSocketServer,
  stopWebSocketServer
};
