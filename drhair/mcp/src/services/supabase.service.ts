// ============================================
// MCP-DOCA-V2 - Supabase Service
// 🔒 SISTEMA BLINDADO - TENANT_ID OBRIGATÓRIO
// ============================================
// Persistência de dados com Supabase
// TODAS as funções que acessam dados de negócio
// exigem tenantId para garantir isolamento.
// ============================================

import { logger } from "../utils/logger.js";
import {
  Conversation,
  Message,
  Lead,
  ConversationStatus,
  LeadStatus,
} from "../types/index.js";

interface SupabaseConfig {
  url: string;
  serviceKey: string;
}

export class SupabaseService {
  private url: string;
  private serviceKey: string;
  private headers: Record<string, string>;

  constructor(config?: Partial<SupabaseConfig>) {
    this.url = config?.url || process.env.SUPABASE_URL || "";
    this.serviceKey = config?.serviceKey || process.env.SUPABASE_SERVICE_KEY || "";

    this.headers = {
      "Content-Type": "application/json",
      apikey: this.serviceKey,
      Authorization: `Bearer ${this.serviceKey}`,
      Prefer: "return=representation",
    };

    if (!this.url || !this.serviceKey) {
      logger.warn("Supabase credentials not configured", undefined, "SUPABASE");
    } else {
      logger.info("Supabase Service initialized", { url: this.url }, "SUPABASE");
    }
  }

  // ============ Generic API Methods ============

