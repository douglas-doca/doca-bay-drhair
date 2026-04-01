type SendMessagePayload = {
    chatId: string;
    text: string;
    session?: string;
};
type SendMediaPayload = {
    chatId: string;
    mediaUrl: string;
    caption?: string;
    session?: string;
};
type SendVoicePayload = {
    chatId: string;
    /** URL pública do áudio OU base64 data URI */
    audioSource: string;
    /** mime type do áudio original (default: audio/mpeg) */
    mimetype?: string;
    /** Se true, WAHA Plus converte automaticamente pra OGG/Opus (default: true) */
    convert?: boolean;
    session?: string;
};
type SendFilePayload = {
    chatId: string;
    /** URL pública OU base64 data URI */
    fileSource: string;
    filename?: string;
    mimetype?: string;
    caption?: string;
    session?: string;
};
type WAHAConfig = {
    baseUrl: string;
    apiKey: string;
    session: string;
    timeoutMs: number;
    debug: boolean;
};
type PlanItem = {
    type: "typing";
    action: "start" | "stop";
    delayMs: number;
} | {
    type: "text";
    text: string;
    delayMs: number;
};
export declare function rememberBotSentId(id?: string | null, chatId?: string | null): void;
export declare function isBotSentId(id?: string | null, chatId?: string | null): boolean;
export declare class WAHAService {
    private config;
    constructor(config?: Partial<WAHAConfig>);
    private resolveSession;
    private normalizeChatId;
    private sleep;
    private headers;
    request(method: string, endpoint: string, body?: any): Promise<any>;
    private trackBotMessage;
    private sanitizeForWhatsApp;
    sendMessage(payload: SendMessagePayload): Promise<any>;
    sendVoice(payload: SendVoicePayload): Promise<any>;
    sendVoiceBuffer(chatId: string, audioBuffer: Buffer, mimetype?: string, session?: string): Promise<any>;
    sendMedia(payload: SendMediaPayload): Promise<any>;
    sendImage(chatId: string, imageUrl: string, caption?: string, session?: string): Promise<any>;
    sendFile(payload: SendFilePayload): Promise<any>;
    downloadMedia(mediaUrl: string): Promise<Buffer>;
    downloadMediaById(messageId: string, session?: string): Promise<Buffer>;
    getMessages(chatId: string, limit?: number, session?: string): Promise<any>;
    checkNumber(phone: string, session?: string): Promise<any>;
    lidToPhone(lid: string, session?: string): Promise<string | null>;
    startTyping(chatId: string, session?: string): Promise<any>;
    stopTyping(chatId: string, session?: string): Promise<any>;
    sendTypingFor(chatId: string, ms: number, session?: string): Promise<void>;
    convertVoice(audioUrl: string, session?: string): Promise<Buffer>;
    getSessionStatus(): Promise<any>;
    restartSession(session?: string): Promise<any>;
    sendPlanV3(chatId: string, items: PlanItem[], session?: string): Promise<void>;
    getConfig(): Readonly<WAHAConfig>;
    getBaseUrl(): string;
    getApiKey(): string;
    getSession(): string;
}
export declare const wahaService: WAHAService;
export declare function getWahaForBaseUrl(baseUrl: string, apiKey?: string): WAHAService;
export declare function resolveLid(lid: string, session: string, wahaInstance?: WAHAService): Promise<string | null>;
export {};
//# sourceMappingURL=waha.service.d.ts.map