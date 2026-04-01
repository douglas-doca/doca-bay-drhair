// ============================================
// MCP-DOCA-V2 - Client Service
// Gerencia clientes a partir da pasta /clientes
// ✅ Atualizado: suporte a message_provider (waha/zapi)
// ============================================
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
// ============================================
// CLIENT SERVICE
// ============================================
class ClientService {
    clientsPath;
    clients = new Map();
    phoneToClient = new Map();
    instanceToClient = new Map();
    // 🆕 MAPAS DIRETOS PARA TENANT_ID (mais seguro)
    instanceToTenant = new Map(); // instanceId -> tenant_id
    phoneToTenant = new Map(); // telefone -> tenant_id
    clientToTenant = new Map(); // clientId -> tenant_id
    constructor() {
        this.clientsPath = path.join(process.cwd(), 'clientes');
        this.loadClients();
    }
    // ============ Carregar Clientes ============
    loadClients() {
        try {
            if (!fs.existsSync(this.clientsPath)) {
                logger.warn(`Pasta de clientes não encontrada: ${this.clientsPath}`, undefined, 'CLIENT');
                return;
            }
            const folders = fs.readdirSync(this.clientsPath);
            for (const folder of folders) {
                if (folder.startsWith('_') || folder.startsWith('.'))
                    continue;
                const clientPath = path.join(this.clientsPath, folder);
                const stat = fs.statSync(clientPath);
                if (!stat.isDirectory())
                    continue;
                try {
                    const client = this.loadClient(folder, clientPath);
                    if (client) {
                        this.clients.set(folder, client);
                        // Mapear telefone para cliente
                        if (client.config.telefone) {
                            const phone = client.config.telefone.replace(/\D/g, '');
                            this.phoneToClient.set(phone, folder);
                        }
                        // ✅ Mapear instance_id Z-API para cliente
                        if (client.config.zapi?.instance_id) {
                            this.instanceToClient.set(client.config.zapi.instance_id, folder);
                            // Também no phoneToClient para compatibilidade
                            this.phoneToClient.set(client.config.zapi.instance_id, folder);
                        }
                        // ✅ Mapear WAHA chipPhone/instance para cliente
                        if (client.config.waha?.chipPhone) {
                            const chip = client.config.waha.chipPhone.replace(/\D/g, '');
                            this.phoneToClient.set(chip, folder);
                            logger.info(`📱 WAHA chipPhone mapeado: ${chip} -> ${folder}`, undefined, 'CLIENT');
                        }
                        if (client.config.waha?.instance) {
                            this.instanceToClient.set(client.config.waha.instance, folder);
                        }
                        // 🆕 MAPAS DIRETOS PARA TENANT_ID
                        if (client.config.tenant_id) {
                            this.clientToTenant.set(folder, client.config.tenant_id);
                            // Mapa instanceId -> tenant_id (Z-API)
                            if (client.config.zapi?.instance_id) {
                                this.instanceToTenant.set(client.config.zapi.instance_id, client.config.tenant_id);
                            }
                            // Mapa telefone -> tenant_id
                            if (client.config.telefone) {
                                const phone = client.config.telefone.replace(/\D/g, '');
                                this.phoneToTenant.set(phone, client.config.tenant_id);
                            }
                            // Mapa WAHA -> tenant_id
                            if (client.config.waha?.chipPhone) {
                                const chip = client.config.waha.chipPhone.replace(/\D/g, '');
                                this.phoneToTenant.set(chip, client.config.tenant_id);
                            }
                            if (client.config.waha?.instance) {
                                this.instanceToTenant.set(client.config.waha.instance, client.config.tenant_id);
                            }
                            logger.info(`🔗 Tenant mapeado: ${folder} -> ${client.config.tenant_id}`, undefined, 'CLIENT');
                        }
                        else {
                            logger.warn(`⚠️ Cliente ${folder} sem tenant_id configurado!`, undefined, 'CLIENT');
                        }
                        const provider = client.config.message_provider || this.inferProvider(client.config);
                        logger.info(`✅ Cliente carregado: ${folder} (${client.config.nome_exibicao}) [${provider}]`, undefined, 'CLIENT');
                    }
                }
                catch (err) {
                    logger.error(`Erro ao carregar cliente ${folder}:`, err, 'CLIENT');
                }
            }
            logger.info(`📊 Total de clientes carregados: ${this.clients.size}`, undefined, 'CLIENT');
        }
        catch (error) {
            logger.error('Erro ao carregar clientes:', error, 'CLIENT');
        }
    }
    /**
     * 🔒 Carrega secrets de variáveis de ambiente
     * Padrão: ZAPI_INSTANCE_ID_DRHAIR_CONTAGEM, CRM_USERNAME_DRHAIR_CONTAGEM, etc.
     */
    loadSecretsFromEnv(id, config) {
        const envKey = id.toUpperCase().replace(/-/g, '_');
        // ✅ Z-API secrets
        const zapiInstanceId = process.env[`ZAPI_INSTANCE_ID_${envKey}`];
        const zapiToken = process.env[`ZAPI_TOKEN_${envKey}`];
        const zapiClientToken = process.env[`ZAPI_CLIENT_TOKEN_${envKey}`];
        if (zapiInstanceId && zapiToken) {
            config.zapi = {
                instance_id: zapiInstanceId,
                token: zapiToken,
                clientToken: zapiClientToken || config.zapi?.clientToken,
            };
            logger.info(`🔒 Z-API secrets carregados de ENV para ${id}`, undefined, 'CLIENT');
        }
        else if (config.zapi?.instance_id) {
            logger.warn(`⚠️ Z-API secrets em config.json para ${id} - migre para ENV!`, undefined, 'CLIENT');
        }
        // ✅ CRM secrets
        const crmUsername = process.env[`CRM_USERNAME_${envKey}`];
        const crmPassword = process.env[`CRM_PASSWORD_${envKey}`];
        const crmAccessToken = process.env[`CRM_ACCESS_TOKEN_${envKey}`];
        const crmSecretKey = process.env[`CRM_SECRET_KEY_${envKey}`];
        const crmPublicToken = process.env[`CRM_PUBLIC_TOKEN_${envKey}`];
        if (crmUsername || crmAccessToken) {
            config.crm = {
                ...config.crm,
                username: crmUsername || config.crm?.username,
                password: crmPassword || config.crm?.password,
                api_access_token: crmAccessToken || config.crm?.api_access_token,
                api_secret_key: crmSecretKey || config.crm?.api_secret_key,
                api_public_token: crmPublicToken || config.crm?.api_public_token,
            };
            logger.info(`🔒 CRM secrets carregados de ENV para ${id}`, undefined, 'CLIENT');
        }
        else if (config.crm?.password) {
            logger.warn(`⚠️ CRM secrets em config.json para ${id} - migre para ENV!`, undefined, 'CLIENT');
        }
        return config;
    }
    loadClient(id, clientPath) {
        const configPath = path.join(clientPath, 'config.json');
        const promptPath = path.join(clientPath, 'prompt.md');
        const knowledgePath = path.join(clientPath, 'knowledge.md');
        const provasSociaisPath = path.join(clientPath, 'provas-sociais');
        // Config é obrigatório
        if (!fs.existsSync(configPath)) {
            logger.warn(`Config não encontrado para: ${id}`, undefined, 'CLIENT');
            return null;
        }
        let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        // 🔒 Carregar secrets.json (gitignored, por tenant)
        const secretsPath = path.join(clientPath, 'secrets.json');
        if (fs.existsSync(secretsPath)) {
            try {
                const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));
                // Merge: secrets sobrescreve config
                if (secrets.zapi)
                    config.zapi = { ...config.zapi, ...secrets.zapi };
                if (secrets.crm)
                    config.crm = { ...config.crm, ...secrets.crm };
                if (secrets.waha)
                    config.waha = { ...config.waha, ...secrets.waha };
                logger.info(`🔒 secrets.json carregado para ${id}`, undefined, 'CLIENT');
            }
            catch (e) {
                logger.error(`❌ Erro ao ler secrets.json de ${id}`, { error: e?.message }, 'CLIENT');
            }
        }
        // 🔒 Override final: variáveis de ambiente (máxima prioridade)
        config = this.loadSecretsFromEnv(id, config);
        const prompt = fs.existsSync(promptPath)
            ? fs.readFileSync(promptPath, 'utf8')
            : '';
        const knowledge = fs.existsSync(knowledgePath)
            ? fs.readFileSync(knowledgePath, 'utf8')
            : '';
        // Listar provas sociais
        let provasSociais = [];
        if (fs.existsSync(provasSociaisPath)) {
            provasSociais = fs.readdirSync(provasSociaisPath)
                .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
        }
        return {
            id,
            config: { ...config, id },
            prompt,
            knowledge,
            provasSociais,
        };
    }
    // ============ Getters ============
    getClient(clientId) {
        return this.clients.get(clientId);
    }
    getClientConfig(clientId) {
        return this.clients.get(clientId)?.config;
    }
    getClientPrompt(clientId) {
        const client = this.clients.get(clientId);
        if (!client)
            return '';
        // Substituir variáveis temporais
        const now = new Date();
        const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
        let prompt = client.prompt;
        prompt = prompt.replace(/\{\{DATA_ATUAL\}\}/g, now.toLocaleDateString('pt-BR'));
        prompt = prompt.replace(/\{\{DIA_SEMANA\}\}/g, dias[now.getDay()]);
        prompt = prompt.replace(/\{\{HORA_ATUAL\}\}/g, now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
        // Data de amanhã
        const amanha = new Date(now);
        amanha.setDate(amanha.getDate() + 1);
        prompt = prompt.replace(/\{\{DATA_AMANHA\}\}/g, amanha.toLocaleDateString('pt-BR'));
        return prompt;
    }
    getClientKnowledge(clientId) {
        return this.clients.get(clientId)?.knowledge || '';
    }
    getAllClients() {
        return Array.from(this.clients.values());
    }
    listClients() {
        return Array.from(this.clients.values()).map(c => ({
            id: c.id,
            nome: c.config.nome_exibicao || c.config.nome,
            telefone: c.config.telefone,
            provider: c.config.message_provider || this.inferProvider(c.config),
        }));
    }
    // ============ Provider ============
    /**
     * Infere o provider baseado na config (se não tiver message_provider explícito)
     */
    inferProvider(config) {
        // Se tem config Z-API válido, usa Z-API
        if (config.zapi?.instance_id && config.zapi?.token) {
            return "zapi";
        }
        // Default: WAHA
        return "waha";
    }
    /**
     * Retorna o provider de um cliente
     */
    getClientProvider(clientId) {
        const config = this.getClientConfig(clientId);
        if (!config)
            return "waha";
        return config.message_provider || this.inferProvider(config);
    }
    /**
     * ✅ Alias para getClientProvider - usado pelo webhook.server.ts e analysis.service.ts
     */
    getMessageProvider(clientId) {
        return this.getClientProvider(clientId);
    }
    /**
     * Retorna config do Z-API de um cliente
     */
    getClientZapiConfig(clientId) {
        return this.getClientConfig(clientId)?.zapi;
    }
    /**
     * Retorna config do WAHA de um cliente
     */
    getClientWahaConfig(clientId) {
        return this.getClientConfig(clientId)?.waha;
    }
    // ============ Detecção de Cliente ============
    /**
     * Detecta cliente por telefone ou instanceId
     */
    detectClient(phone, instanceId) {
        // ✅ Por instance_id do Z-API ou WAHA (prioridade)
        if (instanceId) {
            if (this.instanceToClient.has(instanceId)) {
                return this.instanceToClient.get(instanceId);
            }
            // Fallback para phoneToClient (compatibilidade)
            if (this.phoneToClient.has(instanceId)) {
                return this.phoneToClient.get(instanceId);
            }
        }
        // Por telefone
        if (phone) {
            const cleanPhone = phone.replace(/\D/g, '');
            // Busca exata
            if (this.phoneToClient.has(cleanPhone)) {
                return this.phoneToClient.get(cleanPhone);
            }
            // ✅ Busca parcial (últimos 8-11 dígitos)
            for (const [mappedPhone, clientId] of this.phoneToClient) {
                // Pula instanceIds (não são números de telefone)
                if (mappedPhone.length < 8)
                    continue;
                if (cleanPhone.endsWith(mappedPhone) || mappedPhone.endsWith(cleanPhone)) {
                    return clientId;
                }
            }
        }
        // ⚠️ REMOVIDO FALLBACK PERIGOSO - Não retornar cliente aleatório!
        // Isso causava cross-tenant contamination quando telefone não estava mapeado
        logger.warn("❌ Cliente não detectado - NÃO usar fallback para evitar cross-tenant", {
            phone: phone?.replace(/\D/g, '').slice(-4) || 'N/A',
            instanceId: instanceId?.slice(-8) || 'N/A',
            clientesDisponiveis: Array.from(this.clients.keys())
        }, 'CLIENT');
        return null;
    }
    /**
     * ✅ Detecta cliente pelo instanceId do Z-API (usado no webhook)
     */
    detectClientByInstanceId(instanceId) {
        return this.instanceToClient.get(instanceId) || null;
    }
    // ============ 🆕 DETECÇÃO DIRETA DE TENANT_ID ============
    /**
     * 🆕 PRINCIPAL: Detecta tenant_id diretamente por instanceId ou telefone
     * Retorna { tenantId, clientId } ou null se não encontrar
     */
    detectTenant(opts) {
        const { phone, instanceId } = opts;
        // 1. Por instanceId (prioridade máxima - é único por cliente)
        if (instanceId) {
            const tenantId = this.instanceToTenant.get(instanceId);
            const clientId = this.instanceToClient.get(instanceId);
            if (tenantId && clientId) {
                logger.agent("Tenant detectado por instanceId", {
                    instanceId: instanceId.slice(-8),
                    tenantId: tenantId.slice(-8),
                    clientId
                });
                return { tenantId, clientId };
            }
        }
        // 2. Por telefone
        if (phone) {
            const cleanPhone = phone.replace(/\D/g, '');
            // Busca exata
            let tenantId = this.phoneToTenant.get(cleanPhone);
            let clientId = this.phoneToClient.get(cleanPhone);
            if (tenantId && clientId) {
                logger.agent("Tenant detectado por telefone (exato)", {
                    phone: cleanPhone.slice(-4),
                    tenantId: tenantId.slice(-8),
                    clientId
                });
                return { tenantId, clientId };
            }
            // Busca parcial (ultimos 8-11 dígitos)
            for (const [mappedPhone, tid] of this.phoneToTenant) {
                if (mappedPhone.length < 8)
                    continue;
                if (cleanPhone.endsWith(mappedPhone) || mappedPhone.endsWith(cleanPhone)) {
                    // Encontrou tenant, agora busca clientId
                    for (const [cid, tenantIdCheck] of this.clientToTenant) {
                        if (tenantIdCheck === tid) {
                            logger.agent("Tenant detectado por telefone (parcial)", {
                                phone: cleanPhone.slice(-4),
                                tenantId: tid.slice(-8),
                                clientId: cid
                            });
                            return { tenantId: tid, clientId: cid };
                        }
                    }
                }
            }
        }
        logger.warn("❌ Tenant não detectado", {
            phone: phone?.replace(/\D/g, '').slice(-4) || 'N/A',
            instanceId: instanceId?.slice(-8) || 'N/A',
            tenantsDisponiveis: this.instanceToTenant.size
        }, 'CLIENT');
        return null;
    }
    /**
     * 🆕 Retorna tenant_id pelo clientId (slug)
     */
    getTenantId(clientId) {
        return this.clientToTenant.get(clientId) || null;
    }
    /**
     * 🆕 Retorna clientId pelo tenant_id
     */
    getClientIdByTenant(tenantId) {
        for (const [clientId, tid] of this.clientToTenant) {
            if (tid === tenantId)
                return clientId;
        }
        return null;
    }
    // ============ Build System Prompt ============
    buildSystemPrompt(clientId) {
        const client = this.clients.get(clientId);
        if (!client)
            return '';
        const prompt = this.getClientPrompt(clientId);
        const knowledge = this.getClientKnowledge(clientId);
        return `${prompt}\n\n---\n\n# BASE DE CONHECIMENTO\n\n${knowledge}`;
    }
    // ============ Reload ============
    reload() {
        this.clients.clear();
        this.phoneToClient.clear();
        this.instanceToClient.clear();
        // 🆕 Limpar mapas de tenant
        this.instanceToTenant.clear();
        this.phoneToTenant.clear();
        this.clientToTenant.clear();
        this.loadClients();
        logger.info('Clientes recarregados', undefined, 'CLIENT');
    }
    // ============ Sync com Supabase ============
    async syncToSupabase(supabase) {
        for (const [id, client] of this.clients) {
            try {
                const provider = client.config.message_provider || this.inferProvider(client.config);
                const { error } = await supabase
                    .from('tenants')
                    .upsert({
                    slug: id,
                    name: client.config.nome_exibicao || client.config.nome,
                    phone: client.config.telefone,
                    address: client.config.endereco,
                    specialty: client.config.especialidade,
                    agent_config: client.config.personalizacao,
                    zapi_config: client.config.zapi,
                    waha_config: client.config.waha,
                    message_provider: provider, // ✅ Salva provider
                    crm_config: client.config.crm,
                    business_hours: client.config.horario_funcionamento,
                    prompt: client.prompt,
                    knowledge: client.knowledge,
                }, { onConflict: 'slug' });
                if (error) {
                    logger.error(`Erro ao sincronizar ${id}:`, error, 'CLIENT');
                }
                else {
                    logger.info(`✅ Sincronizado: ${id} [${provider}]`, undefined, 'CLIENT');
                }
            }
            catch (err) {
                logger.error(`Erro ao sincronizar ${id}:`, err, 'CLIENT');
            }
        }
    }
}
// Exportar instância singleton
export const clientService = new ClientService();
//# sourceMappingURL=client.service.js.map