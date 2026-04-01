// src/services/analysis.service.ts
// ============================================
// 🔒 ANALYSIS SERVICE - SISTEMA BLINDADO
// ============================================
// TODAS as funções exigem tenantId obrigatório.
// Nenhuma query roda sem filtro de tenant.
// ============================================

import { supabaseService } from "./supabase.service.js";
import { wahaService } from "./waha.service.js";
import { clientService } from "./client.service.js";
import { aiService } from "./ai.service.js";
import { logger } from "../utils/logger.js";
const responseAgent: any = null; // stub — não disponível no Bay

type Range = "today" | "7d" | "30d";

function normalizePhoneOrChatId(input: string): { chatId: string; phone: string } {
  const raw = String(input || "").trim();
  const chatId = raw.includes("@") ? raw : raw;
  const phone = raw.replace("@c.us", "").replace(/\D/g, "");
  return { chatId, phone };
}

export class AnalysisService {
  // ============================================================
  // ✅ Humanized Sender (Agent Studio / Humanizer integration)
  // ============================================================
  /**
   * Envia mensagem passando pelo humanizer (Agent Studio).
   * Usa responseAgent.createResponsePlan() para gerar um plan com bolhas, delays e typing.
   * Se plan não existir (ou falhar), faz fallback para sendMessage.
   */
  private async sendHumanized(
    phoneOrChatId: string,
    text: string,
    meta?: {
      intention?: string;
      emotion?: string;
      stage?: string;
      tenantId?: string;
      clientId?: string;
    }
  ): Promise<void> {
    const clean = String(text || "").trim();
    if (!clean) return;
    const { chatId } = normalizePhoneOrChatId(phoneOrChatId);
    const stage = meta?.stage || "warm";
    const emotion = meta?.emotion || "neutral";
    const intention = meta?.intention || "followup";
    const tenantId = meta?.tenantId;
    const clientId = meta?.clientId;
    
    // Detectar provider (zapi ou waha)
    const provider = clientId ? clientService.getMessageProvider(clientId) : "waha";
    
    // Gera plan usando o mesmo motor do Agent Studio (simulate)
    const plan =
      typeof (responseAgent as any)?.createResponsePlan === "function"
        ? (responseAgent as any).createResponsePlan({
            aiText: clean,
            intention,
            emotion,
            stage,
          })
        : null;
    const items = plan?.items && Array.isArray(plan.items) ? plan.items : null;
    
    try {
      if (items?.length) {
        // Usar o provider correto
        if (provider === "zapi") {
          await (wahaService as any).sendPlanV3(chatId, items);
          return;
        } else if (typeof (wahaService as any)?.sendPlanV3 === "function") {
          await (wahaService as any).sendPlanV3(chatId, items);
          return;
        }
      }
      
      // fallback: 1 mensagem
      if (provider === "zapi") {
        await wahaService.sendMessage({ chatId, text: clean });
      } else {
        await wahaService.sendMessage({ chatId, text: clean });
      }
    } catch (err) {
      // fallback absoluto
      try {
        if (provider === "zapi") {
          await wahaService.sendMessage({ chatId, text: clean });
        } else {
          await wahaService.sendMessage({ chatId, text: clean });
        }
      } catch {
        // ignore
      }
    }
  }

  // ============================================================
  // 🔒 GET STALLED CONVERSATIONS - COM TENANT_ID OBRIGATÓRIO
  // ============================================================
  async getStalledConversations(opts: {
    tenantId: string; // 🔒 OBRIGATÓRIO
    min_minutes: number;
    limit: number;
    status: "open" | "closed";
  }) {
    const { tenantId, min_minutes, limit, status } = opts;

    // 🔒 Validação de segurança
    if (!tenantId) {
      logger.error("🚫 [getStalledConversations] tenantId obrigatório!", undefined, "ANALYSIS");
      return {
        ok: false,
        error: "tenantId obrigatório",
        min_minutes,
        count: 0,
        conversations: [] as any[],
      };
    }

    // 🔒 Passa tenantId para o supabaseService
    const conversations = await supabaseService.getConversations(tenantId, limit * 3);

    const now = Date.now();
    const minMs = min_minutes * 60_000;

    const stalled = (conversations || [])
      .filter((c: any) => {
        if (status && c.status && c.status !== status) return false;

        const updatedIso = c.updated_at || c.updatedAt || c.created_at || c.createdAt || 0;
        const updated = new Date(updatedIso).getTime();

        if (!updated || Number.isNaN(updated)) return false;
        return now - updated >= minMs;
      })
      .slice(0, limit);

    return {
      ok: true,
      min_minutes,
      count: stalled.length,
      conversations: stalled,
    };
  }

