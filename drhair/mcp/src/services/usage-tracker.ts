// Usage Tracker - Rastreia uso de LLM
export interface UsageData {
  tenantId?: string;
  tenantName?: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  userId?: string;
  conversationId?: string;
  timestamp?: Date;
}

export async function trackUsage(data: UsageData): Promise<void> {
  try {
    const cost = calculateCost(data.provider, data.model, data.inputTokens, data.outputTokens);
    console.log("[UsageTracker] Registrando uso:", {
      provider: data.provider,
      model: data.model,
      tokens: data.inputTokens + data.outputTokens,
      cost: cost.toFixed(4),
      tenant: data.tenantId,
      tenantName: data.tenantName,
    });
    // TODO: Salvar no banco de dados
  } catch (error) {
    console.error("[UsageTracker] Erro ao registrar uso:", error);
  }
}

export function calculateCost(provider: string, model: string, inputTokens: number, outputTokens: number): number {
  const pricing: Record<string, { input: number; output: number }> = {
    // OpenAI
    "gpt-4": { input: 0.03, output: 0.06 },
    "gpt-4o": { input: 0.005, output: 0.015 },
    "gpt-4-turbo": { input: 0.01, output: 0.03 },
    "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
    // Anthropic
    "claude-3-opus": { input: 0.015, output: 0.075 },
    "claude-3-sonnet": { input: 0.003, output: 0.015 },
    "claude-sonnet-4-20250514": { input: 0.003, output: 0.015 },
    "claude-3-haiku": { input: 0.00025, output: 0.00125 },
  };

  const price = pricing[model] || { input: 0.001, output: 0.002 };
  return (inputTokens / 1000) * price.input + (outputTokens / 1000) * price.output;
}
