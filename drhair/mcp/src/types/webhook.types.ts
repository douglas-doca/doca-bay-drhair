// ============================================================
// src/types/webhook.types.ts
// Tipos para webhooks normalizados (WAHA + Z-API)
// ============================================================

export type WebhookProvider = "waha" | "zapi";

export interface NormalizedMessage {
  // Identificação
  provider: WebhookProvider;
  messageId: string;
  chatId: string;
  phone: string;
  
  // Conteúdo
  type: "text" | "image" | "audio" | "video" | "document" | "sticker" | "location" | "contact" | "reaction" | "poll" | "order" | "unknown";
  text?: string;
  caption?: string;
  mediaUrl?: string;
  mimeType?: string;
  
  // Metadata
  fromMe: boolean;
  isGroup: boolean;
  timestamp: number;
  senderName?: string;
  senderPhoto?: string;
  
  // Grupo
  participantPhone?: string;
  
  // Instância
  instanceId?: string;
  session?: string;
  connectedPhone?: string;
  
  // Raw
  raw: any;
}

export interface ClientMessageConfig {
  provider: WebhookProvider;
  // WAHA
  wahaSession?: string;
  wahaApiUrl?: string;
  // Z-API
  zapiInstanceId?: string;
  zapiToken?: string;
  zapiClientToken?: string;
}