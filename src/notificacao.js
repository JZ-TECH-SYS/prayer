const path = require('path');
const { Notification } = require('electron');

function criarNotificacao(titulo, mensagem, icon) {
    new Notification({
        title: titulo,
        body: mensagem,
        icon: path.join(__dirname, icon)
    }).show();
}

function sucesso(mensagem) {
    criarNotificacao('Sucesso', mensagem, 'img/sucesso.png');
}

function erro(mensagem) {
    criarNotificacao('Erro', mensagem, 'img/error.png');
}

function alerta(mensagem) {
    criarNotificacao('Alerta', mensagem, 'img/alert.png'); 
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
