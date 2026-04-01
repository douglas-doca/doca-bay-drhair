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
declare class SchedulerService {
    hasSchedulerTool(clientId: string): boolean;
    /**
     * Resolve a URL do scheduler para um tenant.
     * 1. Config local do client
     * 2. Supabase tenants.scheduler_url
     * 3. Fallback: http://doca-scheduler:3001
     */
    resolveSchedulerUrl(clientId: string, tenantId?: string): Promise<string>;
    /**
     * Resolve o franquia slug a partir do clientId.
     * Usado nas rotas /api/:franquia/ do novo scheduler.
     */
    resolveFranquiaSlug(clientId: string): string;
    getTenantId(clientId: string): string | null;
    getSchedulerAuth(clientId: string): {
        token?: string;
        headerName?: string;
    } | null;
    parseDataRelativa(texto: string, dataAtual?: Date): string;
    private formatDateISO;
    private formatDateBR;
    detectSchedulingIntent(message: string): SchedulingIntent;
    consultarHorarios(clientId: string, data: string, tenantId?: string): Promise<HorariosResponse>;
    private consultarScheduler;
    private salvarSalasEmMemoria;
    private recuperarSalasDeMemoria;
    encontrarSalaPorHorario(clientId: string, dataISO: string, horario: string, tenantId?: string): Promise<{
        salaId: string;
        nome: string;
        profissional: string;
    } | null>;
    private consultarCache;
    getHorariosBloqueados(tenantId: string, dataISO: string): Promise<string[]>;
    criarAgendamento(clientId: string, dados: DadosAgendamento, tenantId?: string): Promise<AgendarResponse>;
    atualizarAgendamento(telefone: string, data: string, horario: string, dados: {
        nome?: string;
        dataNascimento?: string;
    }): Promise<AgendarResponse>;
    formatHorariosParaPrompt(horarios: string[], data: string, periodoSolicitado?: 'manha' | 'tarde' | 'noite' | null, salas?: Record<string, SalaInfo>): string;
    formatErroConsultaParaPrompt(data: string, erro?: string): string;
    private filtrarPorPeriodo;
    private formatarDataExibicao;
    private selecionarSugestoes;
}
export declare const schedulerService: SchedulerService;
export default schedulerService;
//# sourceMappingURL=scheduler.service.d.ts.map