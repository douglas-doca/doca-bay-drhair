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
export declare function trackUsage(data: UsageData): Promise<void>;
export declare function calculateCost(provider: string, model: string, inputTokens: number, outputTokens: number): number;
//# sourceMappingURL=usage-tracker.d.ts.map