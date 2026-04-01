export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    data?: unknown;
    context?: string;
}
declare class Logger {
    private logLevel;
    private logDir;
    private logToFile;
    private logToConsole;
    private levelPriority;
    private levelColors;
    private levelEmojis;
    constructor();
    private shouldLog;
    private formatTimestamp;
    private formatConsoleMessage;
    private formatFileMessage;
    private writeToFile;
    private log;
    debug(message: string, data?: unknown, context?: string): void;
    info(message: string, data?: unknown, context?: string): void;
    warn(message: string, data?: unknown, context?: string): void;
    error(message: string, data?: unknown, context?: string): void;
    waha(message: string, data?: unknown): void;
    ai(message: string, data?: unknown): void;
    agent(message: string, data?: unknown): void;
    webhook(message: string, data?: unknown): void;
    mcp(message: string, data?: unknown): void;
    conversation(message: string, data?: unknown): void;
    setLevel(level: LogLevel): void;
    getLevel(): LogLevel;
    startTimer(label: string): () => void;
    request(method: string, url: string, data?: unknown): void;
    response(method: string, url: string, status: number, duration: number): void;
    separator(title?: string): void;
}
export declare const logger: Logger;
export { Logger };
//# sourceMappingURL=logger.d.ts.map