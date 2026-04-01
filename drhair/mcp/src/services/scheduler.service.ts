// ============================================
// Scheduler Service V9 - MULTI-FRANQUIA
// ✅ Sem hardcode de "drhair-contagem"
// ✅ Resolve scheduler URL do tenant (Supabase ou config)
// ✅ Rotas /api/:franquia/horarios no novo doca-scheduler
// ✅ Cache Supabase + fallback scraper
// ✅ Reserva via agendamentos (Supabase)
// ✅ Identificação automática de sala
// ============================================

import { logger } from "../utils/logger.js";
import { clientService } from "./client.service.js";
import { supabaseService } from "./supabase.service.js";

// ============================================
// INTERFACES
// ============================================

interface SalaInfo {
  nome: string;
  profissional: string;
  horarios: string[];
}

interface HorariosResponse {
  success: boolean;
  data?: string;
  horarios?: string[];
  salas?: Record<string, SalaInfo>;
  total?: number;
  error?: string;
  fromCache?: boolean;
}

interface AgendarResponse {
  success: boolean;
  agendamentoId?: string;
  reservaId?: string;
  status?: string;
  message?: string;
  error?: string;
  salaId?: string;
  salaNome?: string;
}

interface SchedulingIntent {
  isScheduling: boolean;
  wantsToKnowHorarios: boolean;
  data: string | null;
  dataOriginal: string | null;
  horarioMencionado: string | null;
  periodoPreferido: 'manha' | 'tarde' | 'noite' | null;
  confirmando: boolean;
}

interface DadosAgendamento {
  telefone: string;
  data: string;
  horario: string;
  nome?: string;
  dataNascimento?: string;
  leadId?: string;
  salaId?: string;
  salaNome?: string;
}

// ============================================
// CACHE EM MEMÓRIA PARA SALAS
// ============================================

interface CacheSalas {
  data: string;
  salas: Record<string, SalaInfo>;
  timestamp: number;
}

const salasCache: Map<string, CacheSalas> = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

// ============================================
// SCHEDULER URL RESOLUTION
// Prioridade:
// 1. config local do client (client.service)
// 2. tabela tenants no Supabase (scheduler_url)
// 3. fallback padrão: http://doca-scheduler:3001
// ============================================

const DEFAULT_SCHEDULER_URL = "http://doca-scheduler:3001";

// ============================================
// SCHEDULER SERVICE
// ============================================

class SchedulerService {

  // ============================================
  // RESOLUÇÃO DE CONFIG
  // ============================================

  hasSchedulerTool(clientId: string): boolean {
    const config = clientService.getClientConfig(clientId);
    if (!config) return false;
    const tools = (config as any).tools || [];
    return tools.includes('agendamento') || tools.includes('scheduler');
  }

  /**
   * Resolve a URL do scheduler para um tenant.
   * 1. Config local do client
   * 2. Supabase tenants.scheduler_url
   * 3. Fallback: http://doca-scheduler:3001
   */
  async resolveSchedulerUrl(clientId: string, tenantId?: string): Promise<string> {
    // 1. Config local
    const config = clientService.getClientConfig(clientId);
    const localUrl = (config as any)?.scheduler_url;
    if (localUrl) return localUrl;

    // 2. Supabase
    if (tenantId) {
      try {
        const result = await supabaseService.request("GET", "tenants", {
          query: `id=eq.${tenantId}&select=scheduler_url`
        });
        const url = (result as any)?.[0]?.scheduler_url;
        if (url) return url;
      } catch {}
    }

    // 3. Fallback
    return DEFAULT_SCHEDULER_URL;
  }

  /**
   * Resolve o franquia slug a partir do clientId.
   * Usado nas rotas /api/:franquia/ do novo scheduler.
   */
  resolveFranquiaSlug(clientId: string): string {
    // O clientId geralmente JÁ é o slug (ex: "drhair-contagem")
    return clientId;
  }

  getTenantId(clientId: string): string | null {
    const config = clientService.getClientConfig(clientId);
    if (!config) return null;
    return (config as any).tenant_id || null;
  }

