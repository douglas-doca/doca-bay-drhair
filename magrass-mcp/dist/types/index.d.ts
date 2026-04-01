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
    source?: string;
    wahaMessageId?: string;
    tokens?: number;
    processingTime?: number;
    intent?: string;
    emotion?: string;
    intention?: string;
    shouldEscalate?: boolean;
}
export type ConversationStatus = "new" | "active" | "waiting_response" | "qualified" | "scheduled" | "closed" | "ghosted";
export interface ConversationContext {
    leadScore?: number;
    interests?: string[];
    objections?: string[];
    stage?: FunnelStage;
    lastIntent?: string;
    customData?: Record<string, unknown>;
}
export type FunnelStage = "awareness" | "interest" | "consideration" | "decision" | "action" | "retention";
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
export interface Agent {
    id: string;
    name: string;
    type: AgentType;
    config: AgentConfig;
    systemPrompt: string;
    active: boolean;
}
export type AgentType = "response" | "prospecting" | "followup" | "qualifier";
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
    day: number;
    start: string;
    end: string;
    active: boolean;
}
export interface AntiGhostingConfig {
    enabled: boolean;
    intervals: number[];
    maxAttempts: number;
    messages: string[];
}
export interface EscalationRule {
    trigger: "keyword" | "sentiment" | "timeout" | "manual";
    condition: string;
    action: "transfer_human" | "notify" | "tag";
    target?: string;
}
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
    stage?: string;
    health_score?: number;
    urgency_level?: "low" | "normal" | "high" | "critical";
    conversion_probability?: number;
}
export type LeadStatus = "new" | "contacted" | "qualified" | "negotiating" | "won" | "lost";
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
export interface WebhookEvent {
    id: string;
    type: string;
    timestamp: Date;
    payload: unknown;
    processed: boolean;
    retries: number;
}
export interface DatabaseConfig {
    type: "sqlite" | "postgres" | "supabase";
    connectionString?: string;
    filePath?: string;
}
export interface ServerConfig {
    port: number;
    host: string;
    corsOrigins: string[];
    logLevel: "debug" | "info" | "warn" | "error";
}
//# sourceMappingURL=index.d.ts.map