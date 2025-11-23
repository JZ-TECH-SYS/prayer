const { erro } = require("./notificacao");
const { imprimirTexto, imprimirCuponTermica } = require("../utils/impressora");
const { listarImpressoras } = require("../utils/sistema");
const { createWindowHTML } = require("../utils/janela");
const { logger } = require("./logger");

async function imprimirHTML(dados) {
  const { impressora, msg } = dados;
  const win = createWindowHTML(msg);

  console.log("msg", msg);
  logger.info("Solicitação de impressão HTML recebida", {
    impressora,
    tamanhoConteudo: (msg || '').length,
    tipo: "HTML"
  });
  return new Promise((resolve) => {
    win.webContents.on("did-finish-load", () => {
      win.webContents.print({
        silent: true,
        printBackground: true,
        deviceName: impressora,
        margins: {
          marginType: 'none'
        }
      }, (success, err) => {
        if (!success) erro(`Erro ao imprimir: ${err}`);
        logger[success ? 'info' : 'error']("Impressão HTML finalizada", {
          impressora,
          success,
          erro: err,
          metodo: "Electron webContents.print"
        });
        win.close();
        resolve(JSON.stringify({
          status: success ? "success" : "error",
          message: success ? "Impresso!" : err,
          acao: "imprimirHTML"
        }));
      });
    });
  });
}

async function imprimirCupon(dados) {
  let impressora = dados.impressora;
  let xmlsimple = dados.msg.content;
  if (!impressora || !xmlsimple) {
    erro("Impressora ou msg não informados!");
    logger.error("Dados obrigatórios não informados para cupom", {
      impressora: !!impressora,
      hasContent: !!xmlsimple,
      tipo: "CUPOM TÉRMICO"
    });
    return JSON.stringify({ status: "error", message: "Dados inválidos" });
  }

  const resultado = await imprimirCuponTermica(xmlsimple, impressora, erro);
  logger[resultado.status === 'success' ? 'info' : 'error']("Processamento de cupom térmico concluído", {
    impressora,
    status: resultado.status,
    message: resultado.message,
    tipo: "CUPOM TÉRMICO"
  });
  return JSON.stringify(resultado);
}

async function gerenciarAcaoImpressao(dados) {
  switch (dados.acao) {
    case "todasImpressoras":
      logger.info("Solicitação de listagem de impressoras", {
        acao: "todasImpressoras",
        tipo: "CONSULTA"
      });
      return await listarImpressoras();
    case "imprimir":
      logger.info("Solicitação de impressão de texto RAW", {
        impressora: dados.impressora,
        tamanhoTexto: (dados.msg || '').length,
        tipo: "TEXTO RAW"
      });
      return await imprimirTexto(dados);
    case "imprimirHTML":
      return await imprimirHTML(dados);
    case "imprimirCupon":
      return await imprimirCupon(dados);
    default:
      erro("Ação não reconhecida!");
      logger.warn("Ação não reconhecida pelo sistema", {
        acao: dados.acao,
        acoesDisponiveis: ["todasImpressoras", "imprimir", "imprimirHTML", "imprimirCupon"]
      });
      return JSON.stringify({ status: "error", message: "Ação não reconhecida!" });
  }
}

module.exports = { gerenciarAcaoImpressao };