  // ============================================================
  // 🔒 GET SUMMARY - COM TENANT_ID OBRIGATÓRIO
  // ============================================================
  async getSummary(opts: { 
    tenantId: string; // 🔒 OBRIGATÓRIO
    range: Range 
  }) {
    const { tenantId, range = "today" } = opts;

    // 🔒 Validação de segurança
    if (!tenantId) {
      logger.error("🚫 [getSummary] tenantId obrigatório!", undefined, "ANALYSIS");
      return {
        ok: false,
        error: "tenantId obrigatório",
        range,
        stalled: 0,
        suggested: 0,
        sent: 0,
      };
    }

    // TODO: Implementar queries reais por tenant
    // Por agora retorna estrutura básica
    return {
      ok: true,
      tenantId,
      range,
      stalled: 0,
      suggested: 0,
      sent: 0,
    };
  }

  // ============================================================
  // 🔒 RUN ANALYSIS - COM TENANT_ID OBRIGATÓRIO
  // ============================================================
  async runAnalysis(opts: {
    tenantId: string; // 🔒 OBRIGATÓRIO
    conversation_id: string;
    mode: "followup" | "insights";
    language: string;
  }) {
    const { tenantId, conversation_id, mode } = opts;

    // 🔒 Validação de segurança
    if (!tenantId) {
      logger.error("🚫 [runAnalysis] tenantId obrigatório!", undefined, "ANALYSIS");
      return { ok: false, error: "tenantId obrigatório", conversation_id };
    }

    // 🔒 Passa tenantId para buscar mensagens
    const messages = await supabaseService.getRecentMessages(tenantId, conversation_id, 80);

    if (!messages || messages.length === 0) {
      return { ok: false, error: "No messages found", conversation_id };
    }

    // Última mensagem
    const last = messages[messages.length - 1] as any;
    const text = String(last?.content || "").trim().slice(0, 400);

    if (mode === "insights") {
      return {
        ok: true,
        conversation_id,
        insights: {
          last_message: text || "—",
          total_messages: messages.length,
          hint: "Trocar por IA real depois",
        },
      };
    }

    // followup heurístico
    const followup =
      text.length > 0
        ? `Oi! Vi sua mensagem: "${text}". Quer que eu te ajude com os próximos passos?`
        : `Oi! Vi que você chamou aqui 😊 Quer que eu te ajude com os próximos passos?`;

    return {
      ok: true,
      conversation_id,
      mode: "followup",
      followups: [
        {
          id: `fu_${Date.now()}`,
          title: "Follow-up rápido",
          timing: "Hoje",
          text: followup,
          confidence: 0.7,
          stage: "reativacao",
          tags: ["followup", "heurístico"],
        },
      ],
    };
  }

  // ============================================================
  // 🔒 APPROVE AND SEND - COM TENANT_ID OBRIGATÓRIO
  // ============================================================
  async approveAndSend(opts: {
    tenantId: string; // 🔒 OBRIGATÓRIO
    conversation_id: string;
    text: string;
    followup_id?: string;
    phone?: string;
  }) {
    const { tenantId, conversation_id, text, phone } = opts;

    // 🔒 Validação de segurança
    if (!tenantId) {
      logger.error("🚫 [approveAndSend] tenantId obrigatório!", undefined, "ANALYSIS");
      return { ok: false, error: "tenantId obrigatório" };
    }

    // Se não veio phone, tenta inferir pela conversa
    let to = phone;

    if (!to) {
      // 🔒 Passa tenantId para buscar conversa
      const conv = await supabaseService.getConversationById(tenantId, conversation_id);
      to = (conv as any)?.chatId || (conv as any)?.chat_id || (conv as any)?.phone;
    }

    if (!to) {
      return { ok: false, error: "Phone/chatId not found for conversation" };
    }

    const cleanText = String(text || "").trim();
    if (cleanText.length < 2) {
      return { ok: false, error: "Text is too short" };
    }

    const { phone: phoneNormalized } = normalizePhoneOrChatId(String(to));

    // ✅ stage do lead (melhora CTA / comportamento do humanizer)
    let stage = "warm";
    try {
      if (phoneNormalized) {
        // 🔒 Passa tenantId para buscar lead
        const lead = await supabaseService.getLeadByPhone(tenantId, phoneNormalized);
        stage = (lead as any)?.stage || "warm";
      }
    } catch {}

    // ✅ envio humanizado (bolhas + typing + delays)
    await this.sendHumanized(String(to), cleanText, {
      intention: "followup",
      emotion: "neutral",
      stage,
    });

    logger.info("Followup sent", { tenantId, conversation_id, to, stage }, "ANALYSIS");

    return { ok: true, tenantId, conversation_id, to, stage };
  }
}

export const analysisService = new AnalysisService();