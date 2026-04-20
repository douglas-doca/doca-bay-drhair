// src/utils/lid-resolver.ts
// ============================================
// WAHA LID → Phone Resolution
// ============================================
import { supabaseService } from "../services/supabase.service.js";
import { wahaService } from "../services/waha.service.js";
import { logger } from "./logger.js";

const LID_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h
const lidPhoneCache: Map<string, { phone: string; ts: number }> = new Map();

/**
 * Resolve LID opaco para telefone real.
 * Estratégia:
 * 1. Cache em memória (24h TTL)
 * 2. Tabela lid_phone_map no Supabase
 * 3. Busca conversations com esse LID como chat_id
 * 4. WAHA Contacts API — resolve LID → phone real
 * 5. Fallback: retorna null
 */
export async function resolveLidPhone(lid: string, tenantId?: string, wahaSession?: string): Promise<string | null> {
  if (!lid || lid.length < 5) return null;

  // 1. Cache em memória
  const cached = lidPhoneCache.get(lid);
  if (cached && (Date.now() - cached.ts) < LID_CACHE_TTL) {
    return cached.phone;
  }

  // 2. Tabela lid_phone_map no Supabase
  try {
    const mapResult = await supabaseService.request<any[]>(
      "GET", "lid_phone_map",
      { query: `lid=eq.${lid}&limit=1` }
    );
    if (mapResult?.[0]?.phone) {
      lidPhoneCache.set(lid, { phone: mapResult[0].phone, ts: Date.now() });
      return mapResult[0].phone;
    }
  } catch {
    // Tabela pode não existir ainda
  }

  // 3. Busca conversations com esse LID como chat_id
  try {
    const tenantFilter = tenantId ? `&tenant_id=eq.${tenantId}` : "";
    const convResult = await supabaseService.request<any[]>(
      "GET", "conversations",
      { query: `chat_id=eq.${lid}${tenantFilter}&limit=1` }
    );
    if (convResult?.[0]?.phone) {
      const phone = convResult[0].phone;
      lidPhoneCache.set(lid, { phone, ts: Date.now() });
      saveLidMapping(lid, phone, tenantId);
      return phone;
    }
  } catch (err) {
    logger.debug("LID conversations lookup failed", { lid, error: err }, "LID");
  }

  // 4. WAHA Contacts API — resolve LID → phone real
  try {
    const contactId = lid.includes("@") ? lid : `${lid}@lid`;
    const session = wahaSession || "default";
    const data = await wahaService.request("GET", `/api/contacts?session=${session}&contactId=${contactId}`);
    const realPhone = data?.number || data?.id?.replace(/@c\.us$/, "") || null;
    if (realPhone && realPhone !== lid) {
      lidPhoneCache.set(lid, { phone: realPhone, ts: Date.now() });
      saveLidMapping(lid, realPhone, tenantId);
      logger.info("[LID] ✅ Resolved via WAHA API", { lid, phone: realPhone, session });
      return realPhone;
    }
  } catch (err: any) {
    logger.warn("[LID] WAHA API resolution failed", { lid, error: err?.message }, "LID");
  }

  return null;
}

/** Salvar mapeamento LID→phone no Supabase (fire-and-forget) */
export function saveLidMapping(lid: string, phone: string, tenantId?: string): void {
  supabaseService.request("POST", "lid_phone_map", {
    body: {
      lid,
      phone,
      tenant_id: tenantId || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  }).catch(() => { /* tabela pode não existir */ });
}

/** Registrar mapeamento quando souber o phone real (ex: Z-API, landing) */
export function registerLidPhone(lid: string, phone: string, tenantId?: string): void {
  if (!lid || !phone) return;
  lidPhoneCache.set(lid, { phone, ts: Date.now() });
  saveLidMapping(lid, phone, tenantId);
}

/** Remove suffix @c.us / @g.us / @lid */
export function stripSuffix(id: string): string {
  return String(id || "").replace(/@(c\.us|g\.us|lid)$/g, "").trim();
}
