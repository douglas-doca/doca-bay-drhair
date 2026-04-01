// ============================================
// DOCA-OCTA — Rate Limiter (Redis-backed)
// ✅ Persiste entre restarts
// ✅ INCR + EXPIRE via redisService.incr()
// ✅ Fallback in-memory se Redis offline
// ============================================

import { redisService } from '../services/redis.service.js';

interface RateLimitConfig {
  windowSec: number;
  maxRequests: number;
}

const memoryLimits = new Map<string, { count: number; resetAt: number }>();

class RateLimiter {
  private configs: Record<string, RateLimitConfig> = {
    ip:      { windowSec: 60, maxRequests: 100 },
    webhook: { windowSec: 60, maxRequests: 500 },
    tenant:  { windowSec: 60, maxRequests: 3000 },
    phone:   { windowSec: 60, maxRequests: 30 },
    public:  { windowSec: 60, maxRequests: 20 },
  };

  async isAllowed(key: string, type: string = 'ip'): Promise<{
    allowed: boolean;
    remaining: number;
    resetIn: number;
  }> {
    const config = this.configs[type] || this.configs.ip;
    const fullKey = `rl:${type}:${key}`;

    // Redis incr já faz EXPIRE no primeiro hit
    const count = await redisService.incr(fullKey, config.windowSec);

    if (count > 0) {
      // Redis funcionou
      const remaining = Math.max(0, config.maxRequests - count);
      return {
        allowed: count <= config.maxRequests,
        remaining,
        resetIn: config.windowSec * 1000,
      };
    }

    // Fallback in-memory (Redis offline, incr retornou 0)
    return this.memoryFallback(fullKey, config);
  }

  private memoryFallback(key: string, config: RateLimitConfig) {
    const now = Date.now();
    let entry = memoryLimits.get(key);

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + config.windowSec * 1000 };
    }

    entry.count++;
    memoryLimits.set(key, entry);

    return {
      allowed: entry.count <= config.maxRequests,
      remaining: Math.max(0, config.maxRequests - entry.count),
      resetIn: Math.max(0, entry.resetAt - now),
    };
  }
}

// Cleanup memory fallback every 5min
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of memoryLimits) {
    if (now > v.resetAt) memoryLimits.delete(k);
  }
}, 5 * 60 * 1000);

export const rateLimiter = new RateLimiter();