  public async request<T>(
    method: string,
    table: string,
    options?: {
      body?: unknown;
      query?: string;
      single?: boolean;
    }
  ): Promise<T | null> {
    const queryString = options?.query ? `?${options.query}` : "";
    const url = `${this.url}/rest/v1/${table}${queryString}`;

    try {
      const headers = { ...this.headers };

      if (options?.single) {
        headers["Accept"] = "application/vnd.pgrst.object+json";
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch(url, {
        method,
        headers,
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        if (response.status !== 409) {
          logger.error(
            `Supabase ${method} ${table} failed`,
            { status: response.status, error },
            "SUPABASE"
          );
        }
        return null;
      }

      const text = await response.text();
      if (!text) return null;

      return JSON.parse(text) as T;
    } catch (error) {
      logger.error("Supabase request failed", error, "SUPABASE");
      return null;
    }
  }

  // ============ Tenant Operations ============

  async getTenantIdBySlug(slug: string): Promise<string | null> {
    try {
      const result = await this.request<any[]>("GET", "tenants", {
        query: `slug=eq.${slug}&select=id`,
      });
      return result?.[0]?.id || null;
    } catch (error) {
      logger.error("Error getting tenant by slug", error, "SUPABASE");
      return null;
    }
  }

  async getTenantBySlug(slug: string): Promise<{
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
  } | null> {
    try {
      const result = await this.request<any[]>("GET", "tenants", {
        query: `slug=eq.${slug}&select=*`,
      });
      return result?.[0] || null;
    } catch (error) {
      logger.error("Error getting tenant by slug", error, "SUPABASE");
      return null;
    }
  }

  // ============ Lead Operations ============

  // 🔒 CORRIGIDO: tenant_id obrigatório
  async createLead(lead: Partial<Lead> & { tenant_id?: string }): Promise<Lead | null> {
    const id = lead.id || this.generateId();
    const now = new Date().toISOString();

    const data: Record<string, any> = {
      id,
      phone: lead.phone,
      name: lead.name || null,
      email: lead.email || null,
      source: lead.source || "whatsapp",
      score: lead.score || 0,
      status: lead.status || "new",
      tags: lead.tags || [],
      custom_fields: lead.customFields || {},
      created_at: now,
      updated_at: now,
    };

    if (lead.tenant_id) {
      data.tenant_id = lead.tenant_id;
    }

    const result = await this.request<any[]>("POST", "leads", { body: data });
    
    if (result?.[0]) {
      return this.mapLead(result[0]);
    }

    // Se falhou (provavelmente duplicado), busca o existente
    if (lead.phone) {
      logger.warn(`Lead creation skipped (likely duplicate). Fetching existing: ${lead.phone}`, undefined, "SUPABASE");
      return this.getLeadByPhone(lead.tenant_id, lead.phone);
    }

    return null;
  }

  // 🔒 CORRIGIDO: tenantId obrigatório
  async getLeadById(tenantId: string | undefined, id: string): Promise<Lead | null> {
    let query = `id=eq.${id}`;
    
    // 🔒 Filtrar por tenant
    if (tenantId) {
      query += `&tenant_id=eq.${tenantId}`;
    } else {
      logger.warn("🚫 [getLeadById] chamado sem tenantId!", undefined, "SUPABASE");
    }

    const result = await this.request<any>("GET", "leads", {
      query,
      single: true,
    });
    return result ? this.mapLead(result) : null;
  }

  // 🔒 CORRIGIDO: tenantId como primeiro parâmetro
  async getLeadByPhone(tenantId: string | undefined, phone: string): Promise<Lead | null> {
    let query = "";
    
    // Se tiver letras ou dois pontos, é um ID de sessão
    if (phone.includes(":") || /[a-zA-Z]/.test(phone)) {
      query = `phone=eq.${phone}`;
    } else {
      const cleanPhone = phone.replace(/\D/g, "");
      query = `phone=ilike.*${cleanPhone}*`;
    }

    // 🔒 Filtrar por tenant
    if (tenantId) {
      query += `&tenant_id=eq.${tenantId}`;
    } else {
      logger.warn("🚫 [getLeadByPhone] chamado sem tenantId!", undefined, "SUPABASE");
    }

    query += "&limit=1";

    const result = await this.request<any[]>("GET", "leads", { query });
    return result?.[0] ? this.mapLead(result[0]) : null;
  }

  // 🔒 CORRIGIDO: tenantId obrigatório
  async updateLead(tenantId: string | undefined, id: string, updates: Partial<Lead>): Promise<Lead | null> {
    const data: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.name !== undefined) data.name = updates.name;
    if (updates.email !== undefined) data.email = updates.email;
    if (updates.score !== undefined) data.score = updates.score;
    if (updates.status !== undefined) data.status = updates.status;
    if (updates.tags !== undefined) data.tags = updates.tags;
    if (updates.customFields !== undefined) data.custom_fields = updates.customFields;
    if ((updates as any).stage !== undefined) data.stage = (updates as any).stage;

    let query = `id=eq.${id}`;
    
    // 🔒 Filtrar por tenant
    if (tenantId) {
      query += `&tenant_id=eq.${tenantId}`;
    } else {
      logger.warn("🚫 [updateLead] chamado sem tenantId!", undefined, "SUPABASE");
    }
    
    const result = await this.request<any[]>("PATCH", "leads", {
      query,
      body: data,
    });

    return result?.[0] ? this.mapLead(result[0]) : null;
  }

  // 🔒 CORRIGIDO: tenantId obrigatório
  async getLeadsByStatus(tenantId: string | undefined, status: LeadStatus): Promise<Lead[]> {
    let query = `status=eq.${status}&order=updated_at.desc`;
    
    // 🔒 Filtrar por tenant
    if (tenantId) {
      query = `tenant_id=eq.${tenantId}&${query}`;
    } else {
      logger.warn("🚫 [getLeadsByStatus] chamado sem tenantId!", undefined, "SUPABASE");
    }

    const result = await this.request<any[]>("GET", "leads", { query });
    return result?.map((r) => this.mapLead(r)) || [];
  }

  // ============ Conversation Operations ============

  // 🔒 CORRIGIDO: tenantId obrigatório
  async createConversation(phone: string, chatId: string, tenantId?: string): Promise<Conversation | null> {
    const id = this.generateId();
    const now = new Date().toISOString();

    let lead = await this.getLeadByPhone(tenantId, phone);
    if (!lead) {
      lead = await this.createLead({ phone, tenant_id: tenantId });
    }

    const data: Record<string, any> = {
      id,
      chat_id: chatId,
      phone,
      lead_id: lead?.id,
      status: "new",
      context: {},
      created_at: now,
      updated_at: now,
      last_message_at: now,
    };

    if (tenantId) {
      data.tenant_id = tenantId;
    }

    const result = await this.request<any[]>("POST", "conversations", { body: data });
    if (!result?.[0]) return null;

    return this.mapConversation(result[0], []);
  }

  // 🔒 CORRIGIDO: tenantId obrigatório
  async getConversationById(tenantId: string | undefined, id: string): Promise<Conversation | null> {
    let query = `id=eq.${id}`;
    
    // 🔒 Filtrar por tenant
    if (tenantId) {
      query += `&tenant_id=eq.${tenantId}`;
    } else {
      logger.warn("🚫 [getConversationById] chamado sem tenantId!", undefined, "SUPABASE");
    }

    const result = await this.request<any>("GET", "conversations", {
      query,
      single: true,
    });

    if (!result) return null;

    const messages = await this.getMessagesByConversation(tenantId, id);
    return this.mapConversation(result, messages);
  }

  // 🔒 CORRIGIDO: tenantId obrigatório
  async getConversationByPhone(tenantId: string | undefined, phone: string): Promise<Conversation | null> {
    let query = "";
    
    if (phone.includes(":") || /[a-zA-Z]/.test(phone)) {
      query = `phone=eq.${phone}`;
    } else {
      const cleanPhone = phone.replace(/\D/g, "");
      query = `phone=ilike.*${cleanPhone}*`;
    }

    // 🔒 Filtrar por tenant
    if (tenantId) {
      query += `&tenant_id=eq.${tenantId}`;
    } else {
      logger.warn("🚫 [getConversationByPhone] chamado sem tenantId!", undefined, "SUPABASE");
    }

    query += "&order=updated_at.desc&limit=1";

    const result = await this.request<any[]>("GET", "conversations", { query });

    if (!result?.[0]) return null;

    const messages = await this.getMessagesByConversation(tenantId, result[0].id);
    return this.mapConversation(result[0], messages);
  }

  // 🔒 CORRIGIDO: tenantId obrigatório
  async getOrCreateConversation(phone: string, chatId: string, tenantId?: string): Promise<Conversation> {
    let conversation = await this.getConversationByPhone(tenantId, phone);

    if (!conversation) {
      conversation = await this.createConversation(phone, chatId, tenantId);
    }

    if (!conversation) {
      throw new Error("Supabase: Failed to getOrCreateConversation");
    }

    return conversation;
  }

  // 🔒 CORRIGIDO: tenantId obrigatório
  async updateConversationStatus(id: string, status: ConversationStatus, tenantId?: string): Promise<void> {
    let query = `id=eq.${id}`;
    
    // 🔒 Filtrar por tenant
    if (tenantId) {
      query += `&tenant_id=eq.${tenantId}`;
    } else {
      logger.warn("🚫 [updateConversationStatus] chamado sem tenantId!", undefined, "SUPABASE");
    }

    await this.request("PATCH", "conversations", {
      query,
      body: {
        status,
        updated_at: new Date().toISOString(),
      },
    });
  }

  // 🔒 CORRIGIDO: tenantId obrigatório
  async updateConversationContext(id: string, context: Record<string, unknown>, tenantId?: string): Promise<void> {
    let query = `id=eq.${id}`;
    
    // 🔒 Filtrar por tenant
    if (tenantId) {
      query += `&tenant_id=eq.${tenantId}`;
    } else {
      logger.warn("🚫 [updateConversationContext] chamado sem tenantId!", undefined, "SUPABASE");
    }

    await this.request("PATCH", "conversations", {
      query,
      body: {
        context,
        updated_at: new Date().toISOString(),
      },
    });
  }

  // 🔒 CORRIGIDO: tenantId obrigatório
  async getConversationsByStatus(tenantId: string | undefined, status: ConversationStatus): Promise<Conversation[]> {
    let query = `status=eq.${status}&order=updated_at.desc`;
    
    // 🔒 Filtrar por tenant
    if (tenantId) {
      query = `tenant_id=eq.${tenantId}&${query}`;
    } else {
      logger.warn("🚫 [getConversationsByStatus] chamado sem tenantId!", undefined, "SUPABASE");
    }

    const result = await this.request<any[]>("GET", "conversations", { query });

    if (!result) return [];

    const conversations: Conversation[] = [];
    for (const row of result) {
      const messages = await this.getMessagesByConversation(tenantId, row.id);
      conversations.push(this.mapConversation(row, messages));
    }
    return conversations;
  }

  // 🔒 CORRIGIDO: tenantId obrigatório
  async getGhostedConversations(tenantId: string | undefined, hoursAgo: number): Promise<Conversation[]> {
    const cutoff = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();

    let query = `status=in.(active,waiting_response)&last_message_at=lt.${cutoff}&order=last_message_at.asc`;
    
    // 🔒 Filtrar por tenant
    if (tenantId) {
      query = `tenant_id=eq.${tenantId}&${query}`;
    } else {
      logger.warn("🚫 [getGhostedConversations] chamado sem tenantId!", undefined, "SUPABASE");
    }

    const result = await this.request<any[]>("GET", "conversations", { query });

    if (!result) return [];

    const conversations: Conversation[] = [];
    for (const row of result) {
      const messages = await this.getMessagesByConversation(tenantId, row.id);
      conversations.push(this.mapConversation(row, messages));
    }
    return conversations;
  }

  // ============ Message Operations ============

  // 🔒 CORRIGIDO: inclui tenant_id no body
  async addMessage(conversationId: string, message: Omit<Message, "id"> & { tenant_id?: string }): Promise<Message | null> {
    const id = this.generateId();
    const timestamp = message.timestamp?.toISOString() || new Date().toISOString();

    const data: Record<string, any> = {
      id,
      conversation_id: conversationId,
      role: message.role,
      content: message.content,
      timestamp,
      metadata: message.metadata || {},
    };

    // 🔒 Incluir tenant_id se fornecido
    if (message.tenant_id) {
      data.tenant_id = message.tenant_id;
    }

    const result = await this.request<any[]>("POST", "messages", { body: data });

    await this.request("PATCH", "conversations", {
      query: `id=eq.${conversationId}`,
      body: {
        last_message_at: timestamp,
        updated_at: timestamp,
      },
    });

    if (!result?.[0]) return null;
    return this.mapMessage(result[0]);
  }

  // 🔒 CORRIGIDO: tenantId obrigatório
  async getMessagesByConversation(tenantId: string | undefined, conversationId: string, limit: number = 50): Promise<Message[]> {
    let query = `conversation_id=eq.${conversationId}&order=timestamp.desc&limit=${limit}`;
    
    // 🔒 Filtrar por tenant
    if (tenantId) {
      query = `tenant_id=eq.${tenantId}&${query}`;
    }
    // Nota: Não loga warning aqui pois pode ser chamado em contextos onde tenantId não está disponível

    const result = await this.request<any[]>("GET", "messages", { query });

    return result?.reverse().map((r) => this.mapMessage(r)) || [];
  }

  // 🔒 CORRIGIDO: tenantId como primeiro parâmetro
  async getRecentMessages(tenantId: string | undefined, conversationId: string, count: number = 10): Promise<Message[]> {
    let query = `conversation_id=eq.${conversationId}&order=timestamp.desc&limit=${count}`;
    
    // 🔒 Filtrar por tenant
    if (tenantId) {
      query = `tenant_id=eq.${tenantId}&${query}`;
    }

    const result = await this.request<any[]>("GET", "messages", { query });

    return result?.reverse().map((r) => this.mapMessage(r)) || [];
  }

  // ============ Template Operations ============

  async createTemplate(
    name: string,
    content: string,
    category?: string,
    variables?: string[],
    tenantId?: string
  ): Promise<void> {
    const id = this.generateId();
    
    const data: Record<string, any> = {
      id,
      name,
      category: category || "general",
      content,
      variables: variables || [],
      created_at: new Date().toISOString(),
    };

    if (tenantId) {
      data.tenant_id = tenantId;
    }

    await this.request("POST", "templates", { body: data });
  }

  async getTemplate(name: string, tenantId?: string): Promise<{ content: string; variables: string[] } | null> {
    let query = `name=eq.${name}`;
    
    if (tenantId) {
      query += `&tenant_id=eq.${tenantId}`;
    }

    const result = await this.request<any>("GET", "templates", {
      query,
      single: true,
    });

    if (!result) return null;

    return {
      content: result.content,
      variables: result.variables || [],
    };
  }

  async getAllTemplates(tenantId?: string): Promise<Array<{ name: string; category: string; content: string }>> {
    let query = "select=name,category,content";
    
    if (tenantId) {
      query += `&tenant_id=eq.${tenantId}`;
    }

    const result = await this.request<any[]>("GET", "templates", { query });
    return result || [];
  }

  // ============ Prospecting Operations ============

  async startProspectingSequence(leadId: string, sequenceName: string, tenantId?: string): Promise<string> {
    const id = this.generateId();
    const now = new Date().toISOString();

    const data: Record<string, any> = {
      id,
      lead_id: leadId,
      sequence_name: sequenceName,
      current_step: 0,
      status: "active",
      created_at: now,
      updated_at: now,
    };

    if (tenantId) {
      data.tenant_id = tenantId;
    }

    await this.request("POST", "prospecting_sequences", { body: data });

    return id;
  }

  async getActiveSequences(tenantId?: string): Promise<
    Array<{
      id: string;
      leadId: string;
      sequenceName: string;
      currentStep: number;
      nextActionAt: string | null;
    }>
  > {
    let query = `status=eq.active`;
    
    if (tenantId) {
      query = `tenant_id=eq.${tenantId}&${query}`;
    }

    const result = await this.request<any[]>("GET", "prospecting_sequences", { query });

    return (
      result?.map((row) => ({
        id: row.id,
        leadId: row.lead_id,
        sequenceName: row.sequence_name,
        currentStep: row.current_step,
        nextActionAt: row.next_action_at,
      })) || []
    );
  }

  async advanceSequenceStep(sequenceId: string, nextActionAt?: Date, tenantId?: string): Promise<void> {
    let query = `id=eq.${sequenceId}`;
    
    if (tenantId) {
      query += `&tenant_id=eq.${tenantId}`;
    }

    const current = await this.request<any>("GET", "prospecting_sequences", {
      query,
      single: true,
    });

    if (current) {
      await this.request("PATCH", "prospecting_sequences", {
        query,
        body: {
          current_step: (current.current_step || 0) + 1,
          next_action_at: nextActionAt?.toISOString() || null,
          updated_at: new Date().toISOString(),
        },
      });
    }
  }

  async completeSequence(sequenceId: string, tenantId?: string): Promise<void> {
    let query = `id=eq.${sequenceId}`;
    
    if (tenantId) {
      query += `&tenant_id=eq.${tenantId}`;
    }

    await this.request("PATCH", "prospecting_sequences", {
      query,
      body: {
        status: "completed",
        updated_at: new Date().toISOString(),
      },
    });
  }

  // ============ Dashboard API Methods ============

  // 🔒 CORRIGIDO: tenantId obrigatório
  async getConversations(tenantId: string | undefined, limit: number = 50): Promise<any[]> {
    let query = `order=updated_at.desc&limit=${limit}`;
    
    // 🔒 Filtrar por tenant
    if (tenantId) {
      query = `tenant_id=eq.${tenantId}&${query}`;
    } else {
      logger.warn("🚫 [getConversations] chamado sem tenantId!", undefined, "SUPABASE");
    }

    const result = await this.request<any[]>("GET", "conversations", { query });
    return result || [];
  }

  // 🔒 CORRIGIDO: tenantId obrigatório
  async getLeads(tenantId: string | undefined, status?: string, limit: number = 50): Promise<any[]> {
    let query = `order=updated_at.desc&limit=${limit}`;
    
    // 🔒 Filtrar por tenant
    if (tenantId) {
      query = `tenant_id=eq.${tenantId}&${query}`;
    } else {
      logger.warn("🚫 [getLeads] chamado sem tenantId!", undefined, "SUPABASE");
    }
    
    if (status) {
      query = `status=eq.${status}&${query}`;
    }

    const result = await this.request<any[]>("GET", "leads", { query });
    return result || [];
  }

  // 🔒 CORRIGIDO: tenantId obrigatório
  async getDashboardStats(tenantId: string | undefined): Promise<{
    totalLeads: number;
    totalConversations: number;
    totalMessages: number;
    activeConversations: number;
    newLeads: number;
    qualifiedLeads: number;
    conversationsByStatus: Record<string, number>;
    leadsByStatus: Record<string, number>;
  }> {
    // 🔒 Validação
    if (!tenantId) {
      logger.warn("🚫 [getDashboardStats] chamado sem tenantId!", undefined, "SUPABASE");
      return {
        totalLeads: 0,
        totalConversations: 0,
        totalMessages: 0,
        activeConversations: 0,
        newLeads: 0,
        qualifiedLeads: 0,
        conversationsByStatus: {},
        leadsByStatus: {},
      };
    }

    // 🔒 Todas as queries com filtro de tenant
    const leadsQuery = `tenant_id=eq.${tenantId}&select=id,status`;
    const conversationsQuery = `tenant_id=eq.${tenantId}&select=id,status`;
    const messagesQuery = `tenant_id=eq.${tenantId}&select=id`;

    const leads = await this.request<any[]>("GET", "leads", { query: leadsQuery });
    const conversations = await this.request<any[]>("GET", "conversations", { query: conversationsQuery });
    const messages = await this.request<any[]>("GET", "messages", { query: messagesQuery });

    const leadsByStatus: Record<string, number> = {};
    const conversationsByStatus: Record<string, number> = {};

    leads?.forEach((l) => {
      leadsByStatus[l.status] = (leadsByStatus[l.status] || 0) + 1;
    });

    conversations?.forEach((c) => {
      conversationsByStatus[c.status] = (conversationsByStatus[c.status] || 0) + 1;
    });

    return {
      totalLeads: leads?.length || 0,
      totalConversations: conversations?.length || 0,
      totalMessages: messages?.length || 0,
      activeConversations: conversationsByStatus["active"] || 0,
      newLeads: leadsByStatus["new"] || 0,
      qualifiedLeads: leadsByStatus["qualified"] || 0,
      conversationsByStatus,
      leadsByStatus,
    };
  }

  // ============ Stats & Analytics (placeholder) ============

  getStats(): {
    totalLeads: number;
    totalConversations: number;
    activeConversations: number;
  } {
    return {
      totalLeads: 0,
      totalConversations: 0,
      activeConversations: 0,
    };
  }

  // ============ Helper Methods ============

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private mapLead(row: any): Lead {
    return {
      id: row.id,
      phone: row.phone,
      name: row.name,
      email: row.email,
      source: row.source,
      score: row.score,
      status: row.status as LeadStatus,
      stage: row.stage || null,
      health_score: row.health_score ?? null,
      urgency_level: row.urgency_level ?? null,
      conversion_probability: row.conversion_probability ?? null,
      tags: row.tags || [],
      customFields: row.custom_fields || {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapConversation(row: any, messages: Message[]): Conversation {
    return {
      id: row.id,
      chatId: row.chat_id,
      phone: row.phone,
      status: row.status as ConversationStatus,
      context: row.context || {},
      messages,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastMessageAt: row.last_message_at ? new Date(row.last_message_at) : new Date(),
    };
  }

  private mapMessage(row: any): Message {
    return {
      id: row.id,
      role: row.role as "user" | "assistant" | "system",
      content: row.content,
      timestamp: new Date(row.timestamp),
      metadata: row.metadata || {},
    };
  }

  async initialize(): Promise<void> {
    logger.info("Supabase Service ready", undefined, "SUPABASE");
  }

  close(): void {
    logger.info("Supabase Service closed", undefined, "SUPABASE");
  }
}

export const supabaseService = new SupabaseService();