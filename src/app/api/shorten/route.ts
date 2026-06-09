import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@netlify/blobs';
import { rateLimit, rateLimitResponse } from '@/lib/rateLimit';

/**
 * URL Shortener — POST endpoint.
 *
 * Creates a short link of the form https://l.workdecodedhq.com/{slug} that
 * 302-redirects to the original URL when visited. Backed by Netlify Blobs
 * (no external DB).
 *
 * Used by the SMS flow (Zapier → Twilio) to fit Google Meet links inside
 * the 160-char SMS limit, and to give the consultant the same trackable
 * link the client receives.
 *
 * Auth: requires `Authorization: Bearer <SHORTENER_API_KEY>` header.
 *
 * Request:
 *   POST /api/shorten
 *   { url: string, sessionId?: string, consultantId?: string, label?: string }
 *
 * Response:
 *   { shortUrl: string, slug: string }
 */

const STORE_NAME = 'shortlinks';
const SHORT_DOMAIN = 'l.workdecodedhq.com';
const SLUG_LENGTH = 7;
// Crockford-ish alphabet — no 0/O/1/I/L to avoid eyeball mistakes when
// someone reads a short link off paper.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

function generateSlug(length = SLUG_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

function unauthorized(reason: string) {
  return NextResponse.json({ error: reason }, { status: 401, headers: CORS });
}

function authOk(req: NextRequest): boolean {
  const expected = process.env.SHORTENER_API_KEY;
  if (!expected) return false;
  const header = req.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return false;
  const token = header.slice(7).trim();
  // Constant-time compare
  if (token.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

interface ShortLinkRecord {
  url: string;
  sessionId?: string;
  consultantId?: string;
  label?: string;
  createdAt: number;
  clicks: number;
}

export async function POST(req: NextRequest) {
  // Rate limit (defense in depth — this route is already bearer-authed).
  const rl = await rateLimit(req, { key: 'shorten', limit: 60, windowSec: 60 });
  if (!rl.ok) return rateLimitResponse(rl, CORS);

  if (!process.env.SHORTENER_API_KEY) {
    console.error('[Shorten] SHORTENER_API_KEY not configured');
    return NextResponse.json(
      { error: 'Server not configured' },
      { status: 500, headers: CORS }
    );
  }
  if (!authOk(req)) return unauthorized('Invalid or missing bearer token');

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Body must be JSON' },
      { status: 400, headers: CORS }
    );
  }

  const url = (body?.url || '').toString().trim();
  if (!url) {
    return NextResponse.json(
      { error: 'Missing required field: url' },
      { status: 400, headers: CORS }
    );
  }
  // Basic URL validation — must be http(s)
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('non-http');
    }
  } catch {
    return NextResponse.json(
      { error: 'url must be a valid http(s) URL' },
      { status: 400, headers: CORS }
    );
  }

  const store = getStore(STORE_NAME);

  // Generate slug + retry once if there's a collision (extremely unlikely
  // with 32^7 = ~34B keyspace, but cheap insurance).
  let slug = generateSlug();
  const existing = await store.get(slug);
  if (existing) slug = generateSlug();

  const record: ShortLinkRecord = {
    url,
    sessionId: body?.sessionId?.toString().trim() || undefined,
    consultantId: body?.consultantId?.toString().trim() || undefined,
    label: body?.label?.toString().trim() || undefined,
    createdAt: Date.now(),
    clicks: 0,
  };

  await store.setJSON(slug, record);

  return NextResponse.json(
    {
      slug,
      shortUrl: `https://${SHORT_DOMAIN}/${slug}`,
    },
    { status: 201, headers: CORS }
  );
}

/**
 * GET /api/shorten?slug=xxx — admin lookup of a short link's metadata.
 * Same bearer-token auth as POST. Returns the stored record + click count.
 */
export async function GET(req: NextRequest) {
  // Rate limit (defense in depth — this route is already bearer-authed).
  const rl = await rateLimit(req, { key: 'shorten-get', limit: 60, windowSec: 60 });
  if (!rl.ok) return rateLimitResponse(rl, CORS);

  if (!authOk(req)) return unauthorized('Invalid or missing bearer token');

  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) {
    return NextResponse.json(
      { error: 'Missing required query param: slug' },
      { status: 400, headers: CORS }
    );
  }

  const store = getStore(STORE_NAME);
  const data = await store.get(slug, { type: 'json' });
  if (!data) {
    return NextResponse.json(
      { error: 'Slug not found' },
      { status: 404, headers: CORS }
    );
  }

  return NextResponse.json({ slug, ...data }, { headers: CORS });
}
