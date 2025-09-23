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
    const line = `[${this.formatBR()}] [${level.toUpperCase()}] ${this.safeStringify(message)}${
      meta ? " " + this.safeStringify(meta) : ""
    }\n`;

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
