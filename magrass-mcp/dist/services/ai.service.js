// ============================================
// MCP-DOCA-V2 - AI Service
// ============================================
import { logger } from '../utils/logger.js';
import { trackUsage } from './usage-tracker.js';
export class AIService {
    provider;
    apiKey;
    model;
    maxTokens;
    temperature;
    baseUrl;
    // Tenant info para tracking
    tenantId;
    tenantName;
    static providerConfigs = {
        openai: {
            apiKey: process.env.OPENAI_API_KEY || '',
            baseUrl: 'https://api.openai.com/v1',
            defaultModel: 'gpt-4o',
        },
        anthropic: {
            apiKey: process.env.ANTHROPIC_API_KEY || '',
            baseUrl: 'https://api.anthropic.com/v1',
            defaultModel: 'claude-sonnet-4-20250514',
        },
    };
    constructor(config) {
        this.provider = (config?.provider || process.env.AI_PROVIDER || 'anthropic');
        const providerConfig = AIService.providerConfigs[this.provider];
        this.apiKey = config?.apiKey || providerConfig.apiKey;
        this.model = config?.model || process.env.AI_MODEL || providerConfig.defaultModel;
        this.maxTokens = config?.maxTokens || parseInt(process.env.AI_MAX_TOKENS || '1024');
        this.temperature = config?.temperature || parseFloat(process.env.AI_TEMPERATURE || '0.7');
        this.baseUrl = providerConfig.baseUrl;
        if (!this.apiKey) {
            logger.warn(`API key not set for provider: ${this.provider}`, undefined, 'AI');
        }
        logger.ai('AI Service initialized', {
            provider: this.provider,
            model: this.model
        });
    }
    // ============ Factory Method para criar instância por tenant ============
    static createForTenant(agentConfig) {
        if (!agentConfig?.ai_provider) {
            // Retorna singleton padrão se não tiver config específica
            return aiService;
        }
        const provider = agentConfig.ai_provider;
        const providerConfig = AIService.providerConfigs[provider];
        if (!providerConfig) {
            logger.warn(`Unknown provider: ${provider}, using default`, undefined, 'AI');
            return aiService;
        }
        logger.ai('Creating tenant-specific AI Service', {
            provider,
            model: agentConfig.ai_model || providerConfig.defaultModel
        });
        return new AIService({
            provider,
            apiKey: providerConfig.apiKey,
            model: agentConfig.ai_model || providerConfig.defaultModel,
            maxTokens: agentConfig.ai_max_tokens || 1024,
            temperature: agentConfig.ai_temperature || 0.7,
        });
    }
    // ============ Main Completion Method ============
    async complete(params) {
        const timer = logger.startTimer('AI Completion');
        try {
            const result = this.provider === 'openai'
                ? await this.completeOpenAI(params)
                : await this.completeAnthropic(params);
            timer();
            // Track usage no DOCA HQ
            if (this.tenantId && this.tenantName) {
                trackUsage({
                    tenantId: this.tenantId,
                    tenantName: this.tenantName,
                    provider: this.provider,
                    model: this.model,
                    inputTokens: result.tokens.prompt,
                    outputTokens: result.tokens.completion,
                }).catch(() => { }); // Fire and forget
            }
            logger.ai('Completion successful', {
                provider: this.provider,
                model: this.model,
                tokens: result.tokens,
                finishReason: result.finishReason
            });
            return result;
        }
        catch (error) {
            logger.error('AI completion failed', error, 'AI');
            throw error;
        }
    }
    // ============ OpenAI Implementation ============
    async completeOpenAI(params) {
        const messages = [];
        // Add system prompt
        if (params.systemPrompt) {
            messages.push({ role: 'system', content: params.systemPrompt });
        }
        // Add conversation messages
        messages.push(...params.messages.map(m => ({
            role: m.role,
            content: m.content,
        })));
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: this.model,
                messages,
                max_tokens: params.maxTokens || this.maxTokens,
                temperature: params.temperature ?? this.temperature,
            }),
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'OpenAI API error');
        }
        const data = await response.json();
        const choice = data.choices[0];
        return {
            content: choice.message.content,
            tokens: {
                prompt: data.usage.prompt_tokens,
                completion: data.usage.completion_tokens,
                total: data.usage.total_tokens,
            },
            finishReason: choice.finish_reason,
        };
    }
    // ============ Anthropic Implementation ============
    async completeAnthropic(params) {
        const messages = params.messages.map(m => ({
            role: m.role === 'system' ? 'user' : m.role,
            content: m.content,
        }));
        const response = await fetch(`${this.baseUrl}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: this.model,
                max_tokens: params.maxTokens || this.maxTokens,
                system: params.systemPrompt,
                messages,
            }),
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Anthropic API error');
        }
        const data = await response.json();
        return {
            content: data.content[0].text,
            tokens: {
                prompt: data.usage.input_tokens,
                completion: data.usage.output_tokens,
                total: data.usage.input_tokens + data.usage.output_tokens,
            },
            finishReason: data.stop_reason,
        };
    }
    // ============ Convenience Methods ============
    async chat(userMessage, systemPrompt, conversationHistory) {
        const messages = conversationHistory || [];
        messages.push({ role: 'user', content: userMessage });
        const response = await this.complete({
            messages,
            systemPrompt,
        });
        return response.content;
    }
    async simpleCompletion(prompt) {
        const response = await this.complete({
            messages: [{ role: 'user', content: prompt }],
        });
        return response.content;
    }
    // ============ Specialized Methods ============
    async analyzeIntent(message) {
        const response = await this.chat(message, `Você é um analisador de intenções. Analise a mensagem e retorne APENAS um JSON válido com:
{
  "intent": "string (ex: greeting, question, complaint, scheduling, pricing, other)",
  "confidence": number (0.0 a 1.0),
  "entities": { "key": "value" }
}
Responda SOMENTE com o JSON, sem texto adicional.`);
        try {
            return JSON.parse(response);
        }
        catch {
            return {
                intent: 'other',
                confidence: 0.5,
                entities: {},
            };
        }
    }
    async analyzeSentiment(message) {
        const response = await this.chat(message, `Você é um analisador de sentimentos. Analise a mensagem e retorne APENAS um JSON válido com:
{
  "sentiment": "positive" | "neutral" | "negative",
  "score": number (-1.0 a 1.0),
  "emotions": ["array de emoções detectadas"]
}
Responda SOMENTE com o JSON, sem texto adicional.`);
        try {
            return JSON.parse(response);
        }
        catch {
            return {
                sentiment: 'neutral',
                score: 0,
                emotions: [],
            };
        }
    }
    async generateResponse(userMessage, context) {
        const systemPrompt = `Você é um assistente virtual.

${context.businessInfo || ''}

Instruções:
- Seja ${context.tone || 'professional'} e prestativo
- Responda de forma concisa e direta
- Use emojis moderadamente
- ${context.leadName ? `O nome do cliente é ${context.leadName}` : 'Trate o cliente de forma cordial'}`;
        return this.chat(userMessage, systemPrompt, context.previousMessages);
    }
    async summarizeConversation(messages) {
        const conversationText = messages
            .map(m => `${m.role}: ${m.content}`)
            .join('\n');
        return this.chat(conversationText, `Resuma esta conversa em 2-3 frases, destacando:
1. O que o cliente queria
2. O que foi discutido/oferecido
3. Próximos passos ou conclusão`);
    }
    async qualifyLead(messages) {
        const conversationText = messages
            .map(m => `${m.role}: ${m.content}`)
            .join('\n');
        const response = await this.chat(conversationText, `Analise esta conversa de vendas e retorne APENAS um JSON válido com:
{
  "score": number (0-100),
  "interests": ["array de interesses"],
  "objections": ["array de objeções"],
  "nextAction": "próxima ação recomendada"
}
Responda SOMENTE com o JSON, sem texto adicional.`);
        try {
            return JSON.parse(response);
        }
        catch {
            return {
                score: 50,
                interests: [],
                objections: [],
                nextAction: 'Continuar qualificação',
            };
        }
    }
    // ============ Configuration ============
    setModel(model) {
        this.model = model;
        logger.ai(`Model changed to: ${model}`);
    }
    setTemperature(temperature) {
        this.temperature = Math.max(0, Math.min(2, temperature));
        logger.ai(`Temperature changed to: ${this.temperature}`);
    }
    getConfig() {
        return {
            provider: this.provider,
            model: this.model,
            maxTokens: this.maxTokens,
            temperature: this.temperature,
        };
    }
}
// Exportar instância singleton (padrão)
export const aiService = new AIService();
//# sourceMappingURL=ai.service.js.map