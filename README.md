# PrayerApp

**PrayerApp** é uma aplicação desktop desenvolvida em **Electron** que roda em segundo plano no computador do usuário e se comunica com uma interface web via **WebSocket** para listar impressoras e enviar comandos de impressão diretamente para elas.

## Funcionalidades Principais

- **WebSocket**: Comunicação em tempo real entre o app desktop e a interface web para envio e recebimento de comandos de impressão.
- **Listagem de Impressoras**: A aplicação lista todas as impressoras conectadas ao computador, permitindo que o usuário selecione qual deseja utilizar.
- **Impressão Direta**: Envia comandos de impressão diretamente para a impressora selecionada, suportando impressoras Zebra (ZPL) e impressoras térmicas (ESC/POS), utilizando comandos RAW. Além disso, também é possível imprimir conteúdo HTML com CSS, oferecendo maior flexibilidade para formatação de documentos e etiquetas.

- **Geração de Instalador (EXE)**: Utiliza o **electron-builder** para empacotar a aplicação e gerar um instalador executável para distribuição em máquinas Windows.

## Tecnologias Utilizadas

- **Electron**: Framework para criar aplicações desktop utilizando tecnologias web (HTML, CSS, JavaScript).

## Como Rodar o Projeto

1. Clone o repositório:

   ```bash
   git clone <URL do repositório>

   npm install


   npm run dev


   ## caso queria fazer build 

   npm run build


## Exemplo de Uso

### Conectando ao app após ele estar rodando:

Para se conectar ao aplicativo via WebSocket, use o seguinte código:

```javascript
var ws = new WebSocket('ws://127.0.0.1:8080');

ws.onmessage = function (event) {
    var data = JSON.parse(event.data);
    console.log('onmessage', data);
};
```

### Pegando a lista de impressoras:

Para solicitar a lista de impressoras disponíveis, envie a seguinte mensagem via WebSocket:

```javascript
ws.send(
    JSON.stringify({
        acao: 'todasImpressoras'
    })
);
```

### Enviando impressão direta:

Você pode enviar comandos de impressão diretamente para a impressora, seja ZPL, EPL ou ESC/POS. Use a ação `"imprimir"`:

```javascript
ws.send(
    JSON.stringify({
        acao: 'imprimir',
        impresora: 'MP-4200 TH',  // Nome da impressora
        msg: "código de impressora aqui"  // Código ZPL, EPL ou ESC/POS
    })
);
```

### Enviando HTML para impressão

Caso queira enviar HTML, formate o conteúdo para o tamanho correto da impressora térmica ou impressora que estiver usando. Use a ação `"imprimirHTML"`:

```javascript
ws.send(
    JSON.stringify({
        acao: 'imprimirHTML',
        impresora: 'MP-4200 TH',  // Nome da impressora
        msg: '<h1>João Vitor Nascimento da Silva</h1>'  // Conteúdo HTML
    })
);
```

### Observações:
- **ZPL, EPL e ESC/POS**: Use a ação `"imprimir"` para enviar comandos diretamente para impressoras que suportam esses formatos.
- **HTML com CSS**: Use a ação `"imprimirHTML"` para imprimir conteúdo formatado com HTML/CSS. Certifique-se de ajustar o tamanho do conteúdo para a impressora que estiver utilizando.
