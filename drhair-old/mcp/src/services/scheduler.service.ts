// src/services/scheduler.service.ts
// ============================================
// Scheduler Service V8 - CORRIGIDO
// ✅ Consulta CACHE primeiro (instantâneo)
// ✅ Aceita tenantId como parâmetro (não depende só do clientService)
// ✅ Fallback para scraper com modo=multi
// ✅ Suporta múltiplas salas (Mikaella + Vanessa)
// ✅ Reserva temporária (bloqueia 15 min)
// ✅ Identifica qual sala tem cada horário
// ✅ Salva agendamento no Supabase
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
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// ============================================
// SCHEDULER SERVICE
// ============================================

class SchedulerService {
  
  // ============================================
  // VERIFICAÇÕES DE CONFIGURAÇÃO
  // ============================================
  
  hasSchedulerTool(clientId: string): boolean {
    const config = clientService.getClientConfig(clientId);
    if (!config) return false;
    const tools = (config as any).tools || [];
    return tools.includes('agendamento') || tools.includes('scheduler');
  }

  getSchedulerUrl(clientId: string): string | null {
    const config = clientService.getClientConfig(clientId);
    if (!config) return null;
    return (config as any).scheduler_url || null;
  }

  // 🔥 AGORA BUSCA DO SUPABASE SE NÃO TIVER NO CONFIG LOCAL
  async getSchedulerUrlFromTenant(tenantId: string): Promise<string | null> {
    try {
      const result = await supabaseService.request("GET", "tenants", {
        query: `id=eq.${tenantId}&select=scheduler_url`
      });
      return (result as any)?.[0]?.scheduler_url || null;
    } catch {
      return null;
    }
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
    if (crm?.api_access_token) {
      return { token: crm.api_access_token, headerName: 'x-api-key' };
    }
    
    return null;
  }

  // ============================================
  // PARSING INTELIGENTE DE DATAS
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

    if (/^(hoje|hj|agora|now)$/i.test(textoLower)) {
      return this.formatDateISO(hoje);
    }

    if (/^(amanha|amanh)$/i.test(textoLower)) {
      const amanha = new Date(hoje);
      amanha.setDate(amanha.getDate() + 1);
      return this.formatDateISO(amanha);
    }

    if (/depois\s*de\s*amanh/i.test(textoLower)) {
      const depois = new Date(hoje);
      depois.setDate(depois.getDate() + 2);
      return this.formatDateISO(depois);
    }

    if (/semana\s*que\s*vem|proxima\s*semana|prox\s*semana/i.test(textoLower)) {
      const proxSemana = new Date(hoje);
      const diasAteSegunda = (8 - hoje.getDay()) % 7 || 7;
      proxSemana.setDate(proxSemana.getDate() + diasAteSegunda);
      return this.formatDateISO(proxSemana);
    }

    for (const [nome, numeroDia] of Object.entries(diasSemana)) {
      if (textoLower.includes(nome)) {
        const diaAtual = hoje.getDay();
        let diasAdicionar = numeroDia - diaAtual;
        if (diasAdicionar <= 0) diasAdicionar += 7;
        
        const dataAlvo = new Date(hoje);
        dataAlvo.setDate(hoje.getDate() + diasAdicionar);
        return this.formatDateISO(dataAlvo);
      }
    }

    const matchData = textoLower.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
    if (matchData) {
      const dia = parseInt(matchData[1]);
      const mes = parseInt(matchData[2]) - 1;
      const ano = matchData[3] ? parseInt(matchData[3]) : hoje.getFullYear();
      const anoCompleto = ano < 100 ? 2000 + ano : ano;
      return this.formatDateISO(new Date(anoCompleto, mes, dia));
    }

