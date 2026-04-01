import { Conversation, Message, Lead, ConversationStatus, LeadStatus } from "../types/index.js";
interface SupabaseConfig {
    url: string;
    serviceKey: string;
}
export declare class SupabaseService {
    private url;
    private serviceKey;
    private headers;
    constructor(config?: Partial<SupabaseConfig>);
    request<T>(method: string, table: string, options?: {
        body?: unknown;
        query?: string;
        single?: boolean;
    }): Promise<T | null>;
    getTenantIdBySlug(slug: string): Promise<string | null>;
    getTenantBySlug(slug: string): Promise<{
        id: string;
        name: string;
        slug: string;
        address?: string;
        phone?: string;
        agent_config?: {
            ai_provider?: string;
            ai_model?: string;
            ai_temperature?: number;
            ai_max_tokens?: number;
            [key: string]: any;
        };
        prompt?: string;
        [key: string]: any;
    } | null>;
    createLead(lead: Partial<Lead> & {
        tenant_id?: string;
    }): Promise<Lead | null>;
    getLeadById(tenantId: string | undefined, id: string): Promise<Lead | null>;
    getLeadByPhone(tenantId: string | undefined, phone: string): Promise<Lead | null>;
    updateLead(tenantId: string | undefined, id: string, updates: Partial<Lead>): Promise<Lead | null>;
    getLeadsByStatus(tenantId: string | undefined, status: LeadStatus): Promise<Lead[]>;
    createConversation(phone: string, chatId: string, tenantId?: string): Promise<Conversation | null>;
    getConversationById(tenantId: string | undefined, id: string): Promise<Conversation | null>;
    getConversationByPhone(tenantId: string | undefined, phone: string): Promise<Conversation | null>;
    getOrCreateConversation(phone: string, chatId: string, tenantId?: string): Promise<Conversation>;
    updateConversationStatus(id: string, status: ConversationStatus, tenantId?: string): Promise<void>;
    updateConversationContext(id: string, context: Record<string, unknown>, tenantId?: string): Promise<void>;
    getConversationsByStatus(tenantId: string | undefined, status: ConversationStatus): Promise<Conversation[]>;
    getGhostedConversations(tenantId: string | undefined, hoursAgo: number): Promise<Conversation[]>;
    addMessage(conversationId: string, message: Omit<Message, "id"> & {
        tenant_id?: string;
    }): Promise<Message | null>;
    getMessagesByConversation(tenantId: string | undefined, conversationId: string, limit?: number): Promise<Message[]>;
    getRecentMessages(tenantId: string | undefined, conversationId: string, count?: number): Promise<Message[]>;
    createTemplate(name: string, content: string, category?: string, variables?: string[], tenantId?: string): Promise<void>;
    getTemplate(name: string, tenantId?: string): Promise<{
        content: string;
        variables: string[];
    } | null>;
    getAllTemplates(tenantId?: string): Promise<Array<{
        name: string;
        category: string;
        content: string;
    }>>;
    startProspectingSequence(leadId: string, sequenceName: string, tenantId?: string): Promise<string>;
    getActiveSequences(tenantId?: string): Promise<Array<{
        id: string;
        leadId: string;
        sequenceName: string;
        currentStep: number;
        nextActionAt: string | null;
    }>>;
    advanceSequenceStep(sequenceId: string, nextActionAt?: Date, tenantId?: string): Promise<void>;
    completeSequence(sequenceId: string, tenantId?: string): Promise<void>;
    getConversations(tenantId: string | undefined, limit?: number): Promise<any[]>;
    getLeads(tenantId: string | undefined, status?: string, limit?: number): Promise<any[]>;
    getDashboardStats(tenantId: string | undefined): Promise<{
        totalLeads: number;
        totalConversations: number;
        totalMessages: number;
        activeConversations: number;
        newLeads: number;
        qualifiedLeads: number;
        conversationsByStatus: Record<string, number>;
        leadsByStatus: Record<string, number>;
    }>;
    getStats(): {
        totalLeads: number;
        totalConversations: number;
        activeConversations: number;
    };
    private generateId;
    private mapLead;
    private mapConversation;
    private mapMessage;
    initialize(): Promise<void>;
    close(): void;
}
export declare const supabaseService: SupabaseService;
export {};
//# sourceMappingURL=supabase.service.d.ts.map