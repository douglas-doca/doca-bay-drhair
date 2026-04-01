type Range = "today" | "7d" | "30d";
export declare class AnalysisService {
    /**
     * Envia mensagem passando pelo humanizer (Agent Studio).
     * Usa responseAgent.createResponsePlan() para gerar um plan com bolhas, delays e typing.
     * Se plan não existir (ou falhar), faz fallback para sendMessage.
     */
    private sendHumanized;
    getStalledConversations(opts: {
        tenantId: string;
        min_minutes: number;
        limit: number;
        status: "open" | "closed";
    }): Promise<{
        ok: boolean;
        error: string;
        min_minutes: number;
        count: number;
        conversations: any[];
    } | {
        ok: boolean;
        min_minutes: number;
        count: number;
        conversations: any[];
        error?: undefined;
    }>;
    getSummary(opts: {
        tenantId: string;
        range: Range;
    }): Promise<{
        ok: boolean;
        error: string;
        range: Range;
        stalled: number;
        suggested: number;
        sent: number;
        tenantId?: undefined;
    } | {
        ok: boolean;
        tenantId: string;
        range: Range;
        stalled: number;
        suggested: number;
        sent: number;
        error?: undefined;
    }>;
    runAnalysis(opts: {
        tenantId: string;
        conversation_id: string;
        mode: "followup" | "insights";
        language: string;
    }): Promise<{
        ok: boolean;
        error: string;
        conversation_id: string;
        insights?: undefined;
        mode?: undefined;
        followups?: undefined;
    } | {
        ok: boolean;
        conversation_id: string;
        insights: {
            last_message: string;
            total_messages: number;
            hint: string;
        };
        error?: undefined;
        mode?: undefined;
        followups?: undefined;
    } | {
        ok: boolean;
        conversation_id: string;
        mode: string;
        followups: {
            id: string;
            title: string;
            timing: string;
            text: string;
            confidence: number;
            stage: string;
            tags: string[];
        }[];
        error?: undefined;
        insights?: undefined;
    }>;
    approveAndSend(opts: {
        tenantId: string;
        conversation_id: string;
        text: string;
        followup_id?: string;
        phone?: string;
    }): Promise<{
        ok: boolean;
        error: string;
        tenantId?: undefined;
        conversation_id?: undefined;
        to?: undefined;
        stage?: undefined;
    } | {
        ok: boolean;
        tenantId: string;
        conversation_id: string;
        to: string;
        stage: string;
        error?: undefined;
    }>;
}
export declare const analysisService: AnalysisService;
export {};
//# sourceMappingURL=analysis.service.d.ts.map