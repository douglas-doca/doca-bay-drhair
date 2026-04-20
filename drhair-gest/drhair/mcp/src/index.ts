// ============================================
// DOCA-OCTA — MCP Server (Dr. Hair — GestIA)
// V2.1.0 — Streamable HTTP
// 🔧 TOOLS: 57 tools organizadas por domínio
// Bay GestIA: lojas que usam Gest ERP
// Porta: 3103
// ============================================

import "./instrumentation.js";
import "dotenv/config";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, IncomingMessage, ServerResponse } from "http";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { logger } from "./utils/logger.js";
import { wahaService } from "./services/waha.service.js";
import { aiService } from "./services/ai.service.js";
import { analysisService } from "./services/analysis.service.js";
import { emotionService } from "./services/emotion.service.js";
import { supabaseService } from "./services/supabase.service.js";
import { clientService } from "./services/client.service.js";
import { getLeadMemory, generateMemorySummary, processMemoryPipeline } from "./services/memory.service.js";

// ── GestIA Client ──
import { GestiaClient } from "./services/gestia-client.js";

const GESTIA_BASE_URL = process.env.GESTIA_BASE_URL || "https://api-drhair.gestiaerp.com.br";
const GESTIA_JWK_PATH = process.env.GESTIA_JWK_PATH || "/app/keys/private.jwk.json";
const GESTIA_USER_ID = Number(process.env.GESTIA_USER_ID) || 53;

const gestiaClient = new GestiaClient({
  baseUrl: GESTIA_BASE_URL,
  privateJwkPath: GESTIA_JWK_PATH,
  userId: GESTIA_USER_ID,
});

// ============================================
// Server Configuration
// ============================================

const SERVER_NAME = "bay-drhair-gest";
const SERVER_VERSION = "2.1.0";

logger.separator("Bay Dr. Hair GestIA (Streamable HTTP)");
logger.info(`Starting ${SERVER_NAME} v${SERVER_VERSION}`);

function getCurrentTenant(): string {
  return process.env.TENANT_ID || "61985a43-dcdc-4dc5-9c74-a3015b996100";
}

// ============================================
// TOOLS DEFINITION — 57 tools
// ============================================