  getSchedulerAuth(clientId: string): { token?: string; headerName?: string } | null {
    const config = clientService.getClientConfig(clientId);
    if (!config) return null;
    const schedulerAuth = (config as any).scheduler_auth;
    if (schedulerAuth) return schedulerAuth;
    const crm = (config as any).crm;
    if (crm?.api_access_token) return { token: crm.api_access_token, headerName: 'x-api-key' };
    return null;
  }

  // ============================================
  // PARSING DE DATAS
  // ============================================

  parseDataRelativa(texto: string, dataAtual?: Date): string {
    const hoje = dataAtual || new Date();
    const textoLower = texto.toLowerCase().trim()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const diasSemana: Record<string, number> = {
      'domingo': 0, 'dom': 0,
      'segunda': 1, 'seg': 1, 'segunda-feira': 1,
      'terca': 2, 'ter': 2, 'terca-feira': 2,
      'quarta': 3, 'qua': 3, 'quarta-feira': 3,
      'quinta': 4, 'qui': 4, 'quinta-feira': 4,
      'sexta': 5, 'sex': 5, 'sexta-feira': 5,
      'sabado': 6, 'sab': 6,
    };

    if (/^(hoje|hj|agora|now)$/i.test(textoLower)) return this.formatDateISO(hoje);

    if (/^(amanha|amanh)$/i.test(textoLower)) {
      const d = new Date(hoje); d.setDate(d.getDate() + 1); return this.formatDateISO(d);
    }

    if (/depois\s*de\s*amanh/i.test(textoLower)) {
      const d = new Date(hoje); d.setDate(d.getDate() + 2); return this.formatDateISO(d);
    }

    if (/semana\s*que\s*vem|proxima\s*semana|prox\s*semana/i.test(textoLower)) {
      const d = new Date(hoje);
      const diasAteSegunda = (8 - hoje.getDay()) % 7 || 7;
      d.setDate(d.getDate() + diasAteSegunda);
      return this.formatDateISO(d);
    }

    for (const [nome, numeroDia] of Object.entries(diasSemana)) {
      if (textoLower.includes(nome)) {
        let dias = numeroDia - hoje.getDay();
        if (dias <= 0) dias += 7;
        const d = new Date(hoje); d.setDate(hoje.getDate() + dias);
        return this.formatDateISO(d);
      }
    }

    const matchData = textoLower.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
    if (matchData) {
      const dia = parseInt(matchData[1]);
      const mes = parseInt(matchData[2]) - 1;
      let ano = matchData[3] ? parseInt(matchData[3]) : hoje.getFullYear();
      if (ano < 100) ano += 2000;
      return this.formatDateISO(new Date(ano, mes, dia));
    }

    return this.formatDateISO(hoje);
  }

