const path = require('path');
const { Notification } = require('electron');
const { logger } = require('./logger');

function criarNotificacao(titulo, mensagem, icon) {
    new Notification({
        title: titulo,
        body: mensagem,
        icon: path.join(__dirname, icon)
    }).show();
}

function sucesso(mensagem) {
    criarNotificacao('Sucesso', mensagem, 'img/sucesso.png');
    try { logger.info('Notificação Sucesso', { mensagem }); } catch (_) {}
}

function erro(mensagem) {
    criarNotificacao('Erro', mensagem, 'img/error.png');
    try { logger.error('Notificação Erro', { mensagem }); } catch (_) {}
}

function alerta(mensagem) {
    criarNotificacao('Alerta', mensagem, 'img/alert.png'); 
    try { logger.warn('Notificação Alerta', { mensagem }); } catch (_) {}
}


function validarImpressora(impressora){
    if(!impressora){
        erro('Impressora não informada!');
        return { status: "error", message: "Impressora não informada!" };
    }
    return true;
}

module.exports = {
    sucesso,
    erro,
    alerta,
    validarImpressora
};
