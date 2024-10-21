const { gerenciarAcaoImpressao } = require('./printer');
const WebSocket = require('ws');
const { sucesso,alerta,erro } = require('./notificacao');

var wss = null;
var isRunning = false;

async function startWebSocketServer() {
    if (isRunning) {
        sucesso('Gerenciador de impressão já está em execução!');
        return isRunning;
    }

    wss = new WebSocket.Server({ port: 8080 });
    wss.on('connection', (ws) => {
        sucesso('Cliente conectado!');

        ws.on('message', async (message) => {
            const dados = JSON.parse(message);            
            if(!dados.acao){ 
                ws.send(JSON.stringify({ status: 'erro', message: 'Ação não reconhecida!' }));
                erro('Ação não reconhecida!');
                return;
            }

            let response = await gerenciarAcaoImpressao(dados);
            ws.send(response);
        });

        ws.on('close', () => {
            alerta('Cliente desconectado!');
        });
    });

    sucesso('Gereciador de impressão iniciado!');
    isRunning = true;
    return isRunning;
}


async function stopWebSocketServer() {
    if (wss) {
        erro('Gerenciador de impressão parado!');
        isRunning = false;
        wss.close(); 
    } 
}

module.exports = {
    startWebSocketServer,
    stopWebSocketServer
};