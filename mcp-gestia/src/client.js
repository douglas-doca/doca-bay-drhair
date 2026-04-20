/**
 * GestIA HTTP Client
 * Produção: usa fetch nativo (Node 18+)
 * Fallback: curl via execSync (se DNS não resolver)
 */
const { GestiaAuth } = require("./auth");
const { execSync } = require("child_process");

const USE_CURL = process.env.GESTIA_USE_CURL === "true";

class GestiaClient {
  constructor({ baseUrl, privateJwkPath, userId = 53 }) {
    this.baseUrl = baseUrl;
    this.userId = userId;
    this.auth = new GestiaAuth(privateJwkPath);
  }

  async fetch(endpoint, { method = "GET", body = null, unitId } = {}) {
    if (!unitId) throw new Error("unitId obrigatório");
    const token = await this.auth.getToken();
    const url = `${this.baseUrl}${endpoint}`;

    if (USE_CURL) {
      return this._fetchCurl(url, method, token, unitId, body);
    }
    return this._fetchNative(url, method, token, unitId, body);
  }

  async _fetchNative(url, method, token, unitId, body) {
    const options = {
      method,
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
        UnitId: String(unitId),
        UserId: String(this.userId),
      },
    };
    if (body) options.body = JSON.stringify(body);

    try {
      const res = await globalThis.fetch(url, options);
      const text = await res.text();

      if (!res.ok) {
        let errorMsg = `GestIA ${res.status}`;
        try { errorMsg = JSON.parse(text).errorMessage || errorMsg; } catch {}
        return { ok: false, status: res.status, error: errorMsg };
      }

      return this._parseResponse(text);
    } catch (err) {
      console.warn(`[client] fetch falhou (${err.message}), tentando curl...`);
      return this._fetchCurl(url, method, token, unitId, body);
    }
  }

  _fetchCurl(url, method, token, unitId, body) {
    const args = [
      `curl -s --max-time 20 -X ${method}`,
      `-H "Authorization: ${token}"`,
      `-H "Content-Type: application/json"`,
      `-H "UnitId: ${unitId}"`,
      `-H "UserId: ${this.userId}"`,
      `-w "\\n__HTTP__%{http_code}"`,
    ];
    if (body) {
      args.push(`-d '${JSON.stringify(body).replace(/'/g, "'\\''")}'`);
    }
    args.push(`"${url}"`);

    try {
      const output = execSync(args.join(" "), { shell: true, encoding: "utf8", timeout: 25000 });
      const lines = output.trim().split("\n");
      const httpLine = lines.find((l) => l.startsWith("__HTTP__"));
      const statusCode = httpLine ? parseInt(httpLine.replace("__HTTP__", "")) : 0;
      const responseBody = lines.filter((l) => !l.startsWith("__HTTP__")).join("\n").trim();

      if (statusCode >= 400 || statusCode === 0) {
        let errorMsg = `GestIA ${statusCode}`;
        try { errorMsg = JSON.parse(responseBody).errorMessage || errorMsg; } catch {}
        return { ok: false, status: statusCode, error: errorMsg };
      }

      return this._parseResponse(responseBody);
    } catch (e) {
      return { ok: false, error: `curl failed: ${e.message}` };
    }
  }

  _parseResponse(text) {
    try {
      return { ok: true, data: JSON.parse(text) };
    } catch {
      const num = Number(text.trim());
      if (!isNaN(num) && text.trim() !== "") return { ok: true, data: num };
      return { ok: true, data: text.trim() || true };
    }
  }
}

module.exports = { GestiaClient };
