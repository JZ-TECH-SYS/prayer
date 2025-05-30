const { erro } = require("./notificacao");
const { imprimirTexto,imprimirCuponTermica } = require("../utils/impressora");
const { listarImpressoras } = require("../utils/sistema");
const { createWindowHTML } = require("../utils/janela");

async function imprimirHTML(dados) {
  const { impressora, msg } = dados;
  const win = createWindowHTML(msg);

  console.log("msg", msg);
  return new Promise((resolve) => {
    win.webContents.on("did-finish-load", () => {
      win.webContents.print({ silent: true, printBackground: true, deviceName: impressora }, (success, err) => {
        if (!success) erro(`Erro ao imprimir: ${err}`);
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
    return JSON.stringify({ status: "error", message: "Dados inválidos" });
  }

  const resultado = await imprimirCuponTermica(xmlsimple, impressora, erro);
  return JSON.stringify(resultado);
}

async function gerenciarAcaoImpressao(dados) {
  switch (dados.acao) {
    case "todasImpressoras":
      return await listarImpressoras();
    case "imprimir":
      return await imprimirTexto(dados);
    case "imprimirHTML":
      return await imprimirHTML(dados);
    case "imprimirCupon":
      return await imprimirCupon(dados);
    default:
      erro("Ação não reconhecida!");
      return JSON.stringify({ status: "error", message: "Ação não reconhecida!" });
  }
}

module.exports = { gerenciarAcaoImpressao };