const TOOLS = [
  // ── LEADS (7 tools) ──
  {
    name: "buscar_lead",
    description: "Busca um lead pelo telefone ou ID. Retorna nome, estágio, dados e histórico resumido.",
    inputSchema: { type: "object", properties: { tenant_id: { type: "string", description: "ID do tenant" }, telefone: { type: "string", description: "Telefone do lead (ex: 5531999999999)" }, lead_id: { type: "string", description: "ID do lead (alternativa ao telefone)" } }, required: [] as string[] },
  },
  {
    name: "criar_lead",
    description: "Cria um novo lead no sistema com nome, telefone e dados iniciais.",
    inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, nome: { type: "string" }, telefone: { type: "string" }, email: { type: "string" }, origem: { type: "string" }, notas: { type: "string" } }, required: ["telefone"] },
  },
  {
    name: "atualizar_lead",
    description: "Atualiza dados de um lead existente (nome, estágio, notas, etc).",
    inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, lead_id: { type: "string" }, telefone: { type: "string" }, nome: { type: "string" }, status: { type: "string" }, notas: { type: "string" }, lead_stage: { type: "string" } }, required: [] as string[] },
  },
  {
    name: "listar_leads",
    description: "Lista leads do tenant, opcionalmente filtrados por status.",
    inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, status: { type: "string" }, limit: { type: "number" } }, required: [] as string[] },
  },
  {
    name: "perfil_lead_completo",
    description: "Retorna perfil completo do lead: dados, memórias, emoções, histórico e health score.",
    inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, lead_id: { type: "string" }, telefone: { type: "string" } }, required: [] as string[] },
  },
  // ── CONVERSAS (5 tools) ──
  {
    name: "historico_conversa",
    description: "Retorna o histórico de mensagens de uma conversa com um lead.",
    inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, lead_id: { type: "string" }, telefone: { type: "string" }, limit: { type: "number" } }, required: [] as string[] },
  },
  {
    name: "registrar_mensagem",
    description: "Registra uma mensagem na conversa de um lead.",
    inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, conversation_id: { type: "string" }, role: { type: "string", enum: ["lead", "agent", "system"] }, content: { type: "string" } }, required: ["content"] },
  },
  {
    name: "buscar_contexto",
    description: "Busca o contexto atual de uma conversa (resumo, estágio, última interação).",
    inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, telefone: { type: "string" }, lead_id: { type: "string" } }, required: [] as string[] },
  },
  {
    name: "conversas_pendentes",
    description: "Lista conversas que estão esperando resposta.",
    inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, limit: { type: "number" } }, required: [] as string[] },
  },
  {
    name: "buscar_conversa_lead",
    description: "Busca a conversa ativa de um lead específico pelo telefone.",
    inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, telefone: { type: "string" } }, required: [] as string[] },
  },
  // ── MEMÓRIA (3 tools) ──
  {
    name: "buscar_memorias",
    description: "Busca memórias salvas de um lead.",
    inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, lead_id: { type: "string" }, telefone: { type: "string" } }, required: [] as string[] },
  },
  {
    name: "salvar_memoria",
    description: "Salva uma memória sobre o lead.",
    inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, lead_id: { type: "string" }, telefone: { type: "string" }, tipo: { type: "string", enum: ["fato", "objection", "commitment", "preference", "context"] }, conteudo: { type: "string" } }, required: ["conteudo"] },
  },
  {
    name: "melhor_estrategia",
    description: "Analisa o perfil do lead e sugere a melhor estratégia de abordagem.",
    inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, lead_id: { type: "string" }, telefone: { type: "string" } }, required: [] as string[] },
  },
  // ── EMOÇÃO (4 tools) ──
  {
    name: "analisar_sentimento",
    description: "Analisa o sentimento de uma mensagem do lead.",
    inputSchema: { type: "object", properties: { message: { type: "string" }, lead_id: { type: "string" } }, required: ["message"] },
  },
  {
    name: "registrar_emocao",
    description: "Registra um evento emocional do lead.",
    inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, lead_id: { type: "string" }, emotion: { type: "string" }, trigger: { type: "string" }, intensity: { type: "number" } }, required: ["lead_id", "emotion"] },
  },
  {
    name: "tendencia_emocional",
    description: "Retorna a tendência emocional do lead ao longo do tempo.",
    inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, lead_id: { type: "string" } }, required: ["lead_id"] },
  },
  {
    name: "sugerir_abordagem",
    description: "Sugere a melhor abordagem emocional para o lead.",
    inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, lead_id: { type: "string" } }, required: ["lead_id"] },
  },
  // ── CONHECIMENTO, TEMPLATES, PROVAS (3 tools) ──
  {
    name: "buscar_conhecimento",
    description: "Busca na base de conhecimento da clínica.",
    inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "listar_templates",
    description: "Lista templates de mensagens disponíveis.",
    inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, categoria: { type: "string" } }, required: [] as string[] },
  },
  {
    name: "buscar_provas_sociais",
    description: "Busca fotos de antes/depois e depoimentos para prova social.",
    inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, regiao: { type: "string" }, limit: { type: "number" } }, required: [] as string[] },
  },

  // ══════════════════════════════════════════════════════════════
  //  GESTIA — AGENDA (8 tools)
  // ══════════════════════════════════════════════════════════════
  {
    name: "gestia_combos_cadastro",
    description: "Retorna TUDO que precisa pra agendar: profissionais com grade ativa, salas, procedimentos, situações e cores. Chamar no início da conversa pra saber o que oferecer ao lead. Requer unitId.",
    inputSchema: { type: "object", properties: { unitId: { type: "number", description: "ID da unidade no Gest" } }, required: ["unitId"] },
  },
  {
    name: "gestia_consultar_agenda",
    description: "Consulta horários já agendados num período. Útil pra ver disponibilidade. Retorna lista de agendamentos com profissional, sala, cliente, situação.",
    inputSchema: { type: "object", properties: { unitId: { type: "number", description: "ID da unidade" }, dataInicio: { type: "string", description: "Data início YYYY-MM-DD" }, dataFim: { type: "string", description: "Data fim YYYY-MM-DD" } }, required: ["unitId", "dataInicio", "dataFim"] },
  },
  {
    name: "gestia_agendar",
    description: "Cria um agendamento no Gest. Usa idDoCliente (existente) OU idDoProspect (lead novo). A API valida grade do profissional e conflitos.",
    inputSchema: {
      type: "object",
      properties: {
        unitId: { type: "number", description: "ID da unidade" },
        data: { type: "string", description: "Data YYYY-MM-DD" },
        horaInicial: { type: "string", description: "Hora início HH:MM" },
        horaFinal: { type: "string", description: "Hora fim HH:MM" },
        idDoProfissional: { type: "number", description: "ID do profissional" },
        idDoCliente: { type: "number", description: "ID do cliente (se já existir)" },
        idDoProspect: { type: "number", description: "ID do prospect (lead novo)" },
        idDoProcedimento: { type: "number", description: "ID do procedimento" },
        idDaSala: { type: "number", description: "ID da sala (opcional)" },
        observacao: { type: "string", description: "Observação (origem do lead, contexto da conversa)" },
      },
      required: ["unitId", "data", "horaInicial", "horaFinal", "idDoProfissional", "idDoProcedimento"],
    },
  },
  {
    name: "gestia_alterar_situacao_agenda",
    description: "Altera situação de um agendamento (ex: Marcado→Confirmado). Situações: 1=Marcado, 2=Confirmado, 3=Aguardando, 4=Em atendimento, 5=Atendido.",
    inputSchema: { type: "object", properties: { unitId: { type: "number" }, idAgendamento: { type: "number" }, idSituacao: { type: "number" } }, required: ["unitId", "idAgendamento", "idSituacao"] },
  },
  {
    name: "gestia_excluir_agendamento",
    description: "Exclui um agendamento pelo ID.",
    inputSchema: { type: "object", properties: { unitId: { type: "number" }, idAgendamento: { type: "number" } }, required: ["unitId", "idAgendamento"] },
  },
  {
    name: "gestia_agenda_por_cliente",
    description: "Consulta agendamentos de um cliente específico.",
    inputSchema: { type: "object", properties: { unitId: { type: "number" }, idDoCliente: { type: "number" } }, required: ["unitId", "idDoCliente"] },
  },
  {
    name: "gestia_agenda_por_prospect",
    description: "Consulta agendamentos de um prospect (lead).",
    inputSchema: { type: "object", properties: { unitId: { type: "number" }, idDoProspect: { type: "number" } }, required: ["unitId", "idDoProspect"] },
  },
  {
    name: "gestia_horarios_funcionamento",
    description: "Retorna horários de funcionamento da unidade (dias da semana, hora abertura/fechamento).",
    inputSchema: { type: "object", properties: { unitId: { type: "number" } }, required: ["unitId"] },
  },

  // ══════════════════════════════════════════════════════════════
  //  GESTIA — PROSPECT / LEAD (2 tools)
  // ══════════════════════════════════════════════════════════════
  {
    name: "gestia_criar_prospect",
    description: "Cria um lead novo (prospect) no Gest. Retorna o ID do prospect criado. Telefone: ddd (number) + numero (string sem DDD).",
    inputSchema: {
      type: "object",
      properties: {
        unitId: { type: "number" },
        nomeCompleto: { type: "string", description: "Nome completo do lead" },
        ddd: { type: "number", description: "DDD do celular (ex: 31)" },
        numero: { type: "string", description: "Número sem DDD (ex: 999990000)" },
        email: { type: "string", description: "Email (opcional)" },
      },
      required: ["unitId", "nomeCompleto", "ddd", "numero"],
    },
  },
  {
    name: "gestia_listar_prospects",
    description: "Lista prospects (leads) da unidade.",
    inputSchema: { type: "object", properties: { unitId: { type: "number" }, pageSize: { type: "number", description: "Quantidade (default 10)" } }, required: ["unitId"] },
  },

  // ══════════════════════════════════════════════════════════════
  //  GESTIA — CLIENTE (2 tools)
  // ══════════════════════════════════════════════════════════════
  {
    name: "gestia_buscar_clientes",
    description: "Busca clientes da unidade. Útil pra verificar se lead já é paciente antes de criar prospect.",
    inputSchema: { type: "object", properties: { unitId: { type: "number" }, pageSize: { type: "number" } }, required: ["unitId"] },
  },
  {
    name: "gestia_buscar_cliente_fast",
    description: "Busca rápida de clientes (endpoint otimizado).",
    inputSchema: { type: "object", properties: { unitId: { type: "number" } }, required: ["unitId"] },
  },

  // ══════════════════════════════════════════════════════════════
  //  GESTIA — PROFISSIONAIS / SALAS / PROCEDIMENTOS (3 tools)
  // ══════════════════════════════════════════════════════════════
  {
    name: "gestia_listar_profissionais",
    description: "Lista profissionais da unidade.",
    inputSchema: { type: "object", properties: { unitId: { type: "number" } }, required: ["unitId"] },
  },
  {
    name: "gestia_listar_salas",
    description: "Lista salas da unidade.",
    inputSchema: { type: "object", properties: { unitId: { type: "number" } }, required: ["unitId"] },
  },
  {
    name: "gestia_listar_procedimentos",
    description: "Lista procedimentos disponíveis.",
    inputSchema: { type: "object", properties: { unitId: { type: "number" }, pageSize: { type: "number" } }, required: ["unitId"] },
  },

  // ══════════════════════════════════════════════════════════════
  //  GESTIA — ATENDIMENTO (4 tools)
  // ══════════════════════════════════════════════════════════════
  {
    name: "gestia_atendimentos_em_andamento",
    description: "Lista atendimentos em andamento na unidade. Retorna cliente, profissional, valor, comanda.",
    inputSchema: { type: "object", properties: { unitId: { type: "number" } }, required: ["unitId"] },
  },
  {
    name: "gestia_listar_atendimentos",
    description: "Lista atendimentos da unidade com paginação.",
    inputSchema: { type: "object", properties: { unitId: { type: "number" }, pageSize: { type: "number" } }, required: ["unitId"] },
  },
  {
    name: "gestia_historico_atendimento",
    description: "Histórico de um atendimento específico (log de ações).",
    inputSchema: { type: "object", properties: { unitId: { type: "number" }, idAtendimento: { type: "number" } }, required: ["unitId", "idAtendimento"] },
  },
  {
    name: "gestia_imagens_atendimento",
    description: "Retorna metadados das imagens de tricoscopia de um atendimento.",
    inputSchema: { type: "object", properties: { unitId: { type: "number" }, idAtendimento: { type: "number" } }, required: ["unitId", "idAtendimento"] },
  },

  // ══════════════════════════════════════════════════════════════
  //  GESTIA — COMANDA (3 tools)
  // ══════════════════════════════════════════════════════════════
  {
    name: "gestia_procedimentos_comanda",
    description: "Lista procedimentos de uma comanda (tratamento do paciente).",
    inputSchema: { type: "object", properties: { unitId: { type: "number" }, idComanda: { type: "number" } }, required: ["unitId", "idComanda"] },
  },
  {
    name: "gestia_historico_comanda",
    description: "Histórico de uma comanda (log de ações).",
    inputSchema: { type: "object", properties: { unitId: { type: "number" }, idComanda: { type: "number" } }, required: ["unitId", "idComanda"] },
  },
  {
    name: "gestia_parcelas_comanda",
    description: "Lista parcelas de pagamento de uma comanda.",
    inputSchema: { type: "object", properties: { unitId: { type: "number" }, idComanda: { type: "number" } }, required: ["unitId", "idComanda"] },
  },

  // ══════════════════════════════════════════════════════════════
  //  GESTIA — UNIDADES (1 tool)
  // ══════════════════════════════════════════════════════════════
  {
    name: "gestia_listar_unidades",
    description: "Lista todas as unidades da rede Dr. Hair com endereço, CNPJ, horários.",
    inputSchema: { type: "object", properties: { unitId: { type: "number", description: "ID de qualquer unidade (pra auth)" } }, required: ["unitId"] },
  },

  // ── WAHA (5 tools) ──
  {
    name: "waha_send_message",
    description: "Envia uma mensagem de texto via WhatsApp usando WAHA",
    inputSchema: { type: "object", properties: { phone: { type: "string" }, message: { type: "string" } }, required: ["phone", "message"] },
  },
  {
    name: "waha_send_image",
    description: "Envia uma imagem via WhatsApp usando WAHA",
    inputSchema: { type: "object", properties: { phone: { type: "string" }, imageUrl: { type: "string" }, caption: { type: "string" } }, required: ["phone", "imageUrl"] },
  },
  {
    name: "waha_get_messages",
    description: "Obtém histórico de mensagens de um chat",
    inputSchema: { type: "object", properties: { phone: { type: "string" }, limit: { type: "number" } }, required: ["phone"] },
  },
  {
    name: "waha_check_number",
    description: "Verifica se um número existe no WhatsApp",
    inputSchema: { type: "object", properties: { phone: { type: "string" } }, required: ["phone"] },
  },
  {
    name: "waha_session_status",
    description: "Verifica o status da sessão WAHA",
    inputSchema: { type: "object", properties: {} },
  },
  // ── AI (4 tools) ──
  {
    name: "ai_generate_response",
    description: "Gera uma resposta usando IA para uma mensagem do cliente",
    inputSchema: { type: "object", properties: { userMessage: { type: "string" }, leadName: { type: "string" }, context: { type: "string" }, tone: { type: "string", enum: ["formal", "casual", "professional"] } }, required: ["userMessage"] },
  },
  {
    name: "ai_analyze_intent",
    description: "Analisa a intenção de uma mensagem",
    inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] },
  },
  {
    name: "ai_analyze_sentiment",
    description: "Analisa o sentimento de uma mensagem",
    inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] },
  },
  {
    name: "ai_qualify_lead",
    description: "Qualifica um lead baseado no histórico de conversa",
    inputSchema: { type: "object", properties: { conversation: { type: "array", items: { type: "object", properties: { role: { type: "string" }, content: { type: "string" } } } } }, required: ["conversation"] },
  },
  // ── ANALYSIS (4 tools) ──
  {
    name: "analysis_get_stalled_conversations",
    description: "Lista conversas paradas para sugerir follow-ups",
    inputSchema: { type: "object", properties: { min_minutes: { type: "number" }, limit: { type: "number" }, status: { type: "string", enum: ["open", "closed"] } }, required: [] as string[] },
  },
  {
    name: "analysis_get_summary",
    description: "Resumo geral da aba de análise",
    inputSchema: { type: "object", properties: { range: { type: "string", enum: ["today", "7d", "30d"] } }, required: [] as string[] },
  },
  {
    name: "analysis_run_followup",
    description: "Roda IA em uma conversa e sugere follow-up",
    inputSchema: { type: "object", properties: { conversation_id: { type: "string" }, mode: { type: "string", enum: ["followup", "insights"] }, language: { type: "string" } }, required: ["conversation_id"] },
  },
  {
    name: "analysis_approve_send_followup",
    description: "Aprova e envia o follow-up pelo WhatsApp",
    inputSchema: { type: "object", properties: { conversation_id: { type: "string" }, text: { type: "string" }, followup_id: { type: "string" }, phone: { type: "string" } }, required: ["conversation_id", "text"] },
  },
  // ── EMOTION DASHBOARD (4 tools) ──
  {
    name: "emotion_get_dashboard_metrics",
    description: "Métricas gerais: total leads, média health, distribuições",
    inputSchema: { type: "object", properties: {}, required: [] as string[] },
  },
  {
    name: "emotion_get_sentiment_matrix",
    description: "Matriz sentimento x intenção para dashboard",
    inputSchema: { type: "object", properties: {}, required: [] as string[] },
  },
  {
    name: "emotion_get_emotional_funnel",
    description: "Funil emocional (stages + contagens)",
    inputSchema: { type: "object", properties: {}, required: [] as string[] },
  },
  {
    name: "emotion_get_lead_health",
    description: "Health score + estágio emocional de um lead",
    inputSchema: { type: "object", properties: { lead_id: { type: "string" } }, required: ["lead_id"] },
  },
  // ── UTILIDADE (1 tool) ──
  {
    name: "get_current_time",
    description: "Retorna a data e hora atual no fuso horário de São Paulo",
    inputSchema: { type: "object", properties: {} },
  },
];

