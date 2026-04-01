import { AIConfig, AICompletionParams, AICompletionResponse, AIMessage } from '../types/index.js';
export declare class AIService {
    private provider;
    private apiKey;
    private model;
    private maxTokens;
    private temperature;
    private baseUrl;
    private tenantId?;
    private tenantName?;
    private static providerConfigs;
    constructor(config?: Partial<AIConfig>);
    static createForTenant(agentConfig?: {
        ai_provider?: string;
        ai_model?: string;
        ai_temperature?: number;
        ai_max_tokens?: number;
    }): AIService;
    complete(params: AICompletionParams): Promise<AICompletionResponse>;
    private completeOpenAI;
    private completeAnthropic;
    chat(userMessage: string, systemPrompt?: string, conversationHistory?: AIMessage[]): Promise<string>;
    simpleCompletion(prompt: string): Promise<string>;
    analyzeIntent(message: string): Promise<{
        intent: string;
        confidence: number;
        entities: Record<string, string>;
    }>;
    analyzeSentiment(message: string): Promise<{
        sentiment: 'positive' | 'neutral' | 'negative';
        score: number;
        emotions: string[];
    }>;
    generateResponse(userMessage: string, context: {
        leadName?: string;
        previousMessages?: AIMessage[];
        businessInfo?: string;
        tone?: 'formal' | 'casual' | 'professional';
    }): Promise<string>;
    summarizeConversation(messages: AIMessage[]): Promise<string>;
    qualifyLead(messages: AIMessage[]): Promise<{
        score: number;
        interests: string[];
        objections: string[];
        nextAction: string;
    }>;
    setModel(model: string): void;
    setTemperature(temperature: number): void;
    getConfig(): {
        provider: string;
        model: string;
        maxTokens: number;
        temperature: number;
    };
}
export declare const aiService: AIService;
//# sourceMappingURL=ai.service.d.ts.map