// src/services/memory.service.ts
// ============================================
// Memória entre sessões WhatsApp
// 
// Gera resumo da conversa com Haiku quando o lead
// retorna após 30+ minutos. O resumo é injetado
// no contexto do router + agente.
// ============================================
import Anthropic from "@anthropic-ai/sdk";
import { supabaseService } from "./supabase.service.js";
import { logger } from "../utils/logger.js";
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});
const MEMORY_MODEL = "claude-haiku-4-5-20251001";
const SESSION_GAP_MS = 30 * 60 * 1000; // 30 minutos = sessão nova
const MAX_MESSAGES_FOR_SUMMARY = 30;
const MAX_SUMMARY_LENGTH = 300; // chars
// Cache em memória para evitar gerar resumo toda mensagem
const recentSummaryCache = new Map();
const SUMMARY_COOLDOWN_MS = 10 * 60 * 1000; // Mínimo 10 min entre resumos
// ============================================
// VERIFICAR SE PRECISA GERAR RESUMO
// ============================================
export async function shouldGenerateMemory(tenantId, phone) {
    try {
        // Cooldown: não gerar 2x em 10 min pro mesmo lead
        const cacheKey = `${tenantId}:${phone}`;
        const cached = recentSummaryCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < SUMMARY_COOLDOWN_MS) {
            return false;
        }
        // Buscar última mensagem do lead e do bot
        const messages = await supabaseService.request("GET", "chat_messages", {
            query: `tenant_id=eq.${tenantId}&phone=eq.${phone}&order=created_at.desc&limit=2`,
        });
        if (!messages || messages.length < 2)
            return false;
        // A mensagem mais recente é a que acabou de chegar (do lead)
        // A anterior é a última do bot
        const lastBotMsg = messages.find((m) => !m.is_from_customer);
        const currentMsg = messages.find((m) => m.is_from_customer);
        if (!lastBotMsg || !currentMsg)
            return false;
        const lastBotTime = new Date(lastBotMsg.created_at).getTime();
        const currentTime = new Date(currentMsg.created_at).getTime();
        const gap = currentTime - lastBotTime;
        // Se gap > 30 min, é sessão nova → gerar resumo
        if (gap > SESSION_GAP_MS) {
            logger.info("[Memory] 🧠 Sessão fria detectada", {
                phone: phone.slice(-4),
                gapMinutes: Math.round(gap / 60000),
            });
            return true;
        }
        return false;
    }
    catch (error) {
        logger.error("[Memory] Erro ao verificar sessão", error);
        return false;
    }
}
// ============================================
// GERAR RESUMO COM HAIKU
// ============================================
export async function generateMemorySummary(tenantId, phone) {
    try {
        const cacheKey = `${tenantId}:${phone}`;
        // Buscar histórico completo
        const messages = await supabaseService.request("GET", "chat_messages", {
            query: `tenant_id=eq.${tenantId}&phone=eq.${phone}&order=created_at.desc&limit=${MAX_MESSAGES_FOR_SUMMARY}`,
        });
        if (!messages || messages.length < 4) {
            logger.info("[Memory] Poucas mensagens para resumir", { phone: phone.slice(-4), count: messages?.length });
            return null;
        }
        // Montar conversa em texto
        const conversaTexto = messages
            .reverse()
            .map((m) => {
            const role = m.is_from_customer ? "LEAD" : "BOT";
            return `[${role}]: ${m.message}`;
        })
            .join("\n");
        // Chamar Haiku para resumir
        const response = await anthropic.messages.create({
            model: MEMORY_MODEL,
            max_tokens: 300,
            system: `Você é um assistente que resume conversas de WhatsApp de uma clínica de regeneração capilar.
Extraia as informações essenciais em um JSON compacto. Seja MUITO conciso.

Responda APENAS com JSON, sem backticks, sem markdown:
{
  "summary": "Resumo em 1-2 frases do estado da conversa e o que o lead quer",
  "nome": "Nome do lead ou null",
  "regiao": "entradas|topo|coroa|difuso|null (região da queda capilar mencionada)",
  "objecoes": ["lista de objeções levantadas, ex: preço, dúvida se funciona"],
  "stage_hint": "cético|interessado|pronto|desistiu|null"
}`,
            messages: [
                {
                    role: "user",
                    content: `Resuma esta conversa:\n\n${conversaTexto}`,
                },
            ],
        });
        const text = response.content
            .filter((b) => b.type === "text")
            .map((b) => b.text)
            .join("");
        const cleaned = text.replace(/```json?|```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        const memory = {
            summary: String(parsed.summary || "").substring(0, MAX_SUMMARY_LENGTH),
            nome: parsed.nome || null,
            regiao: parsed.regiao || null,
            objecoes: Array.isArray(parsed.objecoes) ? parsed.objecoes : [],
            stage_hint: parsed.stage_hint || null,
            ultima_atualizacao: new Date().toISOString(),
            versao: 1,
        };
        // Salvar no lead
        await saveMemoryToLead(tenantId, phone, memory);
        // Atualizar cooldown cache
        recentSummaryCache.set(cacheKey, { timestamp: Date.now() });
        logger.info("[Memory] 🧠 Resumo gerado", {
            phone: phone.slice(-4),
            summary: memory.summary.substring(0, 50) + "...",
            regiao: memory.regiao,
            objecoes: memory.objecoes.length,
            stage: memory.stage_hint,
        });
        return memory;
    }
    catch (error) {
        logger.error("[Memory] Erro ao gerar resumo", error);
        return null;
    }
}
// ============================================
// SALVAR MEMÓRIA NO LEAD
// ============================================
async function saveMemoryToLead(tenantId, phone, memory) {
    try {
        // Buscar lead
        const leads = await supabaseService.request("GET", "leads", {
            query: `tenant_id=eq.${tenantId}&phone=eq.${phone}&limit=1`,
        });
        if (!leads || leads.length === 0) {
            logger.warn("[Memory] Lead não encontrado", { phone: phone.slice(-4) });
            return;
        }
        const lead = leads[0];
        const currentFields = lead.custom_fields || {};
        // Merge com fields existentes
        const updatedFields = {
            ...currentFields,
            memory: memory,
        };
        // Atualizar nome do lead se ainda não tem
        const updates = {
            custom_fields: updatedFields,
            updated_at: new Date().toISOString(),
        };
        if (memory.nome && !lead.name) {
            updates.name = memory.nome;
        }
        await supabaseService.request("PATCH", "leads", {
            query: `id=eq.${lead.id}&tenant_id=eq.${tenantId}`,
            body: updates,
        });
        logger.info("[Memory] 💾 Memória salva no lead", { leadId: lead.id, phone: phone.slice(-4) });
    }
    catch (error) {
        logger.error("[Memory] Erro ao salvar no lead", error);
    }
}
// ============================================
// CARREGAR MEMÓRIA DO LEAD
// ============================================
export async function getLeadMemory(tenantId, leadId) {
    try {
        const memories = await supabaseService.request("GET", "lead_memories", {
            query: `tenant_id=eq.${tenantId}&lead_id=eq.${leadId}&order=created_at.desc&limit=20`,
        });
        if (!memories || memories.length === 0) {
            const leads = await supabaseService.request("GET", "leads", {
                query: `tenant_id=eq.${tenantId}&id=eq.${leadId}&limit=1`,
            });
            if (!leads || leads.length === 0)
                return null;
            const memory = leads[0]?.custom_fields?.memory;
            if (!memory || !memory.summary)
                return null;
            return memory;
        }
        const facts = memories.filter((m) => m.type === "fact").map((m) => m.content);
        const objections = memories.filter((m) => m.type === "objection").map((m) => m.content);
        const preferences = memories.filter((m) => m.type === "preference").map((m) => m.content);
        return {
            facts,
            objections,
            preferences,
            total: memories.length,
            last_updated: memories[0]?.created_at,
        };
    }
    catch (error) {
        logger.error("[Memory] Erro ao carregar memoria", error);
        return null;
    }
}
// ============================================
// FORMATAR MEMÓRIA PARA INJEÇÃO NO CONTEXTO
// ============================================
export function formatMemoryForContext(memory) {
    let ctx = `\n📝 MEMÓRIA DO LEAD (conversa anterior):`;
    ctx += `\n- Resumo: ${memory.summary}`;
    if (memory.nome)
        ctx += `\n- Nome: ${memory.nome}`;
    if (memory.regiao)
        ctx += `\n- Região afetada: ${memory.regiao}`;
    if (memory.objecoes.length > 0)
        ctx += `\n- Objeções: ${memory.objecoes.join(", ")}`;
    if (memory.stage_hint)
        ctx += `\n- Estágio: ${memory.stage_hint}`;
    ctx += `\nUse essas informações para continuar a conversa naturalmente, sem repetir perguntas já respondidas.`;
    return ctx;
}
// ============================================
// PIPELINE: Verificar + Gerar + Retornar contexto
// ============================================
export async function processMemoryPipeline(tenantId, phone) {
    try {
        // 1. Verificar se precisa gerar novo resumo
        const needsSummary = await shouldGenerateMemory(tenantId, phone);
        if (needsSummary) {
            await generateMemorySummary(tenantId, phone);
        }
        // 2. Carregar memória (nova ou existente)
        // Resolver leadId a partir do phone
        let pipelineLeadId = phone;
        try {
            const pLeads = await supabaseService.request("GET", "leads", {
                query: `tenant_id=eq.${tenantId}&phone=eq.${phone}&limit=1`,
            });
            if (pLeads?.[0]?.id)
                pipelineLeadId = pLeads[0].id;
        }
        catch { }
        const memory = await getLeadMemory(tenantId, pipelineLeadId);
        if (!memory)
            return "";
        // 3. Formatar para injeção
        return formatMemoryForContext(memory);
    }
    catch (error) {
        logger.error("[Memory] Pipeline error", error);
        return "";
    }
}
//# sourceMappingURL=memory.service.js.map