// ============================================
// Resources
// ============================================

const RESOURCES = [
  { uri: "doca://config/server", name: "Server Configuration", description: "Configurações atuais do servidor MCP", mimeType: "application/json" },
  { uri: "doca://config/ai", name: "AI Configuration", description: "Configurações do serviço de IA", mimeType: "application/json" },
  { uri: "doca://status/waha", name: "WAHA Status", description: "Status atual da sessão WAHA", mimeType: "application/json" },
];

// ============================================
// GESTIA TOOL HANDLER (generic dispatcher)
// ============================================

async function handleGestiaTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const unitId = args.unitId as number;
  if (!unitId) return { ok: false, error: "unitId obrigatório" };

  switch (name) {
    // ── AGENDA ──
    case "gestia_combos_cadastro": {
      const rawCombos = await gestiaClient.fetch(`/agenda/combosparacadastro?idDaUnidade=${unitId}`, { unitId });
      // Filtrar retorno pra reduzir tokens
      try {
        const d = (rawCombos as any)?.data || rawCombos;
        const slim: Record<string, unknown> = {};
        if (d.profissionais) {
          slim.profissionais = d.profissionais.map((p: any) => ({
            id: p.id,
            nome: p.nomeCompleto || p.nome,
            horarios: (p.horariosParaAgenda || []).map((h: any) => ({
              dia: h.diaDaSemana?.descricao,
              inicio: h.horaInicial,
              fim: h.horaFinal,
            })),
          }));
        }
        if (d.procedimentos) {
          slim.procedimentos = d.procedimentos.map((p: any) => ({
            id: p.id,
            nome: p.nome || p.descricao,
          }));
        }
        if (d.salas) {
          slim.salas = d.salas.map((s: any) => ({
            id: s.id,
            nome: s.nome,
          }));
        }
        if (d.situacoes) {
          slim.situacoes = d.situacoes.map((s: any) => ({
            id: s.id,
            descricao: s.descricao,
          }));
        }
        return { ok: true, data: slim };
      } catch {}
      return rawCombos;
    }

    case "gestia_consultar_agenda": {
      const rawAgenda = await gestiaClient.fetch(`/agenda/consultarhorariosagendados?dataInicio=${args.dataInicio}&dataFim=${args.dataFim}`, { unitId });
      // Filtrar retorno pra reduzir tokens (API retorna objetos gigantes)
      try {
        const items = (rawAgenda as any)?.data?.dadosDeHorarioAgendado || (rawAgenda as any)?.data || [];
        if (Array.isArray(items)) {
          const slim = items.map((a: any) => ({
            id: a.id,
            data: a.data?.split("T")[0],
            horaInicial: a.horaInicial,
            horaFinal: a.horaFinal,
            profissional: a.profissional?.nomeCompleto || a.profissional?.nome || "N/A",
            profissionalId: a.profissional?.id || a.idDoProfissional,
            cliente: a.cliente?.nomeCompleto || a.prospect?.nomeCompleto || "N/A",
            situacao: a.situacao?.descricao || "N/A",
            sala: a.sala?.nome || null,
            procedimento: a.procedimento?.nome || null,
          }));
          return { ok: true, data: slim, total: slim.length, dataInicio: args.dataInicio, dataFim: args.dataFim };
        }
      } catch {}
      return rawAgenda;
    }

    case "gestia_agendar": {
      if (!args.idDoCliente && !args.idDoProspect) return { ok: false, error: "Informe idDoCliente ou idDoProspect" };
      const body: Record<string, unknown> = {
        idDaUnidade: unitId,
        data: `${args.data}T00:00:00`,
        horaInicial: args.horaInicial,
        horaFinal: args.horaFinal,
        idDoProfissional: args.idDoProfissional,
        idDoProcedimento: args.idDoProcedimento,
      };
      if (args.idDoCliente) body.idDoCliente = args.idDoCliente;
      if (args.idDoProspect) body.idDoProspect = args.idDoProspect;
      if (args.idDaSala) body.idDaSala = args.idDaSala;
      if (args.observacao) body.observacao = args.observacao;
      return gestiaClient.fetch("/agenda/inserir", { method: "POST", body, unitId });
    }

    case "gestia_alterar_situacao_agenda":
      return gestiaClient.fetch("/agenda/alterarsituacao", {
        method: "PUT",
        body: { id: args.idAgendamento, situacao: { id: args.idSituacao } },
        unitId,
      });

    case "gestia_excluir_agendamento":
      return gestiaClient.fetch(`/agenda/${args.idAgendamento}`, { method: "DELETE", unitId });

    case "gestia_agenda_por_cliente":
      return gestiaClient.fetch(`/agenda/horariosagendadosporcliente?idDoCliente=${args.idDoCliente}`, { unitId });

    case "gestia_agenda_por_prospect":
      return gestiaClient.fetch(`/agenda/horariosagendadosporprospect?idDoProspect=${args.idDoProspect}`, { unitId });

    case "gestia_horarios_funcionamento":
      return gestiaClient.fetch("/agenda/unidade", { unitId });

    // ── PROSPECT ──
    case "gestia_criar_prospect": {
      const prospectBody: Record<string, unknown> = {
        nomeCompleto: args.nomeCompleto,
        celular: { ddd: args.ddd, numero: args.numero, pais: "+55" },
      };
      if (args.email) prospectBody.email = args.email;
      return gestiaClient.fetch("/prospect", { method: "POST", body: prospectBody, unitId });
    }

    case "gestia_listar_prospects":
      return gestiaClient.fetch(`/prospect?pageSize=${(args.pageSize as number) || 10}`, { unitId });

    // ── CLIENTE ──
    case "gestia_buscar_clientes":
      return gestiaClient.fetch(`/cliente?pageSize=${(args.pageSize as number) || 10}`, { unitId });

    case "gestia_buscar_cliente_fast":
      return gestiaClient.fetch("/cliente/fast", { unitId });

    // ── PROFISSIONAIS / SALAS / PROCEDIMENTOS ──
    case "gestia_listar_profissionais":
      return gestiaClient.fetch("/profissional", { unitId });

    case "gestia_listar_salas":
      return gestiaClient.fetch("/sala", { unitId });

    case "gestia_listar_procedimentos":
      return gestiaClient.fetch(`/procedimento?pageSize=${(args.pageSize as number) || 20}`, { unitId });

    // ── ATENDIMENTO ──
    case "gestia_atendimentos_em_andamento":
      return gestiaClient.fetch("/atendimento/emandamento", { unitId });

    case "gestia_listar_atendimentos":
      return gestiaClient.fetch(`/atendimento?pageSize=${(args.pageSize as number) || 10}`, { unitId });

    case "gestia_historico_atendimento":
      return gestiaClient.fetch(`/atendimento/${args.idAtendimento}/historico`, { unitId });

    case "gestia_imagens_atendimento":
      return gestiaClient.fetch(`/atendimento/${args.idAtendimento}/imagens`, { unitId });

    // ── COMANDA ──
    case "gestia_procedimentos_comanda":
      return gestiaClient.fetch(`/comanda/${args.idComanda}/procedimentos`, { unitId });

    case "gestia_historico_comanda":
      return gestiaClient.fetch(`/comanda/${args.idComanda}/historico`, { unitId });

    case "gestia_parcelas_comanda":
      return gestiaClient.fetch(`/comanda/${args.idComanda}/parcelas`, { unitId });

    // ── UNIDADES ──
    case "gestia_listar_unidades":
      return gestiaClient.fetch("/unidade", { unitId });

    default:
      return { ok: false, error: `GestIA tool desconhecida: ${name}` };
  }
}

