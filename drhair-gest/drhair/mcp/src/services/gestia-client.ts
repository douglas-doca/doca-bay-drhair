/**
 * GestIA Client — TypeScript wrapper
 * Auth: JWT PS256 com cache de token
 * HTTP: fetch nativo + fallback curl
 *
 * Copiar auth.js e client.js do mcp-gestia/src/ para services/
 * OU usar este arquivo que combina ambos.
 */

import { SignJWT, importJWK } from "jose";
import { readFileSync } from "fs";

// ══════════════════════════════════════
//  Auth — JWT PS256
// ══════════════════════════════════════

class GestiaAuth {
  private privateJwkPath: string;
  private _token: string | null = null;
  private _tokenExp: number = 0;
  private _jwk: any = null;
  private _key: any = null;

  constructor(privateJwkPath: string) {
    this.privateJwkPath = privateJwkPath;
  }

  private async loadKey(): Promise<void> {
    if (this._key) return;
    this._jwk = JSON.parse(readFileSync(this.privateJwkPath, "utf8"));
    this._key = await importJWK(this._jwk, "PS256");
  }

  async getToken(): Promise<string> {
    // Renova 5 min antes de expirar
    if (this._token && Date.now() < this._tokenExp - 300_000) {
      return this._token;
    }

    await this.loadKey();

    this._token = await new SignJWT({ sub: "DOCA" })
      .setProtectedHeader({ alg: "PS256", kid: this._jwk.kid, typ: "JWT" })
      .setIssuedAt()
      .setNotBefore(Math.floor(Date.now() / 1000))
      .setExpirationTime("24h")
      .sign(this._key);

    this._tokenExp = Date.now() + 23 * 3600 * 1000;
    console.log("[gestia-auth] JWT renovado");
    return this._token;
  }
}

// ══════════════════════════════════════
//  HTTP Client
// ══════════════════════════════════════

interface GestiaClientOptions {
  baseUrl: string;
  privateJwkPath: string;
  userId?: number;
}

interface FetchOptions {
  method?: string;
  body?: Record<string, unknown> | null;
  unitId: number;
}

export class GestiaClient {
  private baseUrl: string;
  private userId: number;
  private auth: GestiaAuth;

  constructor({ baseUrl, privateJwkPath, userId = 53 }: GestiaClientOptions) {
    this.baseUrl = baseUrl;
    this.userId = userId;
    this.auth = new GestiaAuth(privateJwkPath);
  }

  async fetch(endpoint: string, opts: FetchOptions): Promise<unknown> {
    const { method = "GET", body = null, unitId } = opts;
    if (!unitId) throw new Error("unitId obrigatório");

    const token = await this.auth.getToken();
    const url = `${this.baseUrl}${endpoint}`;

    const fetchOpts: RequestInit = {
      method,
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
        UnitId: String(unitId),
        UserId: String(this.userId),
      },
    };
    if (body) fetchOpts.body = JSON.stringify(body);

    try {
      const res = await globalThis.fetch(url, fetchOpts);
      const text = await res.text();

      if (!res.ok) {
        let errorMsg = `GestIA ${res.status}`;
        try {
          errorMsg = JSON.parse(text).errorMessage || errorMsg;
        } catch {}
        return { ok: false, status: res.status, error: errorMsg };
      }

      return this.parseResponse(text);
    } catch (err: any) {
      console.error(`[gestia-client] fetch failed: ${err.message}`);
      return { ok: false, error: `fetch failed: ${err.message}` };
    }
  }

  private parseResponse(text: string): unknown {
    try {
      return { ok: true, data: JSON.parse(text) };
    } catch {
      const num = Number(text.trim());
      if (!isNaN(num) && text.trim() !== "") return { ok: true, data: num };
      return { ok: true, data: text.trim() || true };
    }
  }
}