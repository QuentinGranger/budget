// ============================================================================
// Rate Limiting — Multi-backend with safe IP extraction
// ============================================================================
// Supports:
//   1. Upstash Redis (production, multi-instance) — when UPSTASH_REDIS_REST_URL is set
//   2. In-memory with automatic cleanup (dev / single-instance fallback)
//
// Also exports getClientIp() for safe, spoof-resistant IP extraction.

import { NextRequest } from 'next/server';

// ---- Safe IP Extraction (M6) ----
// In production behind a reverse proxy (Vercel, Cloudflare, Nginx),
// x-forwarded-for can be spoofed by the client. We take the LAST IP in the
// chain (the one appended by the trusted proxy), not the first.
// If TRUSTED_PROXY_COUNT is set, we use it to pick the correct IP.
// Fallback: first IP from x-forwarded-for (dev), then x-real-ip, then 'unknown'.

const TRUSTED_PROXY_COUNT = parseInt(process.env.TRUSTED_PROXY_COUNT || '0', 10);

export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');

  if (xff) {
    const ips = xff.split(',').map((ip) => ip.trim()).filter(Boolean);

    if (TRUSTED_PROXY_COUNT > 0 && ips.length >= TRUSTED_PROXY_COUNT) {
      // Take the IP just before the trusted proxies
      // e.g. TRUSTED_PROXY_COUNT=1 with "client, proxy" → take "client"
      return ips[ips.length - TRUSTED_PROXY_COUNT] || ips[0] || 'unknown';
    }

    // Dev / no trusted proxy configured: use first IP (client-reported)
    return ips[0] || 'unknown';
  }

  // Fallback headers
  return req.headers.get('x-real-ip') || 'unknown';
}

// ---- Rate Limiter Interface ----

interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

interface RateLimiterConfig {
  windowMs: number;
  maxRequests: number;
}

interface RateLimiter {
  check(key: string): Promise<RateLimitResult>;
}

// ---- In-Memory Rate Limiter with Cleanup (M5) ----

class MemoryRateLimiter implements RateLimiter {
  private map = new Map<string, { count: number; resetAt: number }>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private static readonly CLEANUP_INTERVAL_MS = 60_000; // 1 minute
  private static readonly MAX_ENTRIES = 10_000; // Hard cap to prevent unbounded growth

  constructor(config: RateLimiterConfig) {
    this.windowMs = config.windowMs;
    this.maxRequests = config.maxRequests;
    this.startCleanup();
  }

  async check(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const entry = this.map.get(key);

    if (!entry || now > entry.resetAt) {
      this.map.set(key, { count: 1, resetAt: now + this.windowMs });
      this.evictIfNeeded();
      return { allowed: true, retryAfterMs: 0 };
    }

    entry.count++;
    if (entry.count > this.maxRequests) {
      return { allowed: false, retryAfterMs: entry.resetAt - now };
    }

    return { allowed: true, retryAfterMs: 0 };
  }

  private startCleanup() {
    // Avoid duplicate timers
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.map) {
        if (now > entry.resetAt) {
          this.map.delete(key);
        }
      }
    }, MemoryRateLimiter.CLEANUP_INTERVAL_MS);
    // Don't block process exit
    if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      this.cleanupTimer.unref();
    }
  }

  private evictIfNeeded() {
    if (this.map.size <= MemoryRateLimiter.MAX_ENTRIES) return;
    // Evict oldest entries
    const now = Date.now();
    for (const [key, entry] of this.map) {
      if (this.map.size <= MemoryRateLimiter.MAX_ENTRIES * 0.8) break;
      if (now > entry.resetAt) {
        this.map.delete(key);
      }
    }
    // If still over, evict by insertion order
    if (this.map.size > MemoryRateLimiter.MAX_ENTRIES) {
      const toDelete = this.map.size - Math.floor(MemoryRateLimiter.MAX_ENTRIES * 0.8);
      let deleted = 0;
      for (const key of this.map.keys()) {
        if (deleted >= toDelete) break;
        this.map.delete(key);
        deleted++;
      }
    }
  }
}

// ---- Upstash Redis Rate Limiter (M4) ----

let upstashLimiter: RateLimiter | null = null;

async function getUpstashLimiter(config: RateLimiterConfig): Promise<RateLimiter | null> {
  if (upstashLimiter) return upstashLimiter;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const { Redis } = await import('@upstash/redis');
    const { Ratelimit } = await import('@upstash/ratelimit');

    const redis = new Redis({ url, token });
    const limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(config.maxRequests, `${Math.round(config.windowMs / 1000)} s`),
      analytics: false,
      prefix: 'capbudget:rl',
    });

    const wrapper: RateLimiter = {
      async check(key: string): Promise<RateLimitResult> {
        const result = await limiter.limit(key);
        return {
          allowed: result.success,
          retryAfterMs: result.success ? 0 : Math.max(0, result.reset - Date.now()),
        };
      },
    };

    upstashLimiter = wrapper;
    return wrapper;
  } catch (err) {
    console.warn('[RATE-LIMIT] Failed to init Upstash Redis, falling back to in-memory:', err);
    return null;
  }
}

// ---- Factory ----

const memoryLimiters = new Map<string, MemoryRateLimiter>();

function getMemoryLimiter(name: string, config: RateLimiterConfig): MemoryRateLimiter {
  let limiter = memoryLimiters.get(name);
  if (!limiter) {
    limiter = new MemoryRateLimiter(config);
    memoryLimiters.set(name, limiter);
  }
  return limiter;
}

// ---- Public API ----

const AUTH_CONFIG: RateLimiterConfig = {
  windowMs: 60_000,     // 1 minute
  maxRequests: 10,
};

const TOTP_CONFIG: RateLimiterConfig = {
  windowMs: 5 * 60_000, // 5 minutes
  maxRequests: 5,
};

/**
 * Rate-limit auth endpoints (login, register, forgot-password, reset-password).
 * Uses Redis in production if available, falls back to in-memory.
 */
export async function checkAuthRateLimit(key: string): Promise<RateLimitResult> {
  const redis = await getUpstashLimiter(AUTH_CONFIG);
  if (redis) return redis.check(`auth:${key}`);
  return getMemoryLimiter('auth', AUTH_CONFIG).check(key);
}

/**
 * Rate-limit TOTP verification (per-user, stricter).
 * Uses Redis in production if available, falls back to in-memory.
 */
export async function checkTotpRateLimit(key: string): Promise<RateLimitResult> {
  const redis = await getUpstashLimiter(TOTP_CONFIG);
  if (redis) return redis.check(`totp:${key}`);
  return getMemoryLimiter('totp', TOTP_CONFIG).check(key);
}