// ============================================
// TOOL HANDLERS
// ============================================

async function handleToolCall(name: string, args: Record<string, unknown>) {
  logger.mcp(`Tool called: ${name}`, args);
  const tenantId = (args.tenant_id as string) || getCurrentTenant();

  try {
    let result: unknown;

    // ── GestIA tools — dispatch to dedicated handler ──
    if (name.startsWith("gestia_")) {
      result = await handleGestiaTool(name, args);
      logger.mcp(`Tool ${name} completed successfully`);
      return { content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result, null, 2) }] };
    }

    switch (name) {
      case "buscar_lead": {
        if (args.lead_id) { result = await supabaseService.getLeadById(tenantId, args.lead_id as string); }
        else if (args.telefone) { result = await supabaseService.getLeadByPhone(tenantId, args.telefone as string); }
        else { result = { error: "Informe telefone ou lead_id" }; }
        break;
      }
      case "criar_lead": {
        result = await supabaseService.createLead({ tenant_id: tenantId, phone: args.telefone as string, name: (args.nome as string) || undefined, email: (args.email as string) || undefined, source: (args.origem as string) || "whatsapp", customFields: args.notas ? { notas: args.notas } : {} } as any);
        break;
      }
      case "atualizar_lead": {
        const leadId = args.lead_id as string;
        if (!leadId && args.telefone) {
          const lead = await supabaseService.getLeadByPhone(tenantId, args.telefone as string);
          if (lead) { const updates: any = {}; if (args.nome) updates.name = args.nome; if (args.status) updates.status = args.status; if (args.notas) updates.notes = args.notas; if (args.lead_stage) updates.lead_stage = args.lead_stage; result = await supabaseService.updateLead(tenantId, lead.id, updates); }
          else { result = { error: "Lead não encontrado" }; }
        } else if (leadId) { const updates: any = {}; if (args.nome) updates.name = args.nome; if (args.status) updates.status = args.status; if (args.notas) updates.notes = args.notas; if (args.lead_stage) updates.lead_stage = args.lead_stage; result = await supabaseService.updateLead(tenantId, leadId, updates); }
        else { result = { error: "Informe lead_id ou telefone" }; }
        break;
      }
      case "listar_leads": { result = await supabaseService.getLeads(tenantId, args.status as string | undefined, (args.limit as number) || 20); break; }
      case "perfil_lead_completo": {
        let lead: any = null;
        if (args.lead_id) { lead = await supabaseService.getLeadById(tenantId, args.lead_id as string); }
        else if (args.telefone) { lead = await supabaseService.getLeadByPhone(tenantId, args.telefone as string); }
        if (!lead) { result = { error: "Lead não encontrado" }; break; }
        const [memories, health, conv] = await Promise.all([
          getLeadMemory(tenantId, lead.id).catch((): null => null),
          emotionService.getLeadHealth(tenantId, lead.id).catch((): null => null),
          supabaseService.getConversationByPhone(tenantId, lead.phone).catch((): null => null),
        ]);
        let recentMessages: any[] = [];
        if (conv) { recentMessages = await supabaseService.getRecentMessages(tenantId, conv.id, 5).catch((): any[] => []); }
        result = { lead, memories, health_score: health, conversa_ativa: conv ? { id: conv.id, status: conv.status, updated_at: conv.updatedAt } : null, ultimas_mensagens: recentMessages };
        break;
      }
      case "historico_conversa": {
        let conv: any = null;
        if (args.telefone) { conv = await supabaseService.getConversationByPhone(tenantId, args.telefone as string); }
        else if (args.lead_id) { const lead = await supabaseService.getLeadById(tenantId, args.lead_id as string); if (lead) conv = await supabaseService.getConversationByPhone(tenantId, lead.phone); }
        if (!conv) { result = { error: "Conversa não encontrada" }; break; }
        result = await supabaseService.getMessagesByConversation(tenantId, conv.id, (args.limit as number) || 20);
        break;
      }
      case "registrar_mensagem": {
        const convId = args.conversation_id as string;
        if (!convId) { result = { error: "conversation_id obrigatório" }; break; }
        result = await supabaseService.addMessage(convId, { role: ((args.role as string) || "assistant") as "user" | "assistant" | "system", content: args.content as string, timestamp: new Date(), tenant_id: tenantId } as any);
        break;
      }
      case "buscar_contexto": {
        let conv: any = null;
        if (args.telefone) { conv = await supabaseService.getConversationByPhone(tenantId, args.telefone as string); }
        else if (args.lead_id) { const lead = await supabaseService.getLeadById(tenantId, args.lead_id as string); if (lead) conv = await supabaseService.getConversationByPhone(tenantId, lead.phone); }
        if (!conv) { result = { error: "Conversa não encontrada" }; break; }
        const msgs = await supabaseService.getRecentMessages(tenantId, conv.id, 5);
        result = { conversation: { id: conv.id, status: conv.status, context: conv.context }, recent_messages: msgs };
        break;
      }
      case "conversas_pendentes": {
        const limit = (args.limit as number) || 20;
        result = await supabaseService.getConversationsByStatus(tenantId, "open" as any);
        if (Array.isArray(result)) result = (result as any[]).slice(0, limit);
        break;
      }
      case "buscar_conversa_lead": {
        if (!args.telefone) { result = { error: "telefone obrigatório" }; break; }
        result = await supabaseService.getConversationByPhone(tenantId, args.telefone as string);
        break;
      }
      case "buscar_memorias": {
        let leadId = args.lead_id as string;
        if (!leadId && args.telefone) { const lead = await supabaseService.getLeadByPhone(tenantId, args.telefone as string); leadId = lead?.id || ""; }
        if (!leadId) { result = { error: "Lead não encontrado" }; break; }
        result = await getLeadMemory(tenantId, leadId);
        break;
      }
      case "salvar_memoria": {
        let leadId = args.lead_id as string;
        if (!leadId && args.telefone) { const lead = await supabaseService.getLeadByPhone(tenantId, args.telefone as string); leadId = lead?.id || ""; }
        if (!leadId) { result = { error: "Lead não encontrado" }; break; }
        const memoryData = { tenant_id: tenantId, lead_id: leadId, type: (args.tipo as string) || "context", content: args.conteudo as string, created_at: new Date().toISOString() };
        await supabaseService.request("POST", "lead_memories", { body: memoryData });
        result = { success: true, message: "Memória salva", ...memoryData };
        break;
      }
      case "melhor_estrategia": {
        let leadId = args.lead_id as string;
        if (!leadId && args.telefone) { const lead = await supabaseService.getLeadByPhone(tenantId, args.telefone as string); leadId = lead?.id || ""; }
        if (!leadId) { result = { error: "Lead não encontrado" }; break; }
        const [mems, hlth] = await Promise.all([ getLeadMemory(tenantId, leadId).catch((): null => null), emotionService.getLeadHealth(tenantId, leadId).catch((): null => null) ]);
        const objections = Array.isArray(mems) ? mems.filter((m: any) => m.type === "objection") : [];
        const commitments = Array.isArray(mems) ? mems.filter((m: any) => m.type === "commitment") : [];
        result = { lead_id: leadId, health_score: hlth, objections_conhecidas: objections.map((o: any) => o.content), compromissos: commitments.map((c: any) => c.content), sugestao: objections.length > 0 ? "Lead tem objeções registradas. Aborde com empatia." : commitments.length > 0 ? "Lead tem compromissos anteriores. Faça referência a eles." : "Sem histórico relevante. Use abordagem padrão." };
        break;
      }
      case "analisar_sentimento": { result = await aiService.analyzeSentiment(args.message as string); break; }
      case "registrar_emocao": {
        await emotionService.saveEmotionEvent(tenantId, { lead_id: args.lead_id as string, emotion: args.emotion, intensity: (args.intensity as number) || 0.5, source: "agent", message_content: (args.trigger as string) || "conversation" } as any);
        result = { success: true, message: "Emoção registrada" };
        break;
      }
      case "tendencia_emocional": {
        const leadHealth = await emotionService.getLeadHealth(tenantId, args.lead_id as string);
        if (!leadHealth) { result = { error: "Sem dados emocionais para este lead" }; break; }
        result = { lead_id: args.lead_id, health_score: leadHealth.health_score, temperature: leadHealth.temperature, urgency_level: leadHealth.urgency_level, trend: leadHealth.health_score >= 70 ? "positiva" : leadHealth.health_score >= 40 ? "neutra" : "negativa", friction_points: leadHealth.friction_points, positive_signals: leadHealth.positive_signals };
        break;
      }
      case "sugerir_abordagem": {
        const lHealth = await emotionService.getLeadHealth(tenantId, args.lead_id as string);
        if (!lHealth) { result = { sugestao: "Sem dados emocionais. Use abordagem neutra e acolhedora." }; break; }
        const score = lHealth.health_score ?? 50;
        let sugestao: string;
        if (score >= 70) { sugestao = "Lead positivo. Aproveite o momento para avançar no funil."; }
        else if (score >= 40) { sugestao = "Lead neutro. Crie conexão antes de empurrar CTA."; }
        else { sugestao = "Lead frustrado ou negativo. Acolha, valide a emoção, NÃO force venda."; }
        result = { lead_id: args.lead_id, health_score: score, urgency: lHealth.urgency_level, sugestao };
        break;
      }
      case "buscar_conhecimento": {
        const query = args.query as string;
        try {
          const kbResults = await supabaseService.request<any[]>("GET", "knowledge_base", { query: `tenant_id=eq.${tenantId}&active=eq.true&or=(question.ilike.*${encodeURIComponent(query)}*,answer.ilike.*${encodeURIComponent(query)}*,keywords.cs.{${encodeURIComponent(query)}})&order=priority.desc&limit=5` });
          result = kbResults && kbResults.length > 0 ? kbResults.map((kb: any) => ({ id: kb.id, category: kb.category, question: kb.question, answer: kb.answer })) : { message: "Nenhum resultado encontrado", query };
        } catch { result = { error: "Erro ao buscar na base de conhecimento" }; }
        break;
      }
      case "listar_templates": { result = await supabaseService.getAllTemplates(tenantId); break; }
      case "buscar_provas_sociais": {
        try {
          let q = `tenant_id=eq.${tenantId}&active=eq.true&order=priority.desc&limit=${(args.limit as number) || 3}`;
          if (args.regiao) { q += `&tags=cs.{${encodeURIComponent(args.regiao as string)}}`; }
          const proofs = await supabaseService.request<any[]>("GET", "social_proof_assets", { query: q });
          result = proofs && proofs.length > 0 ? proofs.map((p: any) => ({ id: p.id, title: p.title, tags: p.tags, suggested_text: p.suggested_text, result: p.result, has_before_after: !!(p.image_before && p.image_after), uso: `Use na resposta: [PROVA_SOCIAL:${p.id}]` })) : { message: "Nenhuma prova social encontrada" };
        } catch { result = { error: "Erro ao buscar provas sociais" }; }
        break;
      }
      case "waha_send_message": result = await wahaService.sendMessage({ chatId: args.phone as string, text: args.message as string }); break;
      case "waha_send_image": result = await wahaService.sendImage(args.phone as string, args.imageUrl as string, args.caption as string | undefined); break;
      case "waha_get_messages": result = await wahaService.getMessages(args.phone as string, (args.limit as number) || 50); break;
      case "waha_check_number": result = await wahaService.checkNumber(args.phone as string); break;
      case "waha_session_status": result = (wahaService as any).getSessionStatus ? await (wahaService as any).getSessionStatus() : { status: "unknown" }; break;
      case "ai_generate_response": result = await aiService.generateResponse(args.userMessage as string, { leadName: args.leadName as string | undefined, businessInfo: args.context as string | undefined, tone: args.tone as "formal" | "casual" | "professional" | undefined }); break;
      case "ai_analyze_intent": result = await aiService.analyzeIntent(args.message as string); break;
      case "ai_analyze_sentiment": result = await aiService.analyzeSentiment(args.message as string); break;
      case "ai_qualify_lead": result = await aiService.qualifyLead(args.conversation as Array<{ role: "user" | "assistant"; content: string }>); break;
      case "analysis_get_stalled_conversations": result = await analysisService.getStalledConversations({ tenantId, min_minutes: (args.min_minutes as number) ?? 240, limit: (args.limit as number) ?? 20, status: (args.status as "open" | "closed") ?? "open" }); break;
      case "analysis_get_summary": result = await analysisService.getSummary({ tenantId, range: (args.range as "today" | "7d" | "30d") ?? "today" }); break;
      case "analysis_run_followup": result = await analysisService.runAnalysis({ tenantId, conversation_id: args.conversation_id as string, mode: (args.mode as "followup" | "insights") ?? "followup", language: (args.language as string) ?? "pt-BR" }); break;
      case "analysis_approve_send_followup": result = await analysisService.approveAndSend({ tenantId, conversation_id: args.conversation_id as string, text: args.text as string, followup_id: (args.followup_id as string) || undefined, phone: (args.phone as string) || undefined }); break;
      case "emotion_get_dashboard_metrics": result = await emotionService.getDashboardMetrics(tenantId); break;
      case "emotion_get_sentiment_matrix": result = await emotionService.getSentimentMatrix(tenantId); break;
      case "emotion_get_emotional_funnel": result = await emotionService.getEmotionalFunnel(tenantId); break;
      case "emotion_get_lead_health": result = await emotionService.getLeadHealth(tenantId, args.lead_id as string); break;
      case "get_current_time": result = { timestamp: new Date().toISOString(), formatted: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), timezone: "America/Sao_Paulo" }; break;
      default: throw new Error(`Unknown tool: ${name}`);
    }

    logger.mcp(`Tool ${name} completed successfully`);
    return { content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result, null, 2) }] };
  } catch (error) {
    logger.error(`Tool ${name} failed`, error);
    return { content: [{ type: "text", text: JSON.stringify({ error: true, message: error instanceof Error ? error.message : "Unknown error", tool: name }) }], isError: true };
  }
}

