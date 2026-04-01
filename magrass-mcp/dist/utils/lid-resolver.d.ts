/**
 * Resolve LID opaco para telefone real.
 * Estratégia:
 * 1. Cache em memória (24h TTL)
 * 2. Tabela lid_phone_map no Supabase
 * 3. Busca conversations com esse LID como chat_id
 * 4. WAHA Contacts API — resolve LID → phone real
 * 5. Fallback: retorna null
 */
export declare function resolveLidPhone(lid: string, tenantId?: string, wahaSession?: string): Promise<string | null>;
/** Salvar mapeamento LID→phone no Supabase (fire-and-forget) */
export declare function saveLidMapping(lid: string, phone: string, tenantId?: string): void;
/** Registrar mapeamento quando souber o phone real (ex: Z-API, landing) */
export declare function registerLidPhone(lid: string, phone: string, tenantId?: string): void;
/** Remove suffix @c.us / @g.us / @lid */
export declare function stripSuffix(id: string): string;
//# sourceMappingURL=lid-resolver.d.ts.map