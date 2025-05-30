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
        ws.send(JSON.stringify({ status: "error", message: "JSON inválido!" }));
        return;
      }

      if (!dados.acao) {
        erro("Ação não especificada.");
        ws.send(JSON.stringify({ status: "error", message: "Ação não especificada!" }));
        return;
      }

      const resposta = await gerenciarAcaoImpressao(dados);
      ws.send(resposta);
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