  private formatDateISO(date: Date): string {
    const a = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${a}-${m}-${d}`;
  }

  private formatDateBR(dataISO: string): string {
    const [a, m, d] = dataISO.split('-');
    return `${d}/${m}/${a}`;
  }

  // ============================================
  // DETECTAR INTENÇÃO
  // ============================================

  detectSchedulingIntent(message: string): SchedulingIntent {
    const msg = (message || "").toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const padroesAgendamento = [
      /\b(agendar|marcar|reservar|horario|vaga|atendimento)\b/,
      /\b(quer|quero|gostaria|preciso|posso).*(agendar|marcar|horario)/,
      /\b(disponivel|livre|tem vaga|tem horario)\b/,
      /\b(quinta|sexta|terca|quarta|segunda|sabado|domingo)\b/,
      /\b(pode ser|ta bom|fechado|combinado|confirma|confirmo)\b/,
      /\b(hoje|hj|amanha)\b/,
    ];
    const padroesHorarios = [
      /\b(quais|qual|que)\s*(horarios|horas)\b/,
      /\b(horarios)\s*(disponiveis|livres|tem)\b/,
      /\b(tem)\s*(horario|vaga)\b/,
      /\b(disponibilidade|agenda)\b/,
    ];
    const padroesConfirmacao = [
      /\b(pode ser|ta bom|ta otimo|fechado|combinado|perfeito|beleza|blz|ok|sim|confirma|confirmo|esse|esse mesmo|esse horario)\b/,
      /\b(quero esse|quero as|marco as|agenda as)\b/,
    ];

    const isScheduling = padroesAgendamento.some(p => p.test(msg)) ||
                         padroesHorarios.some(p => p.test(msg)) ||
                         padroesConfirmacao.some(p => p.test(msg));
    const wantsToKnowHorarios = padroesHorarios.some(p => p.test(msg));
    const confirmando = padroesConfirmacao.some(p => p.test(msg));

    let periodoPreferido: 'manha' | 'tarde' | 'noite' | null = null;
    if (/\b(manha|manhã|cedo|9|10|11)\s*(h|hrs|horas)?\b/.test(msg)) periodoPreferido = 'manha';
    else if (/\b(tarde|13|14|15|16|17)\s*(h|hrs|horas)?\b/.test(msg)) periodoPreferido = 'tarde';
    else if (/\b(noite|18|19|20)\s*(h|hrs|horas)?\b/.test(msg)) periodoPreferido = 'noite';

    let dataOriginal: string | null = null;
    let data: string | null = null;

    const diasMatch = msg.match(/\b(hoje|hj|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|semana que vem|proxima semana)\b/i);
    if (diasMatch) { dataOriginal = diasMatch[0]; data = this.parseDataRelativa(diasMatch[0]); }

    const dataMatch = msg.match(/\b(\d{1,2})[\/\-](\d{1,2})\b/);
    if (dataMatch) { dataOriginal = dataMatch[0]; data = this.parseDataRelativa(dataMatch[0]); }

    let horarioMencionado: string | null = null;
    const hm = msg.match(/\b(\d{1,2})[:\s]?(\d{2})?\s*(h|hrs|horas)?\b/);
    if (hm) horarioMencionado = `${hm[1].padStart(2, '0')}:${hm[2] || '00'}`;

    return { isScheduling, wantsToKnowHorarios, data, dataOriginal, horarioMencionado, periodoPreferido, confirmando };
  }

  // ============================================
  // CONSULTAR HORÁRIOS
  // ============================================

  async consultarHorarios(
    clientId: string,
    data: string,
    tenantId?: string
  ): Promise<HorariosResponse> {
    const resolvedTenantId = tenantId || this.getTenantId(clientId);

    let dataISO = data;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) dataISO = this.parseDataRelativa(data);

    try {
      logger.info("Consultando horários", { clientId, tenantId: resolvedTenantId, data: dataISO }, "SCHEDULER");

      // 1. Cache Supabase
      if (resolvedTenantId) {
        const cacheResult = await this.consultarCache(resolvedTenantId, dataISO);
        if (cacheResult && cacheResult.horarios && cacheResult.horarios.length > 0) {
          logger.info("✅ Horários do CACHE", { total: cacheResult.horarios.length }, "SCHEDULER");
          if (cacheResult.salas) this.salvarSalasEmMemoria(resolvedTenantId, dataISO, cacheResult.salas);
          return { success: true, data: dataISO, horarios: cacheResult.horarios, salas: cacheResult.salas, total: cacheResult.horarios.length, fromCache: true };
        }
      }

      // 2. Fallback: novo scheduler HTTP
      const scraperResult = await this.consultarScheduler(clientId, dataISO, resolvedTenantId);

      if (scraperResult.success && scraperResult.horarios && resolvedTenantId) {
        const bloqueados = await this.getHorariosBloqueados(resolvedTenantId, dataISO);
        scraperResult.horarios = scraperResult.horarios.filter(h => !bloqueados.includes(h));
        scraperResult.total = scraperResult.horarios.length;
        if (scraperResult.salas) this.salvarSalasEmMemoria(resolvedTenantId, dataISO, scraperResult.salas);
      }

      return scraperResult;

    } catch (error: any) {
      logger.error("Falha ao consultar horários", { clientId, error: error.message }, "SCHEDULER");
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // CONSULTAR SCHEDULER HTTP (novo multi-franquia)
  // ============================================

  private async consultarScheduler(
    clientId: string,
    dataISO: string,
    tenantId?: string
  ): Promise<HorariosResponse> {
    const baseUrl = await this.resolveSchedulerUrl(clientId, tenantId);
    const franquia = this.resolveFranquiaSlug(clientId);
    const dataBR = this.formatDateBR(dataISO);

    // Novo endpoint: /api/:franquia/horarios?data=DD/MM/YYYY
    // Compatibilidade: /api/horarios?data=DD/MM/YYYY (mapeia pra drhair-contagem)
    const fullUrl = `${baseUrl}/api/${franquia}/horarios?data=${encodeURIComponent(dataBR)}`;

    try {
      logger.info("Chamando scheduler", { clientId, franquia, url: fullUrl }, "SCHEDULER");

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const auth = this.getSchedulerAuth(clientId);
      if (auth?.token && auth?.headerName) headers[auth.headerName] = auth.token;

      const response = await fetch(fullUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(90000)
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error("Scheduler API error", { status: response.status, body: errorText }, "SCHEDULER");
        return { success: false, error: `API retornou ${response.status}: ${errorText}` };
      }

      const result = await response.json() as any;

      if (result.success) {
        logger.info("✅ Horários do scheduler", { total: result.total, franquia }, "SCHEDULER");
        return {
          success: true,
          data: dataISO,
          horarios: result.horarios,
          salas: result.salas,
          total: result.total,
          fromCache: false
        };
      }

      return { success: false, error: result.error || "Erro desconhecido" };

    } catch (error: any) {
      logger.error("Falha no scheduler", { clientId, franquia, error: error.message }, "SCHEDULER");
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // SALAS EM MEMÓRIA
  // ============================================

  private salvarSalasEmMemoria(tenantId: string, dataISO: string, salas: Record<string, SalaInfo>): void {
    salasCache.set(`${tenantId}:${dataISO}`, { data: dataISO, salas, timestamp: Date.now() });
  }

  private recuperarSalasDeMemoria(tenantId: string, dataISO: string): Record<string, SalaInfo> | null {
    const cached = salasCache.get(`${tenantId}:${dataISO}`);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) { salasCache.delete(`${tenantId}:${dataISO}`); return null; }
    return cached.salas;
  }

  async encontrarSalaPorHorario(
    clientId: string, dataISO: string, horario: string, tenantId?: string
  ): Promise<{ salaId: string; nome: string; profissional: string } | null> {
    const tid = tenantId || this.getTenantId(clientId);
    if (!tid) return null;

    // 1. Memória local
    const salas = this.recuperarSalasDeMemoria(tid, dataISO);
    if (salas) {
      for (const [salaId, info] of Object.entries(salas)) {
        if (info.horarios?.includes(horario)) return { salaId, nome: info.nome, profissional: info.profissional };
      }
    }

    // 2. Cache Supabase
    try {
      const result = await supabaseService.request("GET", "horarios_cache", {
        query: `tenant_id=eq.${tid}&data=eq.${dataISO}&order=consultado_em.desc&limit=1`
      });
      const cache = (result as any)?.[0];
      if (cache?.salas) {
        for (const [salaId, info] of Object.entries(cache.salas as Record<string, SalaInfo>)) {
          if (info.horarios?.includes(horario)) return { salaId, nome: info.nome, profissional: info.profissional };
        }
      }
    } catch {}

    return null;
  }

  // ============================================
  // CACHE SUPABASE
  // ============================================

  private async consultarCache(tenantId: string, dataISO: string): Promise<{ horarios: string[]; salas: Record<string, SalaInfo> } | null> {
    try {
      const result = await supabaseService.request("GET", "horarios_cache", {
        query: `tenant_id=eq.${tenantId}&data=eq.${dataISO}&order=consultado_em.desc&limit=1`
      });
      const cache = (result as any)?.[0];
      if (!cache) return null;

      const diffMin = (Date.now() - new Date(cache.consultado_em).getTime()) / 60000;
      if (diffMin > 30) return null;

      const bloqueados = await this.getHorariosBloqueados(tenantId, dataISO);
      const horarios = (cache.horarios_disponiveis || []).filter((h: string) => !bloqueados.includes(h));

      return { horarios, salas: cache.salas || {} };
    } catch {
      return null;
    }
  }

  // ============================================
  // HORÁRIOS BLOQUEADOS (agendamentos existentes)
  // ============================================

  async getHorariosBloqueados(tenantId: string, dataISO: string): Promise<string[]> {
    try {
      const result = await supabaseService.request("GET", "agendamentos", {
        query: `tenant_id=eq.${tenantId}&data=eq.${dataISO}&status=neq.cancelado&select=horario`
      });
      return ((result as any) || []).map((r: any) => {
        const h = r.horario;
        if (h?.includes(':')) { const [hr, min] = h.split(':'); return `${hr.padStart(2, '0')}:${min.padStart(2, '0')}`; }
        return h;
      });
    } catch {
      return [];
    }
  }

  // ============================================
  // CRIAR AGENDAMENTO
  // ============================================

  async criarAgendamento(
    clientId: string,
    dados: DadosAgendamento,
    tenantId?: string
  ): Promise<AgendarResponse> {
    const tid = tenantId || this.getTenantId(clientId);
    if (!tid) return { success: false, error: "Tenant não identificado" };

    try {
      logger.info("Criando agendamento", { clientId, tenantId: tid, dados }, "SCHEDULER");

      let dataISO = dados.data;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.data)) dataISO = this.parseDataRelativa(dados.data);

      // Parse data nascimento
      let dataNascISO: string | null = null;
      if (dados.dataNascimento) {
        const match = dados.dataNascimento.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
        if (match) {
          const dia = match[1].padStart(2, '0');
          const mes = match[2].padStart(2, '0');
          let ano = match[3]; if (ano.length === 2) ano = `19${ano}`;
          dataNascISO = `${ano}-${mes}-${dia}`;
        }
      }

      // Identificar sala
      let salaId = dados.salaId;
      let salaNome = dados.salaNome;
      if (!salaId) {
        const sala = await this.encontrarSalaPorHorario(clientId, dataISO, dados.horario, tid);
        if (sala) { salaId = sala.salaId; salaNome = sala.nome; }
      }

      // INSERT no Supabase
      const result = await supabaseService.request("POST", "agendamentos", {
        body: {
          tenant_id: tid,
          client_id: clientId,
          telefone: dados.telefone,
          data: dataISO,
          horario: dados.horario,
          nome: dados.nome || null,
          data_nascimento: dataNascISO,
          lead_id: dados.leadId || null,
          sala_id: salaId || null,
          sala_nome: salaNome || null,
          status: dados.nome ? 'aguardando_crm' : 'pendente',
          confirmado_em: dados.nome && dataNascISO ? new Date().toISOString() : null,
          contexto_conversa: {
            created_via: 'ai_agent',
            timestamp: new Date().toISOString(),
            sala_identificada: !!salaId
          }
        }
      });

      if (result && !(result as any).error) {
        const agendamentoId = Array.isArray(result) ? (result as any)[0]?.id : (result as any)?.id;
        logger.info("✅ Agendamento criado", { agendamentoId, salaId, salaNome }, "SCHEDULER");
        return {
          success: true,
          agendamentoId,
          salaId,
          salaNome,
          status: dados.nome ? 'aguardando_crm' : 'pendente',
          message: `Agendamento criado${salaNome ? ` (${salaNome})` : ''}`
        };
      }

      return { success: false, error: (result as any)?.error || "Erro desconhecido" };

    } catch (error: any) {
      if (error.message?.includes('unique') || error.code === '23505') {
        return { success: true, message: "Agendamento já existe (duplicate key). Horário reservado!", duplicate: true } as any;
      }
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // ATUALIZAR AGENDAMENTO
  // ============================================

  async atualizarAgendamento(
    telefone: string, data: string, horario: string,
    dados: { nome?: string; dataNascimento?: string }
  ): Promise<AgendarResponse> {
    try {
      let dataISO = data;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) dataISO = this.parseDataRelativa(data);

      let dataNascISO: string | null = null;
      if (dados.dataNascimento) {
        const match = dados.dataNascimento.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
        if (match) {
          const dia = match[1].padStart(2, '0');
          const mes = match[2].padStart(2, '0');
          let ano = match[3]; if (ano.length === 2) ano = `19${ano}`;
          dataNascISO = `${ano}-${mes}-${dia}`;
        }
      }

      const updates: Record<string, any> = {};
      if (dados.nome) updates.nome = dados.nome;
      if (dataNascISO) updates.data_nascimento = dataNascISO;
      if (dados.nome && dataNascISO) {
        updates.status = 'confirmado';
        updates.confirmado_em = new Date().toISOString();
      }

      await supabaseService.request("PATCH", "agendamentos", {
        query: `telefone=eq.${telefone}&data=eq.${dataISO}&horario=eq.${horario}`,
        body: updates
      });

      return { success: true, status: updates.status || 'pendente' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // FORMATAR PARA PROMPT
  // ============================================

  formatHorariosParaPrompt(
    horarios: string[],
    data: string,
    periodoSolicitado?: 'manha' | 'tarde' | 'noite' | null,
    salas?: Record<string, SalaInfo>
  ): string {
    const dataFormatada = this.formatarDataExibicao(data);

    if (!horarios || horarios.length === 0) {
      return `\n---\n## ⚠️ SEM HORÁRIOS DISPONÍVEIS\n\n**Data:** ${dataFormatada}\n\n### 🚨 INSTRUÇÕES:\n1. **NÃO INVENTE horários**\n2. Informe que não tem vaga\n3. Pergunte se quer outro dia\n\n**Responda:**\n"Poxa, para ${dataFormatada} não tenho mais horário 😕 Quer que eu veja outro dia?"\n`;
    }

