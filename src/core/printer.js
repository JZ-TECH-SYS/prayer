const { erro } = require("./notificacao");
const { imprimirTexto,imprimirCuponTermica } = require("../utils/impressora");
const { listarImpressoras } = require("../utils/sistema");
const { createWindowHTML } = require("../utils/janela");
const { logger } = require("./logger");

async function imprimirHTML(dados) {
  const { impressora, msg } = dados;
  const win = createWindowHTML(msg);

  console.log("msg", msg);
  logger.info("Solicitada impressão HTML", { device: impressora, size: (msg||'').length });
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
  logger[success ? 'info' : 'error']("Resultado imprimirHTML", { success, err });
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
    logger.error("imprimirCupon: dados inválidos", { impressora: !!impressora, hasMsg: !!xmlsimple });
    return JSON.stringify({ status: "error", message: "Dados inválidos" });
  }

  const resultado = await imprimirCuponTermica(xmlsimple, impressora, erro);
  logger[resultado.status === 'success' ? 'info' : 'error']("Resultado imprimirCupon", resultado);
  return JSON.stringify(resultado);
}

async function gerenciarAcaoImpressao(dados) {
  switch (dados.acao) {
    case "todasImpressoras":
  logger.info("Listagem de impressoras solicitada");
      return await listarImpressoras();
    case "imprimir":
  logger.info("Impressão de texto solicitada", { device: dados.impressora, size: (dados.msg||'').length });
      return await imprimirTexto(dados);
    case "imprimirHTML":
      return await imprimirHTML(dados);
    case "imprimirCupon":
      return await imprimirCupon(dados);
    default:
      erro("Ação não reconhecida!");
  logger.warn("Ação não reconhecida", { acao: dados.acao });
      return JSON.stringify({ status: "error", message: "Ação não reconhecida!" });
  }
}

module.exports = { gerenciarAcaoImpressao };
