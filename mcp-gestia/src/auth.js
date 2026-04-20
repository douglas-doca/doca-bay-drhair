/**
 * GestIA Auth — JWT PS256
 * Token cache com renovação automática
 */
const { SignJWT, importJWK } = require("jose");
const fs = require("fs");
const path = require("path");

class GestiaAuth {
  constructor(privateJwkPath) {
    this.privateJwkPath = privateJwkPath;
    this._token = null;
    this._tokenExp = 0;
    this._jwk = null;
    this._key = null;
  }

  async _loadKey() {
    if (this._key) return;
    this._jwk = JSON.parse(fs.readFileSync(this.privateJwkPath, "utf8"));
    this._key = await importJWK(this._jwk, "PS256");
  }

  async getToken() {
    // Renova 5 min antes de expirar
    if (this._token && Date.now() < this._tokenExp - 300_000) {
      return this._token;
    }

    await this._loadKey();

    this._token = await new SignJWT({ sub: "DOCA" })
      .setProtectedHeader({ alg: "PS256", kid: this._jwk.kid, typ: "JWT" })
      .setIssuedAt()
      .setNotBefore(Math.floor(Date.now() / 1000))
      .setExpirationTime("24h")
      .sign(this._key);

    this._tokenExp = Date.now() + 23 * 3600 * 1000;
    console.log("[auth] JWT renovado");
    return this._token;
  }
}

module.exports = { GestiaAuth };
