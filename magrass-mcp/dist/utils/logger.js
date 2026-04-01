// ============================================
// MCP-DOCA-V2 - Logger Utility
// ============================================
import * as fs from 'fs';
import * as path from 'path';
class Logger {
    logLevel;
    logDir;
    logToFile;
    logToConsole;
    levelPriority = {
        debug: 0,
        info: 1,
        warn: 2,
        error: 3,
    };
    levelColors = {
        debug: '\x1b[36m', // Cyan
        info: '\x1b[32m', // Green
        warn: '\x1b[33m', // Yellow
        error: '\x1b[31m', // Red
    };
    levelEmojis = {
        debug: '🔍',
        info: '✅',
        warn: '⚠️',
        error: '❌',
    };
    constructor() {
        this.logLevel = process.env.LOG_LEVEL || 'info';
        this.logDir = process.env.LOG_DIR || './logs';
        this.logToFile = process.env.LOG_TO_FILE !== 'false';
        this.logToConsole = process.env.LOG_TO_CONSOLE !== 'false';
        // Criar diretório de logs se não existir
        if (this.logToFile && !fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }
    shouldLog(level) {
        return this.levelPriority[level] >= this.levelPriority[this.logLevel];
    }
    formatTimestamp() {
        return new Date().toISOString();
    }
    formatConsoleMessage(entry) {
        const reset = '\x1b[0m';
        const color = this.levelColors[entry.level];
        const emoji = this.levelEmojis[entry.level];
        const contextStr = entry.context ? `[${entry.context}]` : '';
        let message = `${color}${emoji} [${entry.timestamp}] [${entry.level.toUpperCase()}]${contextStr} ${entry.message}${reset}`;
        if (entry.data) {
            message += `\n   ${JSON.stringify(entry.data, null, 2)}`;
        }
        return message;
    }
    formatFileMessage(entry) {
        return JSON.stringify(entry);
    }
    writeToFile(entry) {
        if (!this.logToFile)
            return;
        const date = new Date().toISOString().split('T')[0];
        const filename = `${entry.level}-${date}.log`;
        const filepath = path.join(this.logDir, filename);
        const line = this.formatFileMessage(entry) + '\n';
        fs.appendFileSync(filepath, line, 'utf8');
        // Também escrever em log geral
        const generalFilepath = path.join(this.logDir, `all-${date}.log`);
        fs.appendFileSync(generalFilepath, line, 'utf8');
    }
    log(level, message, data, context) {
        if (!this.shouldLog(level))
            return;
        const entry = {
            timestamp: this.formatTimestamp(),
            level,
            message,
            data,
            context,
        };
        if (this.logToConsole) {
            console.error(this.formatConsoleMessage(entry));
        }
        this.writeToFile(entry);
    }
    // ============ Public Methods ============
    debug(message, data, context) {
        this.log('debug', message, data, context);
    }
    info(message, data, context) {
        this.log('info', message, data, context);
    }
    warn(message, data, context) {
        this.log('warn', message, data, context);
    }
    error(message, data, context) {
        this.log('error', message, data, context);
    }
    // ============ Specialized Loggers ============
    waha(message, data) {
        this.log('info', message, data, 'WAHA');
    }
    ai(message, data) {
        this.log('info', message, data, 'AI');
    }
    agent(message, data) {
        this.log('info', message, data, 'AGENT');
    }
    webhook(message, data) {
        this.log('info', message, data, 'WEBHOOK');
    }
    mcp(message, data) {
        this.log('info', message, data, 'MCP');
    }
    conversation(message, data) {
        this.log('info', message, data, 'CONV');
    }
    // ============ Utility Methods ============
    setLevel(level) {
        this.logLevel = level;
        this.info(`Log level changed to: ${level}`);
    }
    getLevel() {
        return this.logLevel;
    }
    // Timer para medir performance
    startTimer(label) {
        const start = Date.now();
        return () => {
            const duration = Date.now() - start;
            this.debug(`${label} completed in ${duration}ms`);
        };
    }
    // Log de request/response
    request(method, url, data) {
        this.debug(`→ ${method} ${url}`, data, 'HTTP');
    }
    response(method, url, status, duration) {
        const level = status >= 400 ? 'error' : 'debug';
        this.log(level, `← ${method} ${url} [${status}] ${duration}ms`, undefined, 'HTTP');
    }
    // Separador visual
    separator(title) {
        if (!this.logToConsole)
            return;
        const line = '═'.repeat(50);
        if (title) {
            console.error(`\n╔${line}╗`);
            console.error(`║ ${title.padEnd(48)} ║`);
            console.error(`╚${line}╝\n`);
        }
        else {
            console.error(`\n${'─'.repeat(52)}\n`);
        }
    }
}
// Exportar instância singleton
export const logger = new Logger();
// Exportar classe
export { Logger };
//# sourceMappingURL=logger.js.map