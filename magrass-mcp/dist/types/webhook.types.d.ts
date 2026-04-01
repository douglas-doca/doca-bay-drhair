export type WebhookProvider = "waha" | "zapi";
export interface NormalizedMessage {
    provider: WebhookProvider;
    messageId: string;
    chatId: string;
    phone: string;
    type: "text" | "image" | "audio" | "video" | "document" | "sticker" | "location" | "contact" | "reaction" | "poll" | "order" | "unknown";
    text?: string;
    caption?: string;
    mediaUrl?: string;
    mimeType?: string;
    fromMe: boolean;
    isGroup: boolean;
    timestamp: number;
    senderName?: string;
    senderPhoto?: string;
    participantPhone?: string;
    instanceId?: string;
    session?: string;
    connectedPhone?: string;
    raw: any;
}
export interface ClientMessageConfig {
    provider: WebhookProvider;
    wahaSession?: string;
    wahaApiUrl?: string;
    zapiInstanceId?: string;
    zapiToken?: string;
    zapiClientToken?: string;
}
//# sourceMappingURL=webhook.types.d.ts.map