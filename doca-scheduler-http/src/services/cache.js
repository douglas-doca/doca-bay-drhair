/**
 * Cache Service — per-tenant slot caching
 * In-memory + JSON file backup
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || '/app/data';

class CacheService {
  constructor() {
    // { tenantId: { date: { data, timestamp } } }
    this._cache = {};
  }

  _key(tenantId, dateStr) {
    return `${tenantId}:${dateStr}`;
  }

  _filePath(tenantId) {
    const dir = path.join(DATA_DIR, tenantId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, 'cache.json');
  }

  get(tenantId, dateStr, maxAgeMs = 15 * 60 * 1000) {
    const entry = this._cache[this._key(tenantId, dateStr)];
    if (!entry) return null;
    if (Date.now() - entry.timestamp > maxAgeMs) return null;
    return entry.data;
  }

  set(tenantId, dateStr, data) {
    const key = this._key(tenantId, dateStr);
    this._cache[key] = { data, timestamp: Date.now() };

    // Persist to disk
    try {
      const fp = this._filePath(tenantId);
      let disk = {};
      if (fs.existsSync(fp)) {
        disk = JSON.parse(fs.readFileSync(fp, 'utf-8'));
      }
      disk[dateStr] = { data, timestamp: Date.now() };
      fs.writeFileSync(fp, JSON.stringify(disk, null, 2));
    } catch (err) {
      console.error(`⚠️ [Cache] Erro ao salvar disco ${tenantId}:`, err.message);
    }
  }

  invalidate(tenantId, dateStr) {
    delete this._cache[this._key(tenantId, dateStr)];
  }

  invalidateAll(tenantId) {
    for (const key of Object.keys(this._cache)) {
      if (key.startsWith(`${tenantId}:`)) {
        delete this._cache[key];
      }
    }
  }

  stats() {
    const entries = Object.keys(this._cache).length;
    const byTenant = {};
    for (const key of Object.keys(this._cache)) {
      const tenant = key.split(':')[0];
      byTenant[tenant] = (byTenant[tenant] || 0) + 1;
    }
    return { entries, byTenant };
  }
}

module.exports = new CacheService();