    return this.formatDateISO(hoje);
  }

  private formatDateISO(date: Date): string {
    const ano = date.getFullYear();
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const dia = String(date.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }

  private formatDateBR(dataISO: string): string {
    const [ano, mes, dia] = dataISO.split('-');
    return `${dia}/${mes}/${ano}`;
  }

  // ============================================
  // DETECTAR INTENÇÃO DE AGENDAMENTO
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

    const padroesManha = /\b(manha|manhã|cedo|9|10|11)\s*(h|hrs|horas)?\b/;
    const padroesTarde = /\b(tarde|13|14|15|16|17)\s*(h|hrs|horas)?\b/;
    const padroesNoite = /\b(noite|18|19|20)\s*(h|hrs|horas)?\b/;

    const isScheduling = padroesAgendamento.some(p => p.test(msg)) || 
                         padroesHorarios.some(p => p.test(msg)) ||
                         padroesConfirmacao.some(p => p.test(msg));
    
    const wantsToKnowHorarios = padroesHorarios.some(p => p.test(msg));
    const confirmando = padroesConfirmacao.some(p => p.test(msg));

    let periodoPreferido: 'manha' | 'tarde' | 'noite' | null = null;
    if (padroesManha.test(msg)) periodoPreferido = 'manha';
    else if (padroesTarde.test(msg)) periodoPreferido = 'tarde';
    else if (padroesNoite.test(msg)) periodoPreferido = 'noite';

    let dataOriginal: string | null = null;
    let data: string | null = null;
    
    const diasMatch = msg.match(/\b(hoje|hj|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|semana que vem|proxima semana)\b/i);
    if (diasMatch) {
      dataOriginal = diasMatch[0];
      data = this.parseDataRelativa(diasMatch[0]);
    }

    const dataMatch = msg.match(/\b(\d{1,2})[\/\-](\d{1,2})\b/);
    if (dataMatch) {
      dataOriginal = dataMatch[0];
      data = this.parseDataRelativa(dataMatch[0]);
    }

    let horarioMencionado: string | null = null;
    const horarioMatch = msg.match(/\b(\d{1,2})[:\s]?(\d{2})?\s*(h|hrs|horas)?\b/);
    if (horarioMatch) {
      const hora = horarioMatch[1].padStart(2, '0');
      const min = horarioMatch[2] || '00';
      horarioMencionado = `${hora}:${min}`;
    }

    return {
      isScheduling,
      wantsToKnowHorarios,
      data,
      dataOriginal,
      horarioMencionado,
      periodoPreferido,
      confirmando,
    };
  }

  // ============================================
  // 🔥 CONSULTAR HORÁRIOS (COM CACHE + MULTI-SALA)
  // 🔥 CORRIGIDO: Aceita tenantId como parâmetro!
  // ============================================

  async consultarHorarios(
    clientId: string, 
    data: string, 
    tenantId?: string  // 🔥 NOVO PARÂMETRO!
  ): Promise<HorariosResponse> {
    // 🔥 Usar tenantId passado ou tentar pegar do config local
    const resolvedTenantId = tenantId || this.getTenantId(clientId);
    
    // Normalizar data
    let dataISO = data;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      dataISO = this.parseDataRelativa(data);
    }

    try {
      logger.info("Consultando horários", { 
        clientId, 
        tenantId: resolvedTenantId,  // 🔥 Agora mostra o valor correto
        data: dataISO 
      }, "SCHEDULER");
      
      // ========================================
      // 1. TENTAR CACHE SUPABASE PRIMEIRO
      // ========================================
      if (resolvedTenantId) {
        const cacheResult = await this.consultarCache(resolvedTenantId, dataISO);
        
        if (cacheResult && cacheResult.horarios && cacheResult.horarios.length > 0) {
          logger.info("✅ Horários do CACHE", { 
            clientId, 
            data: dataISO, 
            total: cacheResult.horarios.length,
            fromCache: true 
          }, "SCHEDULER");
          
          // Guardar salas em memória para identificar depois
          if (cacheResult.salas) {
            this.salvarSalasEmMemoria(resolvedTenantId, dataISO, cacheResult.salas);
          }
          
          return {
            success: true,
            data: dataISO,
            horarios: cacheResult.horarios,
            salas: cacheResult.salas,
            total: cacheResult.horarios.length,
            fromCache: true
          };
        }
        
        logger.info("Cache vazio ou expirado, indo no scraper...", { clientId, data: dataISO }, "SCHEDULER");
      } else {
        logger.warn("⚠️ TenantId não disponível, pulando cache", { clientId }, "SCHEDULER");
      }
      
      // ========================================
      // 2. FALLBACK: SCRAPER COM MODO MULTI
      // ========================================
      const scraperResult = await this.consultarScraper(clientId, dataISO, resolvedTenantId);
      
      if (scraperResult.success && scraperResult.horarios) {
        // Filtrar horários bloqueados por reservas
        if (resolvedTenantId) {
          const bloqueados = await this.getHorariosBloqueados(resolvedTenantId, dataISO);
          scraperResult.horarios = scraperResult.horarios.filter(h => !bloqueados.includes(h));
          scraperResult.total = scraperResult.horarios.length;
          
          // Guardar salas em memória
          if (scraperResult.salas) {
            this.salvarSalasEmMemoria(resolvedTenantId, dataISO, scraperResult.salas);
          }
        }
        
        return scraperResult;
      }
      
      return scraperResult;
      
    } catch (error: any) {
      logger.error("Falha ao consultar horários", { clientId, data: dataISO, error: error.message }, "SCHEDULER");
      return { success: false, error: error.message };
    }
  }

  // ========================================
  // SALVAR/RECUPERAR SALAS EM MEMÓRIA
  // ========================================

  private salvarSalasEmMemoria(tenantId: string, dataISO: string, salas: Record<string, SalaInfo>): void {
    const key = `${tenantId}:${dataISO}`;
    salasCache.set(key, {
      data: dataISO,
      salas,
      timestamp: Date.now()
    });
  }

  private recuperarSalasDeMemoria(tenantId: string, dataISO: string): Record<string, SalaInfo> | null {
    const key = `${tenantId}:${dataISO}`;
    const cached = salasCache.get(key);
    
    if (!cached) return null;
    
    // Verificar TTL
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
      salasCache.delete(key);
      return null;
    }
    
    return cached.salas;
  }

  // ========================================
  // 🔥 ENCONTRAR SALA POR HORÁRIO
  // ========================================

  async encontrarSalaPorHorario(
    clientId: string, 
    dataISO: string, 
    horario: string,
    tenantId?: string  // 🔥 NOVO PARÂMETRO!
  ): Promise<{ salaId: string; nome: string; profissional: string } | null> {
    const resolvedTenantId = tenantId || this.getTenantId(clientId);
    if (!resolvedTenantId) return null;

    // 1. Tentar memória local primeiro
    const salasMemoria = this.recuperarSalasDeMemoria(resolvedTenantId, dataISO);
    if (salasMemoria) {
      for (const [salaId, salaInfo] of Object.entries(salasMemoria)) {
        if (salaInfo.horarios && salaInfo.horarios.includes(horario)) {
          logger.info(`Sala encontrada (memória): ${salaInfo.nome}`, { horario }, "SCHEDULER");
          return {
            salaId,
            nome: salaInfo.nome,
            profissional: salaInfo.profissional
          };
        }
      }
    }

    // 2. Tentar cache Supabase
    try {
      const result = await supabaseService.request("GET", "horarios_cache", {
        query: `tenant_id=eq.${resolvedTenantId}&data=eq.${dataISO}&order=consultado_em.desc&limit=1`
      });
      
      const cache = (result as any)?.[0];
      if (cache?.salas) {
        for (const [salaId, salaInfo] of Object.entries(cache.salas as Record<string, SalaInfo>)) {
          if (salaInfo.horarios && salaInfo.horarios.includes(horario)) {
            logger.info(`Sala encontrada (Supabase): ${salaInfo.nome}`, { horario }, "SCHEDULER");
            return {
              salaId,
              nome: salaInfo.nome,
              profissional: salaInfo.profissional
            };
          }
        }
      }
    } catch (error) {
      // Ignora erro
    }

    // 3. Não encontrou - retorna primeira sala disponível (fallback)
    logger.warn(`Sala não identificada para horário ${horario}, usando fallback`, {}, "SCHEDULER");
    return null;
  }

  // ========================================
  // CONSULTAR CACHE (Supabase)
  // ========================================
  
  private async consultarCache(tenantId: string, dataISO: string): Promise<{
    horarios: string[];
    salas: Record<string, SalaInfo>;
  } | null> {
    try {
      const result = await supabaseService.request("GET", "horarios_cache", {
        query: `tenant_id=eq.${tenantId}&data=eq.${dataISO}&order=consultado_em.desc&limit=1`
      });
      
      const cache = (result as any)?.[0];
      
      if (!cache) {
        logger.info("Cache não encontrado", { tenantId, dataISO }, "SCHEDULER");
        return null;
      }
      
      // Verificar se cache não está muito antigo (máx 30 min)
      const consultadoEm = new Date(cache.consultado_em);
      const agora = new Date();
      const diffMinutos = (agora.getTime() - consultadoEm.getTime()) / (1000 * 60);
      
      if (diffMinutos > 30) {
        logger.info("Cache expirado", { tenantId, dataISO, diffMinutos }, "SCHEDULER");
        return null;
      }
      
      // Buscar horários bloqueados por reservas
      const bloqueados = await this.getHorariosBloqueados(tenantId, dataISO);
      
      // Filtrar horários disponíveis
      const horariosDisponiveis = (cache.horarios_disponiveis || [])
        .filter((h: string) => !bloqueados.includes(h));
      
      logger.info("Cache encontrado e válido", { 
        tenantId, 
        dataISO, 
        total: horariosDisponiveis.length,
        bloqueados: bloqueados.length 
      }, "SCHEDULER");
      
      return {
        horarios: horariosDisponiveis,
        salas: cache.salas || {}
      };
      
    } catch (error: any) {
      logger.error("Erro ao consultar cache", { tenantId, dataISO, error: error.message }, "SCHEDULER");
      return null;
    }
  }

  // ========================================
  // 🔥 CONSULTAR SCRAPER (MODO MULTI!)
  // ========================================
  
  private async consultarScraper(
    clientId: string, 
    dataISO: string,
    tenantId?: string  // 🔥 NOVO PARÂMETRO para buscar URL do tenant
  ): Promise<HorariosResponse> {
    // Tentar URL do config local primeiro
    let url = this.getSchedulerUrl(clientId);
    
    // 🔥 Se não tiver, buscar do tenant no Supabase
    if (!url && tenantId) {
      url = await this.getSchedulerUrlFromTenant(tenantId);
    }
    
    if (!url) {
      logger.warn("Scheduler URL not configured", { clientId, tenantId }, "SCHEDULER");
      return { success: false, error: "Scheduler não configurado" };
    }

    // Converter para formato BR para o scraper
    const dataBR = this.formatDateBR(dataISO);

    try {
      // 🔥 SEMPRE USAR MODO MULTI-SALA!
      const fullUrl = `${url}/api/horarios?data=${encodeURIComponent(dataBR)}&modo=multi`;
      
      logger.info("Chamando scraper MULTI-SALA", { clientId, data: dataBR, url: fullUrl }, "SCHEDULER");
      
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const auth = this.getSchedulerAuth(clientId);
      if (auth?.token && auth?.headerName) {
        headers[auth.headerName] = auth.token;
      }
      
      const response = await fetch(fullUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(90000)  // 90s timeout (multi-sala pode demorar mais)
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error("Scheduler API error", { status: response.status, body: errorText, clientId }, "SCHEDULER");
        return { success: false, error: `API retornou ${response.status}` };
      }

      const result = await response.json() as any;
      
      if (result.success) {
        logger.info("✅ Horários do scraper MULTI-SALA", { 
          clientId, 
          data: dataISO, 
          total: result.total,
          modo: result.modo || 'multi',
          salas: result.salas ? Object.keys(result.salas).length : 0
        }, "SCHEDULER");
        
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
      logger.error("Falha no scraper", { clientId, data: dataISO, error: error.message }, "SCHEDULER");
      return { success: false, error: error.message };
    }
  }

  // ========================================
  // RESERVAS TEMPORÁRIAS
  // ========================================

  async getHorariosBloqueados(tenantId: string, dataISO: string): Promise<string[]> {
  try {
    // 🔥 BUSCAR DE AGENDAMENTOS (não de reservas_temporarias)
    // Bloqueia todos os horários que NÃO estão cancelados
    const result = await supabaseService.request("GET", "agendamentos", {
      query: `tenant_id=eq.${tenantId}&data=eq.${dataISO}&status=neq.cancelado&select=horario`
    });
    
    const horarios = ((result as any) || []).map((r: any) => {
      // Normalizar formato do horário (pode vir como "14:00:00" do banco)
      const h = r.horario;
      if (h && h.includes(':')) {
        const [hora, min] = h.split(':');
        return `${hora.padStart(2, '0')}:${min.padStart(2, '0')}`;
      }
      return h;
    });
    
    logger.info("Horários bloqueados (agendamentos)", { tenantId, dataISO, total: horarios.length }, "SCHEDULER");
    return horarios;
  } catch (error) {
    logger.error("Erro ao buscar horários bloqueados", { error }, "SCHEDULER");
    return [];
  }
}

  async reservarHorario(params: {
    clientId: string;
    data: string;
    horario: string;
    telefone: string;
    nome?: string;
    salaId?: string;
    tenantId?: string;  // 🔥 NOVO PARÂMETRO!
  }): Promise<AgendarResponse> {
    const resolvedTenantId = params.tenantId || this.getTenantId(params.clientId);
    
    if (!resolvedTenantId) {
      return { success: false, error: "Tenant não identificado" };
    }

    // Normalizar data
    let dataISO = params.data;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(params.data)) {
      dataISO = this.parseDataRelativa(params.data);
    }

    try {
      // Verificar se horário já está bloqueado
      const bloqueados = await this.getHorariosBloqueados(resolvedTenantId, dataISO);
      
      if (bloqueados.includes(params.horario)) {
        return { 
          success: false, 
          error: "Este horário acabou de ser reservado por outra pessoa. Por favor escolha outro." 
        };
      }

      // 🔥 Identificar qual sala tem esse horário
      let salaId = params.salaId;
      let salaNome: string | undefined;
      
      if (!salaId) {
        const salaEncontrada = await this.encontrarSalaPorHorario(
          params.clientId, 
          dataISO, 
          params.horario,
          resolvedTenantId
        );
        if (salaEncontrada) {
          salaId = salaEncontrada.salaId;
          salaNome = salaEncontrada.nome;
          logger.info(`Sala identificada automaticamente: ${salaNome}`, { horario: params.horario }, "SCHEDULER");
        }
      }
      
      // Criar reserva (sem expiração - só libera se cancelar)
      
      const result = await supabaseService.request("POST", "reservas_temporarias", {
        body: {
          tenant_id: resolvedTenantId,
          data: dataISO,
          horario: params.horario,
          telefone: params.telefone,
          nome: params.nome || null,
          sala_id: salaId || null,
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          status: 'ativo'
        }
      });
      
      const reservaId = (result as any)?.[0]?.id;
      
      logger.info("✅ Horário reservado", { 
        tenantId: resolvedTenantId, 
        data: dataISO, 
        horario: params.horario,
        telefone: params.telefone,
        salaId,
        salaNome,
        reservaId 
      }, "SCHEDULER");
      
      return { 
        success: true, 
        reservaId,
        salaId,
        salaNome,
        message: `Horário ${params.horario} reservado${salaNome ? ` (${salaNome})` : ''}`
      };
      
    } catch (error: any) {
      if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
        return { success: false, error: "Horário já reservado por outra pessoa" };
      }
      
      logger.error("Erro ao reservar", { ...params, error: error.message }, "SCHEDULER");
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // CRIAR AGENDAMENTO (Supabase + CRM)
  // ============================================

  async criarAgendamento(
    clientId: string,
    dados: DadosAgendamento,
    tenantId?: string
  ): Promise<AgendarResponse> {
    try {
      // 🔥 Usar tenantId passado ou tentar pegar do config
      const resolvedTenantId = tenantId || this.getTenantId(clientId);

      if (!resolvedTenantId) {
        logger.error("Tenant ID não encontrado", { clientId }, "SCHEDULER");
        return { success: false, error: "Tenant não identificado" };
      }

      logger.info("Criando agendamento", { clientId, tenantId: resolvedTenantId, dados }, "SCHEDULER");

      // Converter data nascimento para ISO
      let dataNascISO: string | null = null;
      if (dados.dataNascimento) {
        const match = dados.dataNascimento.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
        if (match) {
          const dia = match[1].padStart(2, '0');
          const mes = match[2].padStart(2, '0');
          let ano = match[3];
          if (ano.length === 2) ano = `19${ano}`;
          dataNascISO = `${ano}-${mes}-${dia}`;
        }
      }

      // Normalizar data do agendamento
      let dataISO = dados.data;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.data)) {
        dataISO = this.parseDataRelativa(dados.data);
      }

      // 🔥 Identificar sala se não foi fornecida
      let salaId = dados.salaId;
      let salaNome = dados.salaNome;
      
      if (!salaId) {
        const salaEncontrada = await this.encontrarSalaPorHorario(
          clientId, 
          dataISO, 
          dados.horario,
          resolvedTenantId
        );
        if (salaEncontrada) {
          salaId = salaEncontrada.salaId;
          salaNome = salaEncontrada.nome;
        }
      }

      // Inserir no Supabase
      const result = await supabaseService.request("POST", "agendamentos", {
        body: {
          tenant_id: resolvedTenantId,
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
          confirmado_em: dados.nome ? new Date().toISOString() : null,
          contexto_conversa: {
            created_via: 'ai_agent',
            timestamp: new Date().toISOString(),
            sala_identificada: salaId ? true : false
          }
        }
      });

      if (result && !(result as any).error) {
        const agendamentoId = Array.isArray(result) ? (result as any)[0]?.id : (result as any)?.id;
        
        // Confirmar reserva temporária se existir
        await this.confirmarReserva(resolvedTenantId, dados.telefone);
        
        logger.info("✅ Agendamento criado", { 
          agendamentoId, 
          clientId,
          salaId,
          salaNome 
        }, "SCHEDULER");
        
        return {
          success: true,
          agendamentoId,
          salaId,
          salaNome,
          status: dados.nome ? 'aguardando_crm' : 'pendente',
          message: `Agendamento criado${salaNome ? ` (${salaNome})` : ''}`
        };
      }

      logger.error("Erro ao criar agendamento", { result }, "SCHEDULER");
      return { success: false, error: (result as any)?.error || "Erro desconhecido" };

    } catch (error: any) {
      if (error.message?.includes('unique') || error.code === '23505') {
        return { success: false, error: "Horário já ocupado" };
      }
      
      logger.error("Falha ao criar agendamento", { error: error.message }, "SCHEDULER");
      return { success: false, error: error.message };
    }
  }

  private async confirmarReserva(tenantId: string, telefone: string): Promise<void> {
    try {
      await supabaseService.request("PATCH", "reservas_temporarias", {
        query: `tenant_id=eq.${tenantId}&telefone=eq.${telefone}&status=eq.ativo`,
        body: { status: 'confirmado' }
      });
    } catch (error) {
      // Ignora erro se não existir reserva
    }
  }

  // ============================================
  // ATUALIZAR DADOS DO AGENDAMENTO
  // ============================================

  async atualizarAgendamento(
    telefone: string,
    data: string,
    horario: string,
    dados: { nome?: string; dataNascimento?: string }
  ): Promise<AgendarResponse> {
    try {
      let dataNascISO: string | null = null;
      if (dados.dataNascimento) {
        const match = dados.dataNascimento.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
        if (match) {
          const dia = match[1].padStart(2, '0');
          const mes = match[2].padStart(2, '0');
          let ano = match[3];
          if (ano.length === 2) ano = `19${ano}`;
          dataNascISO = `${ano}-${mes}-${dia}`;
        }
      }

      // Normalizar data
      let dataISO = data;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
        dataISO = this.parseDataRelativa(data);
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

      logger.info("Agendamento atualizado", { telefone, data: dataISO, horario }, "SCHEDULER");
      return { success: true, status: updates.status || 'pendente' };

    } catch (error: any) {
      logger.error("Falha ao atualizar", { error: error.message }, "SCHEDULER");
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // FORMATAR HORÁRIOS PARA O PROMPT
  // ============================================

  formatHorariosParaPrompt(
    horarios: string[], 
    data: string, 
    periodoSolicitado?: 'manha' | 'tarde' | 'noite' | null,
    salas?: Record<string, SalaInfo>
  ): string {
    const dataFormatada = this.formatarDataExibicao(data);
    
    if (!horarios || horarios.length === 0) {
      return `

---
## ⚠️ SEM HORÁRIOS DISPONÍVEIS

**Data:** ${dataFormatada}

### 🚨 INSTRUÇÕES:
1. **NÃO INVENTE horários**
2. Informe que não tem vaga
3. Pergunte se quer outro dia

**Responda:**
"Poxa, para ${dataFormatada} não tenho mais horário 😕 Quer que eu veja outro dia?"
`;
    }

    let horariosFiltrados = horarios;
    let periodoTexto = "";
    
    if (periodoSolicitado) {
      horariosFiltrados = this.filtrarPorPeriodo(horarios, periodoSolicitado);
      periodoTexto = periodoSolicitado === 'manha' ? 'de manhã' : 
                     periodoSolicitado === 'tarde' ? 'à tarde' : 'à noite';
    }

    const sugestoes = this.selecionarHorariosSugestao(horariosFiltrados, 3);
    
    // Info sobre salas
    let salasInfo = "";
    if (salas && Object.keys(salas).length > 1) {
      salasInfo = `\n**Profissionais disponíveis:** ${Object.values(salas).map(s => s.profissional).join(', ')}`;
    }

    return `

---
## 📅 HORÁRIOS - ${dataFormatada.toUpperCase()}${periodoTexto ? ` (${periodoTexto})` : ''}
${salasInfo}

**HORÁRIOS DISPONÍVEIS:**
${horariosFiltrados.join(', ')}

**Total:** ${horariosFiltrados.length} vagas

### 🚨 REGRAS:
1. **USE SOMENTE OS HORÁRIOS ACIMA**
2. **NUNCA INVENTE**
3. Ofereça 2-3 opções: ${sugestoes.join(', ')}

---
### ✅ FLUXO DE COLETA:

1. Cliente escolhe horário
2. Pergunte: "Show! Qual seu nome completo?"
3. Pergunte: "E sua data de nascimento?"
4. SÓ ENTÃO confirme o agendamento

**Se cliente não especificou período:**
"Prefere de manhã, tarde ou noite?"
`;
  }

  formatErroConsultaParaPrompt(data: string, erro?: string): string {
    const dataFormatada = this.formatarDataExibicao(data);
    
    return `

---
## ⚠️ SISTEMA INDISPONÍVEL

**Data:** ${dataFormatada}
${erro ? `**Erro:** ${erro}` : ''}

### 🚨 INSTRUÇÕES:
1. **NÃO INVENTE HORÁRIOS**
2. Peça desculpas
3. Diga que vai verificar

**Responda:**
"Me dá um minutinho que estou verificando os horários! 😊"
`;
  }

  // ============================================
  // HELPERS
  // ============================================

  private filtrarPorPeriodo(horarios: string[], periodo: 'manha' | 'tarde' | 'noite'): string[] {
    return horarios.filter(h => {
      const hora = parseInt(h.split(':')[0]);
      if (periodo === 'manha') return hora >= 8 && hora < 12;
      if (periodo === 'tarde') return hora >= 12 && hora < 18;
      if (periodo === 'noite') return hora >= 18;
      return true;
    });
  }

  private formatarDataExibicao(data: string): string {
    if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      const [ano, mes, dia] = data.split('-');
      const dataObj = new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
      const diasSemana = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
      const diaSemana = diasSemana[dataObj.getDay()];
      return `${diaSemana}, ${dia}/${mes}`;
    }
    return data;
  }

  private selecionarHorariosSugestao(horarios: string[], quantidade: number): string[] {
    if (horarios.length <= quantidade) return horarios;
    
    const resultado: string[] = [];
    const step = Math.floor(horarios.length / quantidade);
    
    for (let i = 0; i < quantidade && i * step < horarios.length; i++) {
      resultado.push(horarios[i * step]);
    }
    
    return resultado;
  }
}

export const schedulerService = new SchedulerService();
export default schedulerService;