// ============================================
// Resources Handler
// ============================================

async function handleReadResource(uri: string) {
  logger.mcp(`Read resource: ${uri}`);
  let content: string;
  switch (uri) {
    case "doca://config/server": content = JSON.stringify({ name: SERVER_NAME, version: SERVER_VERSION, timestamp: new Date().toISOString(), tools_count: TOOLS.length }, null, 2); break;
    case "doca://config/ai": content = JSON.stringify(aiService.getConfig(), null, 2); break;
    case "doca://status/waha":
      try { const status = (wahaService as any).getSessionStatus ? await (wahaService as any).getSessionStatus() : { status: "unknown" }; content = JSON.stringify(status, null, 2); }
      catch { content = JSON.stringify({ error: "WAHA not available" }); }
      break;
    default: throw new Error(`Unknown resource: ${uri}`);
  }
  return { contents: [{ uri, mimeType: "application/json", text: content }] };
}

// ============================================
// MCP Server Factory
// ============================================

function createMcpServer(): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {}, resources: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.mcp("List tools requested");
    return { tools: TOOLS };
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    logger.mcp("List resources requested");
    return { resources: RESOURCES };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    return handleReadResource(request.params.uri);
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return handleToolCall(name, (args || {}) as Record<string, unknown>);
  });

  return server;
}

