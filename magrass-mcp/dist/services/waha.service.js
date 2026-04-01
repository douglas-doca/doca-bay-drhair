// src/services/waha.service.ts
// ============================================
// WAHA Service - DOCA Performance
// ✅ WAHA Plus (2026.2.2) — endpoints corretos
// ✅ sendVoice com convert:true (Plus converte mp3→opus)
// ✅ sendFile para mídia genérica
// ✅ Auth via X-Api-Key em TODAS as requests
// ✅ Track bot message IDs (detectar intervenção humana)
// ✅ Suporta chatId @lid (RESOLVIDO PARA @c.us - Anti Limbo Multi-tenant)
// ✅ Sanitiza markdown para WhatsApp plain text
// ✅ Multi-tenant: session override por request
// ============================================
import { logger } from "../utils/logger.js";
// ─── BOT MESSAGE ID TRACKING ──────────────────────────
const BOT_SENT_IDS = new Map();
const BOT_ACTIVE_CHATS = new Map();
const BOT_SENT_TTL_MS = Number(process.env.WAHA_BOT_SENT_TTL_MS || 10 * 60 * 1000);
const BOT_ACTIVE_TTL_MS = 30_000;
function cleanupBotIds() {
    const now = Date.now();
    for (const [id, ts] of BOT_SENT_IDS.entries()) {
        if (now - ts > BOT_SENT_TTL_MS)
            BOT_SENT_IDS.delete(id);
    }
    for (const [chatId, ts] of BOT_ACTIVE_CHATS.entries()) {
        if (now - ts > BOT_ACTIVE_TTL_MS)
            BOT_ACTIVE_CHATS.delete(chatId);
    }
}
export function rememberBotSentId(id, chatId) {
    cleanupBotIds();
    const v = String(id || "").trim();
    if (v) {
        BOT_SENT_IDS.set(v, Date.now());
        if (v.includes("_"))
            BOT_SENT_IDS.set(v.split("_").pop(), Date.now());
    }
    const chat = String(chatId || "").trim();
    if (chat) {
        BOT_ACTIVE_CHATS.set(chat, Date.now());
        const phone = chat.replace(/@c\.us$|@lid$|@g\.us$/, "");
        if (phone && phone !== chat)
            BOT_ACTIVE_CHATS.set(phone, Date.now());
    }
}
export function isBotSentId(id, chatId) {
    cleanupBotIds();
    const v = String(id || "").trim();
    if (v && BOT_SENT_IDS.has(v))
        return true;
    if (v && v.includes("_") && BOT_SENT_IDS.has(v.split("_").pop()))
        return true;
    const chat = String(chatId || "").trim();
    if (chat && BOT_ACTIVE_CHATS.has(chat))
        return true;
    const phone = chat.replace(/@c\.us$|@lid$|@g\.us$/, "");
    if (phone && phone !== chat && BOT_ACTIVE_CHATS.has(phone))
        return true;
    return false;
}
// ─── SERVIÇO PRINCIPAL ─────────────────────────────────
export class WAHAService {
    config;
    constructor(config) {
        this.config = {
            baseUrl: config?.baseUrl || process.env.WAHA_BASE_URL || "http://localhost:3000",
            apiKey: config?.apiKey || process.env.WAHA_API_KEY || "",
            session: config?.session || process.env.WAHA_SESSION || "default",
            timeoutMs: config?.timeoutMs || 25_000,
            debug: config?.debug ?? (process.env.WAHA_DEBUG === "true"),
        };
        logger.agent("WAHA Service initialized", {
            baseUrl: this.config.baseUrl,
            session: this.config.session,
            apiKey: this.config.apiKey ? "***set***" : "⚠️ MISSING",
        });
    }
    // ─── HELPERS ───────────────────────────────────────
    resolveSession(override) {
        return override || this.config.session;
    }
    normalizeChatId(input) {
        const raw = String(input || "").trim();
        if (!raw)
            return raw;
        if (raw.includes("@c.us") || raw.includes("@g.us") || raw.includes("@lid"))
            return raw;
        const digits = raw.replace(/\D/g, "");
        return digits ? `${digits}@c.us` : raw;
    }
    async sleep(ms) {
        if (!ms || ms <= 0)
            return;
        await new Promise((r) => setTimeout(r, ms));
    }
    headers() {
        const h = { "Content-Type": "application/json" };
        if (this.config.apiKey)
            h["X-Api-Key"] = this.config.apiKey;
        return h;
    }
    async request(method, endpoint, body) {
        const url = `${this.config.baseUrl}${endpoint}`;
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), this.config.timeoutMs);
        try {
            if (this.config.debug) {
                const logBody = body ? JSON.parse(JSON.stringify(body)) : undefined;
                if (logBody?.file?.data && logBody.file.data.length > 80) {
                    logBody.file.data = logBody.file.data.substring(0, 80) + '...[truncated]';
                }
                logger.info('[WAHA] request', { method, url, body: logBody }, 'WAHA');
            }
            const res = await fetch(url, {
                method,
                headers: this.headers(),
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });
            const raw = await res.text();
            let data = null;
            try {
                data = raw ? JSON.parse(raw) : null;
            }
            catch {
                data = raw;
            }
            if (!res.ok) {
                logger.error("[WAHA] error response", { status: res.status, endpoint, data }, "WAHA");
                throw new Error(`WAHA ${method} ${endpoint} failed: ${res.status}`);
            }
            return data;
        }
        finally {
            clearTimeout(t);
        }
    }
    trackBotMessage(resp, chatId) {
        const msgId = resp?.id?._serialized || resp?._data?.id?._serialized || resp?._data?.id?.id || resp?.id?.id;
        rememberBotSentId(msgId, chatId);
    }
    sanitizeForWhatsApp(text) {
        return text
            .replace(/\*\*(.+?)\*\*/g, "$1")
            .replace(/\*(.+?)\*/g, "$1")
            .replace(/__(.+?)__/g, "$1")
            .replace(/~~(.+?)~~/g, "$1")
            .replace(/^[\s]*[-•·]\s+.+\n?/gm, "")
            .replace(/^[\s]*\d+\.\s+/gm, "")
            .replace(/#{1,6}\s+/g, "")
            .trim();
    }
    // ─── MENSAGENS DE TEXTO ────────────────────────────
    async sendMessage(payload) {
        let chatId = this.normalizeChatId(payload.chatId);
        const session = this.resolveSession(payload.session);
        // 💉 VACINA ATUALIZADA (Passa o "this" para usar a BaseURL correta do Tenant)
        if (chatId.includes('@lid')) {
            const resolvedPhone = await resolveLid(chatId, session, this);
            if (resolvedPhone) {
                chatId = `${resolvedPhone.replace(/\D/g, "")}@c.us`;
            }
        }
        const text = this.sanitizeForWhatsApp(String(payload.text || ""));
        if (!chatId || !text)
            return null;
        const resp = await this.request("POST", "/api/sendText", { session, chatId, text });
        this.trackBotMessage(resp, chatId);
        return resp;
    }
    // ─── VOICE NOTES (WAHA Plus) ──────────────────────
    async sendVoice(payload) {
        const chatId = this.normalizeChatId(payload.chatId);
        if (!chatId || !payload.audioSource)
            return null;
        const mimetype = payload.mimetype || "audio/mpeg";
        const convert = payload.convert !== false;
        const session = this.resolveSession(payload.session);
        const isBase64 = payload.audioSource.startsWith("data:") || !payload.audioSource.startsWith("http");
        let file;
        if (isBase64) {
            const raw = payload.audioSource.replace(/^data:[^;]+;base64,/, "");
            file = { mimetype, data: raw };
        }
        else {
            file = { mimetype, url: payload.audioSource };
        }
        const resp = await this.request("POST", "/api/sendVoice", { session, chatId, file, convert });
        this.trackBotMessage(resp, chatId);
        logger.info("[WAHA] ✅ voice note sent", { chatId, session, convert, mimetype }, "WAHA");
        return resp;
    }
    async sendVoiceBuffer(chatId, audioBuffer, mimetype, session) {
        return this.sendVoice({
            chatId,
            audioSource: audioBuffer.toString("base64"),
            mimetype: mimetype || "audio/mpeg",
            convert: true,
            session,
        });
    }
    // ─── MÍDIA (imagens, vídeos, documentos) ───────────
    async sendMedia(payload) {
        const chatId = this.normalizeChatId(payload.chatId);
        if (!chatId || !payload.mediaUrl)
            return null;
        const session = this.resolveSession(payload.session);
        const body = { session, chatId, file: { url: payload.mediaUrl } };
        if (payload.caption)
            body.caption = payload.caption;
        const resp = await this.request("POST", "/api/sendFile", body);
        this.trackBotMessage(resp, chatId);
        return resp;
    }
    async sendImage(chatId, imageUrl, caption, session) {
        return this.sendMedia({ chatId, mediaUrl: imageUrl, caption, session });
    }
    async sendFile(payload) {
        const chatId = this.normalizeChatId(payload.chatId);
        if (!chatId || !payload.fileSource)
            return null;
        const session = this.resolveSession(payload.session);
        const isBase64 = !payload.fileSource.startsWith("http");
        let file;
        if (isBase64) {
            const raw = payload.fileSource.replace(/^data:[^;]+;base64,/, "");
            file = { mimetype: payload.mimetype || "application/octet-stream", filename: payload.filename || "file", data: raw };
        }
        else {
            file = { mimetype: payload.mimetype || "application/octet-stream", filename: payload.filename || "file", url: payload.fileSource };
        }
        const body = { session, chatId, file };
        if (payload.caption)
            body.caption = payload.caption;
        const resp = await this.request("POST", "/api/sendFile", body);
        this.trackBotMessage(resp, chatId);
        return resp;
    }
    // ─── DOWNLOAD DE MÍDIA (recebida) ─────────────────
    async downloadMedia(mediaUrl) {
        const url = mediaUrl.startsWith("http") ? mediaUrl : `${this.config.baseUrl}${mediaUrl}`;
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), this.config.timeoutMs);
        try {
            const res = await fetch(url, { headers: { "X-Api-Key": this.config.apiKey }, signal: controller.signal });
            if (!res.ok)
                throw new Error(`WAHA download failed: ${res.status} ${res.statusText}`);
            return Buffer.from(await res.arrayBuffer());
        }
        finally {
            clearTimeout(t);
        }
    }
    async downloadMediaById(messageId, session) {
        const s = this.resolveSession(session);
        const endpoint = `/api/${s}/messages/${messageId}/download`;
        const url = `${this.config.baseUrl}${endpoint}`;
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), this.config.timeoutMs);
        try {
            const res = await fetch(url, { headers: { "X-Api-Key": this.config.apiKey }, signal: controller.signal });
            if (!res.ok)
                throw new Error(`WAHA download by ID failed: ${res.status}`);
            return Buffer.from(await res.arrayBuffer());
        }
        finally {
            clearTimeout(t);
        }
    }
    // ─── CONSULTAS ─────────────────────────────────────
    async getMessages(chatId, limit = 20, session) {
        const to = this.normalizeChatId(chatId);
        const s = this.resolveSession(session);
        if (!to)
            return [];
        return this.request("GET", `/api/${s}/chats/${to}/messages?limit=${limit}`);
    }
    async checkNumber(phone, session) {
        const digits = String(phone || "").replace(/\D/g, "");
        const s = this.resolveSession(session);
        if (!digits)
            return { exists: false };
        return this.request("POST", "/api/contacts/check-exists", { session: s, phone: digits });
    }
    async lidToPhone(lid, session) {
        const s = this.resolveSession(session);
        try {
            const resp = await this.request("POST", "/api/contacts/lid-to-phone", { session: s, lid });
            return resp?.phone || null;
        }
        catch {
            return null;
        }
    }
    // ─── TYPING ────────────────────────────────────────
    async startTyping(chatId, session) {
        const to = this.normalizeChatId(chatId);
        const s = this.resolveSession(session);
        if (!to)
            return null;
        return this.request("POST", "/api/startTyping", { session: s, chatId: to });
    }
    async stopTyping(chatId, session) {
        const to = this.normalizeChatId(chatId);
        const s = this.resolveSession(session);
        if (!to)
            return null;
        return this.request("POST", "/api/stopTyping", { session: s, chatId: to });
    }
    async sendTypingFor(chatId, ms, session) {
        const to = this.normalizeChatId(chatId);
        const s = this.resolveSession(session);
        if (!to)
            return;
        try {
            await this.startTyping(to, s);
            await this.sleep(ms);
        }
        catch (err) {
            logger.warn("[WAHA] typingFor failed", { chatId: to, err }, "WAHA");
        }
        finally {
            try {
                await this.stopTyping(to, s);
            }
            catch { }
        }
    }
    // ─── MEDIA CONVERSION (WAHA Plus) ─────────────────
    async convertVoice(audioUrl, session) {
        const s = this.resolveSession(session);
        const endpoint = `/api/${s}/media/convert/voice`;
        const url = `${this.config.baseUrl}${endpoint}`;
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), this.config.timeoutMs);
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "X-Api-Key": this.config.apiKey, "Content-Type": "application/json", "Accept": "audio/ogg; codecs=opus" },
                body: JSON.stringify({ url: audioUrl }),
                signal: controller.signal,
            });
            if (!res.ok)
                throw new Error(`WAHA voice convert failed: ${res.status}`);
            return Buffer.from(await res.arrayBuffer());
        }
        finally {
            clearTimeout(t);
        }
    }
    // ─── SESSION MANAGEMENT ────────────────────────────
    async getSessionStatus() {
        return this.request("GET", `/api/sessions?all=true`);
    }
    async restartSession(session) {
        const s = this.resolveSession(session);
        return this.request("POST", `/api/sessions/${s}/restart`);
    }
    // ─── PLAN EXECUTOR (Humanizer V3) ─────────────────
    async sendPlanV3(chatId, items, session) {
        let to = this.normalizeChatId(chatId);
        const s = this.resolveSession(session);
        // 💉 VACINA ATUALIZADA (Passa o "this" para usar a BaseURL correta do Tenant)
        if (to.includes('@lid')) {
            const resolvedPhone = await resolveLid(to, s, this);
            if (resolvedPhone) {
                to = `${resolvedPhone.replace(/\D/g, "")}@c.us`;
            }
        }
        if (!to || !items?.length)
            return;
        const safeItems = items.slice(0, 20);
        rememberBotSentId(null, to);
        logger.agent("[WAHA] sendPlanV3", { chatId: to, session: s, items: safeItems.length });
        for (const item of safeItems) {
            try {
                if (item.type === "typing") {
                    if (item.action === "start")
                        await this.startTyping(to, s);
                    else
                        await this.stopTyping(to, s);
                    if (item.delayMs)
                        await this.sleep(item.delayMs);
                    continue;
                }
                if (item.type === "text") {
                    const text = String(item.text || "").trim();
                    if (text)
                        await this.sendMessage({ chatId: to, text, session: s });
                    if (item.delayMs)
                        await this.sleep(item.delayMs);
                    continue;
                }
            }
            catch (err) {
                logger.warn("[WAHA] plan item failed", { chatId: to, item, err }, "WAHA");
            }
        }
        try {
            await this.stopTyping(to, s);
        }
        catch { }
    }
    // ─── GETTERS ───────────────────────────────────────
    getConfig() { return { ...this.config }; }
    getBaseUrl() { return this.config.baseUrl; }
    getApiKey() { return this.config.apiKey; }
    getSession() { return this.config.session; }
}
// ─── SINGLETON ─────────────────────────────────────────
const GLOBAL_KEY = "__DOCA_WAHA_SINGLETON__";
const g = globalThis;
if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new WAHAService();
}
export const wahaService = g[GLOBAL_KEY];
// ============================================
// MULTI-TENANT WAHA — instância por baseUrl
// ============================================
const tenantWahaInstances = new Map();
export function getWahaForBaseUrl(baseUrl, apiKey) {
    if (!baseUrl)
        return wahaService;
    let instance = tenantWahaInstances.get(baseUrl);
    if (!instance) {
        instance = new WAHAService({ baseUrl, apiKey: apiKey || undefined });
        tenantWahaInstances.set(baseUrl, instance);
        console.error("[WAHA] New instance for", baseUrl);
    }
    return instance;
}
// ============================================
// LID RESOLVER — Resolve LID → phone real via WAHA API
// ============================================
const lidCache = new Map();
const LID_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h
// 💉 ALTERAÇÃO CHAVE AQUI: A função agora aceita a instância correta (wahaInstance)
export async function resolveLid(lid, session, wahaInstance = wahaService) {
    const key = `${session}:${lid}`;
    const cached = lidCache.get(key);
    if (cached && Date.now() - cached.ts < LID_CACHE_TTL)
        return cached.phone;
    // Se parece número de telefone brasileiro, retorna direto
    if (/^55\d{2}\d{8,9}$/.test(lid)) {
        logger.info("[WAHA LID] Phone number detected as LID, using directly", { lid });
        lidCache.set(key, { phone: lid, ts: Date.now() });
        return lid;
    }
    try {
        const contactId = lid.includes("@") ? lid : `${lid}@lid`;
        // Usa a wahaInstance passada pela Vacina em vez do singleton global
        const data = await wahaInstance.request("GET", `/api/contacts?session=${session}&contactId=${contactId}`);
        const phone = data?.number || data?.id?.replace(/@c\.us$/, "") || null;
        if (phone && phone !== lid) {
            lidCache.set(key, { phone, ts: Date.now() });
            logger.info("[WAHA LID] Resolved", { lid, phone, session });
            return phone;
        }
        return null;
    }
    catch (err) {
        logger.warn("[WAHA LID] Resolve failed", { lid, session, error: err?.message });
        return null;
    }
}
//# sourceMappingURL=waha.service.js.map