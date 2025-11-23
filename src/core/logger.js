const fs = require("fs");
const path = require("path");
const os = require("os");
const { EventEmitter } = require("events");

// Logger simples: grava em arquivo no TMP e emite eventos em tempo real
class Logger extends EventEmitter {
  constructor() {
    super();
    this.appFolder = "prayer";
    this.logDir = path.join(os.tmpdir(), this.appFolder);
    this.ensureDir();
  }

  ensureDir() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (e) {
      // última defesa: se não conseguiu criar, cai para tmp direto
      this.logDir = os.tmpdir();
    }
  }

  getLogFileName(date = new Date()) {
    const yyyy = String(date.getFullYear());
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `prayer-${yyyy}-${mm}-${dd}.log`;
  }

  getLogFilePath() {
    return path.join(this.logDir, this.getLogFileName());
  }

  formatBR(date = new Date()) {
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    const hh = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    const ms = String(date.getMilliseconds()).padStart(3, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}.${ms}`;
  }

  safeStringify(obj) {
    try {
      if (typeof obj === "string") return obj;
      return JSON.stringify(obj);
    } catch (_) {
      return String(obj);
    }
  }

  write(level, message, meta) {
    const timestamp = this.formatBR();
    let line;
    
    // Formatação especial para logs de impressão
    if (meta && this.isPrintLog(message, meta)) {
      line = this.formatPrintLog(timestamp, level, message, meta);
    } else {
      line = `[${timestamp}] [${level.toUpperCase()}] ${this.safeStringify(message)}${
        meta ? " " + this.safeStringify(meta) : ""
      }\n`;
    }

    try {
      fs.appendFileSync(this.getLogFilePath(), line, { encoding: "utf8" });
    } catch (_) {
      // ignorar falhas de escrita para não quebrar app
    }

    // ecoa no console também
    if (level === "error") console.error(line.trim());
    else console.log(line.trim());

    // emite evento para visualizadores
    this.emit("log", { level, line });
  }

  isPrintLog(message, meta) {
    const printKeywords = [
      'impressão', 'imprimir', 'print', 'copy /b', 'Arquivo RAW', 
      'comando de impressão', 'enviada com sucesso'
    ];
    const msgStr = String(message).toLowerCase();
    return printKeywords.some(keyword => msgStr.includes(keyword.toLowerCase()));
  }

  formatPrintLog(timestamp, level, message, meta) {
    const separator = "=" .repeat(80);
    let formattedLog = `\n${separator}\n`;
    formattedLog += `[${timestamp}] [${level.toUpperCase()}] IMPRESSÃO\n`;
    formattedLog += `${separator}\n`;
    formattedLog += `📄 Ação: ${message}\n`;

    if (meta) {
      if (meta.impressora) {
        formattedLog += `🖨️  Impressora: ${meta.impressora}\n`;
      }
      if (meta.queueName) {
        formattedLog += `📋 Fila: ${meta.queueName}\n`;
      }
      if (meta.size) {
        formattedLog += `📏 Tamanho: ${meta.size} bytes\n`;
      }
      if (meta.filePath) {
        formattedLog += `📁 Arquivo: ${meta.filePath}\n`;
      }
      if (meta.cmd) {
        formattedLog += `⚙️  Comando: ${meta.cmd}\n`;
      }
      if (meta.stdout) {
        formattedLog += `✅ Resultado: ${meta.stdout.trim()}\n`;
      }
      if (meta.msg && meta.msg.length < 200) {
        formattedLog += `📝 Conteúdo: ${meta.msg.substring(0, 100)}${meta.msg.length > 100 ? '...' : ''}\n`;
      }
      if (meta.error) {
        formattedLog += `❌ Erro: ${meta.error}\n`;
      }
      if (meta.alvo) {
        formattedLog += `🎯 Destino: ${JSON.stringify(meta.alvo, null, 2)}\n`;
      }
    }

    formattedLog += `${separator}\n\n`;
    return formattedLog;
  }

  info(msg, meta) { this.write("info", msg, meta); }
  warn(msg, meta) { this.write("warn", msg, meta); }
  error(msg, meta) { this.write("error", msg, meta); }
  debug(msg, meta) { this.write("debug", msg, meta); }
}

const logger = new Logger();

module.exports = {
  logger,
  getLogFilePath: () => logger.getLogFilePath(),
  getLogDir: () => logger.logDir,
};
