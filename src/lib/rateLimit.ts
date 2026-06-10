import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * Lightweight per-IP rate limiting for public API routes.
 *
 * Backed by Netlify Blobs — the same store mechanism already used by
 * /api/shorten — so counters are shared across serverless invocations
 * (in-memory counters don't work reliably on serverless).
 *
 * Design goals:
 *  - FAIL OPEN. If the store is unavailable (local dev, a Blobs hiccup), the
 *    request is always allowed. Rate limiting must NEVER block a real booking.
 *  - Additive. Generous defaults; ordinary human traffic never reaches them.
 *  - Fixed-window counter. Simple and cheap. Not perfectly atomic, which is
 *    fine for abuse mitigation (the goal is to blunt brute-force / flooding,
 *    not to be a precise quota system).
 */

export interface RateLimitConfig {
  /** Stable route name, e.g. "validate-code". Namespaces the counter. */
  key: string;
  /** Max requests allowed per window, per client IP. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the current window resets (meaningful when !ok). */
  retryAfter: number;
  limit: number;
  remaining: number;
}

/** Best-effort client IP extraction, Netlify-aware. */
export function getClientIp(req: NextRequest): string {
  // Netlify sets this to the real client IP.
  const nf = req.headers.get('x-nf-client-connection-ip');
  if (nf) return nf.trim();
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

export async function rateLimit(
  req: NextRequest,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const { key, limit, windowSec } = config;
  const windowMs = windowSec * 1000;
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const resetMs = (bucket + 1) * windowMs;
  const retryAfter = Math.max(1, Math.ceil((resetMs - now) / 1000));
  const ip = getClientIp(req);

  // Unknown IP → allow. Better than lumping every unidentifiable visitor into
  // one shared bucket and throttling them all together.
  if (ip === 'unknown') {
    return { ok: true, retryAfter, limit, remaining: limit };
  }

  try {
    // Lazy import so the module never throws at import time in environments
    // where Blobs isn't configured (e.g. `next dev` locally).
    const { getStore } = await import('@netlify/blobs');
    const store = getStore('rate-limits');
    const blobKey = `${key}:${ip}:${bucket}`;

    const existing = await store.get(blobKey);
    const count = existing ? parseInt(existing, 10) || 0 : 0;

    if (count >= limit) {
      return { ok: false, retryAfter, limit, remaining: 0 };
    }

    // Increment. Read-modify-write is not atomic, but acceptable here.
    await store.set(blobKey, String(count + 1));
    return { ok: true, retryAfter, limit, remaining: Math.max(0, limit - count - 1) };
  } catch (err) {
    // FAIL OPEN — never block a request because the limiter had a problem.
    console.warn('[rateLimit] store unavailable, allowing request:', (err as Error)?.message);
    return { ok: true, retryAfter, limit, remaining: limit };
  }
}

/** Standard 429 response. Pass extra headers (e.g. CORS) to merge in. */
export function rateLimitResponse(
  result: RateLimitResult,
  extraHeaders: Record<string, string> = {}
): NextResponse {
  return NextResponse.json(
    {
      error: 'rate_limited',
      reason: 'Too many requests. Please slow down and try again shortly.',
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfter),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        ...extraHeaders,
      },
    }
  );
}