// ============================================
// HTTP + Streamable HTTP Server
// ============================================

async function handleStreamableHttp(req: IncomingMessage, res: ServerResponse) {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = createMcpServer();
  await server.connect(transport);
  await transport.handleRequest(req, res);
}

async function main() {
  try {
    try {
      if (typeof (supabaseService as any).initialize === "function") {
        await (supabaseService as any).initialize();
      }
    } catch { logger.warn("Supabase initialize skipped/failed (continuing)..."); }

    const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3103;

    const httpServer = createServer(async (req, res) => {
      try {
        if (req.url?.startsWith("/mcp") && req.method === "POST") { await handleStreamableHttp(req, res); return; }
        if (req.url === "/health") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok", transport: "streamable-http", tools: TOOLS.length, version: SERVER_VERSION, erp: "gestia" }));
          return;
        }
        if (req.url?.startsWith("/sse") || (req.url?.startsWith("/message") && req.method === "POST")) {
          res.writeHead(410);
          res.end(JSON.stringify({ error: "SSE deprecated. Use POST /mcp" }));
          return;
        }
        res.writeHead(404); res.end("Not found");
      } catch (error) {
        logger.error("HTTP server error", error);
        if (!res.headersSent) res.writeHead(500);
        res.end("Internal server error");
      }
    });

    httpServer.listen(PORT, "0.0.0.0", () => {
      logger.info(`${SERVER_NAME} v${SERVER_VERSION} (Streamable HTTP) rodando na porta ${PORT} 🚀`);
      logger.info(`Endpoint: POST /mcp`);
      logger.info(`Tools available: ${TOOLS.length}`);
      logger.info(`GestIA Base URL: ${GESTIA_BASE_URL}`);
      console.error("📁 Clientes disponíveis:", clientService.listClients());
      logger.separator();
    });
  } catch (error) {
    logger.error("Failed to start server", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => { logger.info("Shutting down..."); process.exit(0); });
process.on("SIGTERM", () => { logger.info("Shutting down..."); process.exit(0); });

main();