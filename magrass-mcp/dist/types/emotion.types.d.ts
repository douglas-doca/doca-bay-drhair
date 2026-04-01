export type EmotionType = 'skeptical' | 'anxious' | 'frustrated' | 'excited' | 'price_sensitive' | 'ready' | 'curious' | 'neutral';
export type LeadStage = 'cético' | 'frustrado' | 'curioso' | 'sensível_preço' | 'empolgado' | 'pronto';
export type UrgencyLevel = 'low' | 'normal' | 'high' | 'critical';
export interface EmotionEvent {
    id: string;
    conversation_id: string;
    lead_id: string;
    emotion: EmotionType;
    confidence: number;
    message_content: string;
    detected_at: Date;
    metadata: Record<string, any>;
}
export interface EmotionProfile {
    dominant_emotion: EmotionType;
    emotion_distribution: Record<EmotionType, number>;
    emotion_transitions: Array<{
        from: EmotionType;
        to: EmotionType;
        count: number;
    }>;
    last_updated: Date;
}
export interface HealthMetrics {
    health_score: number;
    temperature: number;
    conversion_probability: number;
    urgency_level: UrgencyLevel;
    friction_points: string[];
    positive_signals: string[];
}
export type ConversionStage = 'novo' | 'contactado' | 'interessado' | 'agendado' | 'compareceu' | 'perdido';
export interface ConversionMetrics {
    tenant_id: string;
    period: 'day' | 'week' | 'month' | 'all';
    total_novos: number;
    total_contactados: number;
    total_interessados: number;
    total_agendados: number;
    total_compareceram: number;
    total_perdidos: number;
    taxa_contato: number;
    taxa_interesse: number;
    taxa_agendamento: number;
    taxa_comparecimento: number;
    taxa_conversao_total: number;
    tempo_medio_ate_contato_horas: number;
    tempo_medio_ate_agendamento_horas: number;
    tempo_medio_ate_comparecimento_horas: number;
    variacao_vs_periodo_anterior: number;
}
export interface LeadConversionHistory {
    lead_id: string;
    tenant_id: string;
    stage: ConversionStage;
    changed_at: Date;
    previous_stage?: ConversionStage;
    metadata?: Record<string, any>;
}
//# sourceMappingURL=emotion.types.d.ts.map