    let filtrados = horarios;
    let periodoTexto = "";

    if (periodoSolicitado) {
      filtrados = this.filtrarPorPeriodo(horarios, periodoSolicitado);
      periodoTexto = periodoSolicitado === 'manha' ? 'de manhã' : periodoSolicitado === 'tarde' ? 'à tarde' : 'à noite';
    }

    const sugestoes = this.selecionarSugestoes(filtrados, 3);

    let salasInfo = "";
    if (salas && Object.keys(salas).length > 1) {
      salasInfo = `\n**Profissionais disponíveis:** ${Object.values(salas).map(s => s.profissional).join(', ')}`;
    }

    return `\n---\n## 📅 HORÁRIOS - ${dataFormatada.toUpperCase()}${periodoTexto ? ` (${periodoTexto})` : ''}\n${salasInfo}\n\n**HORÁRIOS DISPONÍVEIS:**\n${filtrados.join(', ')}\n\n**Total:** ${filtrados.length} vagas\n\n### 🚨 REGRAS:\n1. **USE SOMENTE OS HORÁRIOS ACIMA**\n2. **NUNCA INVENTE**\n3. Ofereça 2-3 opções: ${sugestoes.join(', ')}\n\n---\n### ✅ FLUXO DE COLETA:\n\n1. Cliente escolhe horário\n2. Pergunte: "Show! Qual seu nome completo?"\n3. Pergunte: "E sua data de nascimento?"\n4. SÓ ENTÃO confirme o agendamento\n\n**Se cliente não especificou período:**\n"Prefere de manhã, tarde ou noite?"\n`;
  }

  formatErroConsultaParaPrompt(data: string, erro?: string): string {
    const dataFormatada = this.formatarDataExibicao(data);
    return `\n---\n## ⚠️ SISTEMA INDISPONÍVEL\n\n**Data:** ${dataFormatada}\n${erro ? `**Erro:** ${erro}` : ''}\n\n### 🚨 INSTRUÇÕES:\n1. **NÃO INVENTE HORÁRIOS**\n2. Peça desculpas\n3. Diga que vai verificar\n\n**Responda:**\n"Me dá um minutinho que estou verificando os horários! 😊"\n`;
  }

  // ============================================
  // HELPERS
  // ============================================

  private filtrarPorPeriodo(horarios: string[], periodo: 'manha' | 'tarde' | 'noite'): string[] {
    return horarios.filter(h => {
      const hora = parseInt(h.split(':')[0]);
      if (periodo === 'manha') return hora >= 8 && hora < 12;
      if (periodo === 'tarde') return hora >= 12 && hora < 18;
      return hora >= 18;
    });
  }

  private formatarDataExibicao(data: string): string {
    if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      const [a, m, d] = data.split('-');
      const obj = new Date(parseInt(a), parseInt(m) - 1, parseInt(d));
      const dias = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
      return `${dias[obj.getDay()]}, ${d}/${m}`;
    }
    return data;
  }

  private selecionarSugestoes(horarios: string[], qtd: number): string[] {
    if (horarios.length <= qtd) return horarios;
    const result: string[] = [];
    const step = Math.floor(horarios.length / qtd);
    for (let i = 0; i < qtd && i * step < horarios.length; i++) result.push(horarios[i * step]);
    return result;
  }
}

export const schedulerService = new SchedulerService();
export default schedulerService;
