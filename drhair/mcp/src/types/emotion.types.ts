export type EmotionType = 
  | 'skeptical'
  | 'anxious'
  | 'frustrated'
  | 'excited'
  | 'price_sensitive'
  | 'ready'
  | 'curious'
  | 'neutral';

export type LeadStage = 
  | 'cético'
  | 'frustrado'
  | 'curioso'
  | 'sensível_preço'
  | 'empolgado'
  | 'pronto';

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
  emotion_transitions: Array<{from: EmotionType; to: EmotionType; count: number}>;
  last_updated: Date;
}

export interface HealthMetrics {
  health_score: number; // 0-100
  temperature: number; // 0-100 (quão "quente" está o lead)
  conversion_probability: number; // 0-1
  urgency_level: UrgencyLevel;
  friction_points: string[];
  positive_signals: string[];
}
// ============================================
// FUNIL DE CONVERSÃO - Métricas Reais
// ============================================

export type ConversionStage = 
  | 'novo'        // Acabou de chegar
  | 'contactado'  // Respondeu pelo menos 1x
  | 'interessado' // Demonstrou interesse real
  | 'agendado'    // Marcou horário
  | 'compareceu'  // Foi na clínica
  | 'perdido';    // Desistiu/sumiu

export interface ConversionMetrics {
  tenant_id: string;
  period: 'day' | 'week' | 'month' | 'all';
  
  // Contagens por estágio
  total_novos: number;
  total_contactados: number;
  total_interessados: number;
  total_agendados: number;
  total_compareceram: number;
  total_perdidos: number;
  
  // Taxas de conversão
  taxa_contato: number;      // novos → contactados (%)
  taxa_interesse: number;    // contactados → interessados (%)
  taxa_agendamento: number;  // interessados → agendados (%)
  taxa_comparecimento: number; // agendados → compareceram (%)
  taxa_conversao_total: number; // novos → compareceram (%)
  
  // Tempos médios
  tempo_medio_ate_contato_horas: number;
  tempo_medio_ate_agendamento_horas: number;
  tempo_medio_ate_comparecimento_horas: number;
  
  // Comparativo
  variacao_vs_periodo_anterior: number; // % de mudança
}

export interface LeadConversionHistory {
  lead_id: string;
  tenant_id: string;
  stage: ConversionStage;
  changed_at: Date;
  previous_stage?: ConversionStage;
  metadata?: Record<string, any>;
}
