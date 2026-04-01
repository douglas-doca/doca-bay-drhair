// src/utils/settings-helper.ts
// ============================================
// Helper para settings do Supabase
// ============================================

import { supabaseService } from "../services/supabase.service.js";
import { responseAgent } from "../services/response.agent.js";

export const SETTINGS_KEYS = {
  agentPrompt: "agent_prompt",
  humanizerConfig: "agent_humanizer_config",
  agentEnabled: "agent_enabled",
} as const;

export async function getSetting(key: string, tenantId?: string | null): Promise<any | null> {
  const tenantFilter = tenantId
    ? `key=eq.${key}&tenant_id=eq.${tenantId}`
    : `key=eq.${key}&tenant_id=is.null`;
  const result = await supabaseService.request<any[]>("GET", "settings", { query: tenantFilter });
  if (result && result[0]) return result[0];
  return null;
}

export async function upsertSetting(key: string, value: any, tenantId?: string | null): Promise<boolean> {
  const now = new Date().toISOString();
  const tenantFilter = tenantId
    ? `key=eq.${key}&tenant_id=eq.${tenantId}`
    : `key=eq.${key}&tenant_id=is.null`;
  const existing = await supabaseService.request<any[]>("GET", "settings", { query: tenantFilter });
  if (existing && existing.length > 0) {
    const patched = await supabaseService.request("PATCH", "settings", {
      query: tenantFilter,
      body: { value, updated_at: now },
    });
    return !!patched;
  }
  const created = await supabaseService.request("POST", "settings", {
    body: { key, value, tenant_id: tenantId || null, created_at: now, updated_at: now },
  });
  return !!created;
}

export function getDefaultHumanizerConfig() {
  const h = (responseAgent as any)?.config?.humanizer || {
    maxBubbles: 5,
    maxSentencesPerBubble: 4,
    maxEmojiPerBubble: 3,
    bubbleCharSoftLimit: 220,
    bubbleCharHardLimit: 420,
    delay: {
      base: 420, perChar: 14, cap: 1650,
      anxiousMultiplier: 0.65, skepticalMultiplier: 1.15,
      frustratedMultiplier: 1.0, excitedMultiplier: 0.9,
    },
    stageBehavior: {
      cold: { maxBubbles: 4, requireQuestion: false, ctaLevel: "soft" },
      warm: { maxBubbles: 5, requireQuestion: false, ctaLevel: "medium" },
      hot: { maxBubbles: 5, requireQuestion: false, ctaLevel: "hard" },
    },
    saveChunksToDB: true,
    saveTypingChunks: true,
  };
  return { version: "v4", humanizer: h, updated_at: new Date().toISOString() };
}

export function splitIntoBubbles(text: string, maxBubbles: number = 2): string[] {
  let parts = text.split(/\n\n+/).map((p: string) => p.trim()).filter(Boolean);
  if (parts.length === 1) {
    const sentences = text.match(/[^.!?]+[.!?]+/g);
    if (sentences && sentences.length > 1) {
      parts = [];
      let current = "";
      for (const sentence of sentences) {
        if (current && (current + sentence).length > 120) {
          parts.push(current.trim());
          current = sentence;
        } else {
          current += sentence;
        }
      }
      if (current.trim()) parts.push(current.trim());
    }
  }
  if (parts.length > maxBubbles) {
    const limited = parts.slice(0, maxBubbles - 1);
    limited.push(parts.slice(maxBubbles - 1).join(" "));
    return limited;
  }
  return parts.length > 0 ? parts : [text];
}
