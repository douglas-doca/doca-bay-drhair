// ============================================
// MCP-DOCA-V2 - Tipos TypeScript
// ============================================

// ============ WAHA Types ============
export interface WAHAConfig {
  baseUrl: string;
  apiKey: string;
  session: string;
}

export interface WAHAMessage {
  id: string;
  from: string;
  to: string;
  body: string;
  timestamp: number;
  type: "text" | "image" | "audio" | "video" | "document" | "sticker";
  hasMedia: boolean;
  mediaUrl?: string;
  isFromMe: boolean;
}

export interface WAHAWebhookPayload {
  event: string;
  session: string;
  payload: {
    id: string;
    from: string;
    to: string;
    body: string;
    timestamp: number;
    fromMe: boolean;
    hasMedia: boolean;
    type: string;
  };
}

export interface WAHASendMessageParams {
  chatId: string;
  text: string;
  session?: string;
}

export interface WAHASendMediaParams {
  chatId: string;
  mediaUrl: string;
  caption?: string;
  session?: string;
}

// ============ Conversation Types ============
export interface Conversation {
  id: string;
  chatId: string;
  phone: string;
  name?: string;
  messages: Message[];
  status: ConversationStatus;
  context: ConversationContext;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  metadata?: MessageMetadata;
}

export interface MessageMetadata {
  // ✅ Origem da mensagem (ex: "web_demo", "waha", "manual")
  source?: string;

  // ✅ Integração WAHA
  wahaMessageId?: string;

  // ✅ Observabilidade / IA
  tokens?: number;
  processingTime?: number;

  // ✅ NLP / Emotion (usado no chat demo e na pipeline)
  intent?: string; // já existia
  emotion?: string;
  intention?: string;
  shouldEscalate?: boolean;
}

export type ConversationStatus =
  | "new"
  | "active"
  | "waiting_response"
  | "qualified"
  | "scheduled"
  | "closed"
  | "ghosted";

export interface ConversationContext {
  leadScore?: number;
  interests?: string[];
  objections?: string[];
  stage?: FunnelStage;
  lastIntent?: string;
  customData?: Record<string, unknown>;
}

export type FunnelStage =
  | "awareness"
  | "interest"
  | "consideration"
  | "decision"
  | "action"
  | "retention";

// ============ AI Types ============
export interface AIConfig {
  provider: "openai" | "anthropic";
  model: string;
  apiKey: string;
  maxTokens: number;
  temperature: number;
}

export interface AICompletionParams {
  messages: AIMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AICompletionResponse {
  content: string;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  finishReason: string;
}

// ============ Agent Types ============
export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  config: AgentConfig;
  systemPrompt: string;
  active: boolean;
}

export type AgentType =
  | "response" // Responde mensagens
  | "prospecting" // Prospecção ativa
  | "followup" // Follow-up automático
  | "qualifier"; // Qualificação de leads

export interface AgentConfig {
  maxMessagesPerConversation?: number;
  responseDelayMs?: number;
  workingHours?: WorkingHours;
  antiGhosting?: AntiGhostingConfig;
  escalationRules?: EscalationRule[];
}

export interface WorkingHours {
  enabled: boolean;
  timezone: string;
  schedule: DaySchedule[];
}

export interface DaySchedule {
  day: number; // 0-6 (Sunday-Saturday)
  start: string; // "09:00"
  end: string; // "18:00"
  active: boolean;
}

export interface AntiGhostingConfig {
  enabled: boolean;
  intervals: number[]; // [24, 48, 72] horas
  maxAttempts: number;
  messages: string[];
}

export interface EscalationRule {
  trigger: "keyword" | "sentiment" | "timeout" | "manual";
  condition: string;
  action: "transfer_human" | "notify" | "tag";
  target?: string;
}

// ============ Lead Types ============
export interface Lead {
  id: string;
  phone: string;
  name?: string;
  email?: string;
  source: string;
  score: number;
  status: LeadStatus;
  tags: string[];
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;

  // ✅ Funil / Emocional / Saúde (usado por AIAnalysis + ResponseAgent)
  stage?: string; // pode tipar com LeadStage depois
  health_score?: number; // 0..100
  urgency_level?: "low" | "normal" | "high" | "critical";
  conversion_probability?: number; // 0..1
}

export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "negotiating"
  | "won"
  | "lost";

// ============ Prospecting Types ============
export interface ProspectingSequence {
  id: string;
  name: string;
  steps: ProspectingStep[];
  active: boolean;
  triggerConditions: TriggerCondition[];
}

export interface ProspectingStep {
  order: number;
  delayHours: number;
  messageTemplate: string;
  condition?: string;
}

export interface TriggerCondition {
  type: "tag" | "status" | "score" | "time";
  operator: "equals" | "contains" | "gt" | "lt";
  value: string | number;
}

// ============ MCP Tool Types ============
export interface MCPToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface MCPToolContext {
  conversationId?: string;
  chatId?: string;
  agentId?: string;
}

// ============ Webhook Types ============
export interface WebhookEvent {
  id: string;
  type: string;
  timestamp: Date;
  payload: unknown;
  processed: boolean;
  retries: number;
}

// ============ Database Types ============
export interface DatabaseConfig {
  type: "sqlite" | "postgres" | "supabase";
  connectionString?: string;
  filePath?: string;
}

// ============ Server Types ============
export interface ServerConfig {
  port: number;
  host: string;
  corsOrigins: string[];
  logLevel: "debug" | "info" | "warn" | "error";
}
