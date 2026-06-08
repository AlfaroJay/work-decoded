import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxies legal pages from the Squarespace marketing site so the intake form
 * can show them inline in a modal (cross-origin iframe is blocked by
 * Squarespace's X-Frame-Options: SAMEORIGIN).
 *
 * Returns the article HTML stripped of Squarespace chrome, so the intake form
 * stays the single source of truth for *styling* while Squarespace remains
 * the single source of truth for legal *content*.
 */

// Allowlist of legal page slugs we'll proxy. Anything else returns 404.
const ALLOWED_SLUGS: Record<string, { url: string; title: string }> = {
  'privacy-policy': {
    url: 'https://www.workdecodedhq.com/privacy-policy',
    title: 'Privacy Policy',
  },
  'client-services-agreement': {
    url: 'https://www.workdecodedhq.com/client-services-agreement',
    title: 'Client Services Agreement',
  },
};

// Cache the upstream HTML for 10 minutes per slug to avoid hammering Squarespace
// and to keep modal opens fast.
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { fetchedAt: number; html: string; title: string }>();

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const meta = ALLOWED_SLUGS[slug];
  if (!meta) {
    return NextResponse.json({ error: 'Unknown legal page' }, { status: 404 });
  }

  const cached = cache.get(slug);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({ title: cached.title, html: cached.html });
  }

  let upstream: Response;
  try {
    upstream = await fetch(meta.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (work-decoded legal proxy)' },
      // Don't pass cookies / auth — these are public pages
    });
  } catch {
    return NextResponse.json(
      { error: 'Could not reach legal source' },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Upstream returned ${upstream.status}` },
      { status: 502 }
    );
  }

  const fullHtml = await upstream.text();
  const cleaned = extractArticleHtml(fullHtml, meta.title);

  cache.set(slug, { fetchedAt: Date.now(), html: cleaned, title: meta.title });
  return NextResponse.json({ title: meta.title, html: cleaned });
}

/**
 * Pull just the legal-text content out of a full Squarespace page.
 *
 * Strategy: every Squarespace HTML/markdown block is wrapped in
 * `<div class="sqs-block-content">…</div>`. We find each one, strip embedded
 * <style> / <script> / <link> tags, and concatenate them. We then strip out
 * leftover Squarespace `class`/`id`/`data-*` attributes and inline styles so
 * the intake form's own CSS controls the look.
 */
function extractArticleHtml(fullHtml: string, fallbackTitle: string): string {
  // Grab every .sqs-block-content block (non-greedy, balanced enough for our needs).
  const blockRe = /<div\b[^>]*class="[^"]*\bsqs-block-content\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(fullHtml)) !== null) {
    matches.push(m[1]);
  }

  // Fall back to a coarser <article> grab if we found nothing.
  let raw = matches.join('\n');
  if (!raw.trim()) {
    const articleMatch = fullHtml.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
    raw = articleMatch ? articleMatch[1] : '';
  }

  // Strip <style>, <script>, <link>, <noscript> blocks
  raw = raw
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '')
    .replace(/<link\b[^>]*>/gi, '');

  // Drop class, id, style, and data-* attrs so the intake form CSS owns styling
  raw = raw
    .replace(/\s+class="[^"]*"/g, '')
    .replace(/\s+id="[^"]*"/g, '')
    .replace(/\s+style="[^"]*"/g, '')
    .replace(/\s+data-[a-z0-9-]+="[^"]*"/gi, '');

  // Clean up runs of whitespace
  raw = raw.replace(/\n{3,}/g, '\n\n').trim();

  if (!raw) {
    return `<p>Could not load ${fallbackTitle}. Please use the link below to view it on the website.</p>`;
  }
  return raw;
}
