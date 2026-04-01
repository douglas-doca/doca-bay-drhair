type MessageProvider = "waha" | "zapi";
interface ClientConfig {
    id: string;
    nome: string;
    nome_exibicao: string;
    telefone?: string;
    endereco?: string;
    especialidade?: string;
    site?: string;
    horario_funcionamento?: any;
    servicos?: string[];
    personalizacao?: any;
    message_provider?: MessageProvider;
    zapi?: {
        instance_id: string;
        token: string;
        clientToken?: string;
    };
    waha?: {
        session?: string;
        api_url?: string;
        instance?: string;
        chipPhone?: string;
    };
    tenant_id?: string;
    crm?: any;
    ai_config?: any;
    features?: any;
    conversation?: any;
    emotion_mapping?: any;
    journey_stages?: any;
    tools?: string[];
    scheduler_url?: string;
}
interface Client {
    id: string;
    config: ClientConfig;
    prompt: string;
    knowledge: string;
    provasSociais: string[];
}
declare class ClientService {
    private clientsPath;
    private clients;
    private phoneToClient;
    private instanceToClient;
    private instanceToTenant;
    private phoneToTenant;
    private clientToTenant;
    constructor();
    loadClients(): void;
    /**
     * 🔒 Carrega secrets de variáveis de ambiente
     * Padrão: ZAPI_INSTANCE_ID_DRHAIR_CONTAGEM, CRM_USERNAME_DRHAIR_CONTAGEM, etc.
     */
    private loadSecretsFromEnv;
    private loadClient;
    getClient(clientId: string): Client | undefined;
    getClientConfig(clientId: string): ClientConfig | undefined;
    getClientPrompt(clientId: string): string;
    getClientKnowledge(clientId: string): string;
    getAllClients(): Client[];
    listClients(): Array<{
        id: string;
        nome: string;
        telefone?: string;
        provider?: MessageProvider;
    }>;
    /**
     * Infere o provider baseado na config (se não tiver message_provider explícito)
     */
    private inferProvider;
    /**
     * Retorna o provider de um cliente
     */
    getClientProvider(clientId: string): MessageProvider;
    /**
     * ✅ Alias para getClientProvider - usado pelo webhook.server.ts e analysis.service.ts
     */
    getMessageProvider(clientId: string): MessageProvider;
    /**
     * Retorna config do Z-API de um cliente
     */
    getClientZapiConfig(clientId: string): ClientConfig['zapi'] | undefined;
    /**
     * Retorna config do WAHA de um cliente
     */
    getClientWahaConfig(clientId: string): ClientConfig['waha'] | undefined;
    /**
     * Detecta cliente por telefone ou instanceId
     */
    detectClient(phone?: string, instanceId?: string): string | null;
    /**
     * ✅ Detecta cliente pelo instanceId do Z-API (usado no webhook)
     */
    detectClientByInstanceId(instanceId: string): string | null;
    /**
     * 🆕 PRINCIPAL: Detecta tenant_id diretamente por instanceId ou telefone
     * Retorna { tenantId, clientId } ou null se não encontrar
     */
    detectTenant(opts: {
        phone?: string;
        instanceId?: string;
    }): {
        tenantId: string;
        clientId: string;
    } | null;
    /**
     * 🆕 Retorna tenant_id pelo clientId (slug)
     */
    getTenantId(clientId: string): string | null;
    /**
     * 🆕 Retorna clientId pelo tenant_id
     */
    getClientIdByTenant(tenantId: string): string | null;
    buildSystemPrompt(clientId: string): string;
    reload(): void;
    syncToSupabase(supabase: any): Promise<void>;
}
export declare const clientService: ClientService;
export {};
//# sourceMappingURL=client.service.d.ts.map