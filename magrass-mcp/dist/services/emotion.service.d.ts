import { EmotionEvent, HealthMetrics } from '../types/emotion.types.js';
/**
 * Detecta emoção de uma mensagem via heurística (regex)
 * ✅ Esta função é stateless, não precisa de tenantId
 */
export declare function detectEmotion(message: string): {
    emotion: string;
    style: string;
};
export declare class EmotionService {
    saveEmotionEvent(tenantId: string, // 🔒 OBRIGATÓRIO
    event: Omit<EmotionEvent, 'id' | 'detected_at' | 'tenant_id'>): Promise<void>;
    updateLeadMetrics(tenantId: string, leadId: string): Promise<void>;
    private calculateEmotionProfile;
    private calculateHealthMetrics;
    getDashboardMetrics(tenantId: string): Promise<any>;
    getSentimentMatrix(tenantId: string): Promise<any>;
    getEmotionalFunnel(tenantId: string): Promise<any>;
    getLeadHealth(tenantId: string, leadId: string): Promise<HealthMetrics | null>;
    private emotionToSentiment;
}
export declare const emotionService: EmotionService;
//# sourceMappingURL=emotion.service.d.ts.map