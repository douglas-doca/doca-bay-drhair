export interface LeadMemory {
    summary: string;
    nome: string | null;
    regiao: string | null;
    objecoes: string[];
    stage_hint: string | null;
    ultima_atualizacao: string;
    versao: number;
}
export declare function shouldGenerateMemory(tenantId: string, phone: string): Promise<boolean>;
export declare function generateMemorySummary(tenantId: string, phone: string): Promise<LeadMemory | null>;
export declare function getLeadMemory(tenantId: string, leadId: string): Promise<any | null>;
export declare function formatMemoryForContext(memory: LeadMemory): string;
export declare function processMemoryPipeline(tenantId: string, phone: string): Promise<string>;
//# sourceMappingURL=memory.service.d.ts.map