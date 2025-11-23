# PrayerApp

Desktop agent em Electron para orquestrar impressões locais via WebSocket e utilitários embarcados (tray, log viewer e tester de impressoras). A aplicação roda minimizada na bandeja do Windows, inicia um servidor na porta `8080` e mantém auto-update integrado ao GitHub Releases.

## 🚀 Principais recursos

- **Gerenciamento pela bandeja**: iniciar/parar o servidor, abrir ferramentas, consultar versão instalada e disparar busca de atualizações.
- **Servidor WebSocket** (`src/core/socket.js`): responde a ações de listagem/ impressão, inclusive comandos RAW (ZPL, EPL, ESC/POS) e HTML renderizado.
- **Ferramentas visuais**: log viewer e printer tester com tema escuro, agora carregando CSS/JS dedicados em `src/assets/css` e `src/assets/js`.
- **Auto-update**: `electron-updater` configurado para consumir releases do repositório `JZ-TECH-SYS/prayer`, garantindo que o instalador gerado pelo `electron-builder` corresponda ao nome esperado pelo atualizador.
- **Logs estruturados**: toda a telemetria é gravada em `%TEMP%/prayer` via `src/core/logger.js`, utilizada pelo tray e log viewer.

## 🧱 Estrutura em destaque

```text
src/
├─ main.js                # Orquestrador (tray + servidor + auto-update)
├─ core/
│  ├─ trayController.js   # Menu/bandeja desacoplado
│  ├─ updateManager.js    # Wrapper do electron-updater
│  ├─ logger.js | socket.js | notificacao.js | printer*.js ...
├─ assets/
│  ├─ html/printerTester.html
│  ├─ css/printerTester.css
│  └─ js/printerTester.js
└─ utils/                 # Helpers de arquivos, janelas e sistema
```

## ⚙️ Requisitos

- Windows 10/11 (64 bits)
- Node.js 18+
- Yarn ou npm (scripts usam npm por padrão)

## 📦 Instalação e desenvolvimento

```bash
git clone https://github.com/JZ-TECH-SYS/prayer.git
cd prayer
npm install

# Ambiente de desenvolvimento (Electron + nodemon)


# Executar app diretamente
npm start
```

## 🛠️ Build & Release

- `npm run build` gera instaladores via `electron-builder`.
- O workflow `.github/workflows/release.yml` publica installers (`dist/*.exe`) e `latest.yml` em um release versionado (`v1.0.2`, por exemplo).
- O auto-update consome exatamente esses artefatos, portanto mantenha o `productName`/`appId` e o repositório configurados em `package.json` → `build.publish`.
- Para subir versão, use `node src/scripts/bumpVersion.js` (incrementa patch) antes de abrir o release/tag correspondente.

## 🧠 Fluxo do aplicativo

1. `main.js` garante instância única, cria a bandeja através de `trayController` e sobe o servidor WebSocket.
2. `updateManager` monitora releases do GitHub, atualiza o menu de versão e dispara notificações quando um pacote é baixado.
3. O tray oferece ações rápidas (logs, teste de impressora, abrir pasta de logs, about, sair).
4. Ferramentas adicionais (log viewer e printer tester) são janelas leves com assets estáticos em `src/assets` + preload scripts em `src/core/preload`.

## 🌐 API WebSocket

```javascript
const ws = new WebSocket('ws://127.0.0.1:8080');

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('onmessage', data);
};
```

### Listar impressoras

```javascript
ws.send(JSON.stringify({
    acao: 'todasImpressoras'
}));
```

### Imprimir comandos RAW

```javascript
ws.send(JSON.stringify({
    acao: 'imprimir',
    impresora: 'MP-4200 TH',
    msg: '^XA...^XZ' // ZPL/EPL/ESC-POS
}));
```

### Imprimir HTML

```javascript
ws.send(JSON.stringify({
    acao: 'imprimirHTML',
    impresora: 'MP-4200 TH',
    msg: '<h1>Pedido #123</h1>'
}));
```

> **Dicas**
>
> - A ação `imprimir` aceita qualquer payload RAW compatível com a impressora alvo.
> - A ação `imprimirHTML` renderiza HTML/CSS usando Chromium — ajuste a largura para impressoras térmicas.

## 🔍 Troubleshooting rápido

- **Porta 8080 ocupada**: encerre outros serviços ou altere a porta em `src/core/socket.js`.
- **Atualização não inicia**: confirme que existe um release `vX.Y.Z` com `latest.yml` e `.exe` correspondentes.
- **Impressoras não aparecem**: execute o Printer Tester, use `Ctrl+R` para forçar atualização e verifique permissões de spooler.

Contribuições e melhorias são bem-vindas — mantenha estilos e módulos alinhados à nova estrutura modular.
