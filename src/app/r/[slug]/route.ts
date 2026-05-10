import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@netlify/blobs';

/**
 * URL Shortener — slug landing endpoint.
 *
 * GET /r/{slug} — looks up the slug in Netlify Blobs and serves a branded
 * interstitial page that auto-launches the destination URL after ~3
 * seconds. Both consultant and client see the same Work Decoded page
 * before joining the Meet, which gives a brief branded moment that raw
 * meet.google.com links don't.
 *
 * The `l.workdecodedhq.com` subdomain proxies to /r/* via _redirects so
 * end users see https://l.workdecodedhq.com/{slug}.
 *
 * On unknown slug: returns 404 with a small HTML page so a misclicked
 * link doesn't show a JSON blob to a recipient.
 *
 * Robots: noindex on both the interstitial and the 404, so unique slugs
 * don't end up in search results.
 */

const STORE_NAME = 'shortlinks';

interface ShortLinkRecord {
  url: string;
  sessionId?: string;
  consultantId?: string;
  label?: string;
  createdAt: number;
  clicks: number;
}

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  // Don't let any cache (CDN, browser) keep this page — the destination
  // could change if a Meet link rotates. We want every click to re-resolve.
  'Cache-Control': 'no-store',
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function notFoundPage(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Link not found · Work Decoded</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Helvetica Neue',Arial,sans-serif;background:#1a1a1a;color:#e8e8e8;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1rem}
.box{max-width:480px;text-align:center}
.logo{font-size:24px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:1.5rem;color:#fff}
.logo .red{color:#e63946}
h1{font-size:22px;font-weight:600;margin:0 0 0.75rem;color:#fff}
p{font-size:14px;color:#999;line-height:1.6;margin:0 0 1rem}
a{color:#40c9a2;text-decoration:none}
a:hover{text-decoration:underline}
</style></head>
<body><div class="box">
<div class="logo">Work<span class="red">Decoded</span>HQ</div>
<h1>This link isn't valid</h1>
<p>It may have expired, been mistyped, or never existed. If you were sent this link by Work Decoded and need help reaching your session, please email <a href="mailto:support@workdecodedhq.com">support@workdecodedhq.com</a>.</p>
<p><a href="https://www.workdecodedhq.com">Visit workdecodedhq.com →</a></p>
</div></body></html>`;
}

function interstitialPage(destinationUrl: string, label?: string): string {
  const safeUrl = escapeHtml(destinationUrl);
  const safeLabel = escapeHtml(
    label ||
      'You’re moments away from your Work Decoded session. Have your notes ready and find a quiet space.'
  );
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Joining your session · Work Decoded</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta http-equiv="refresh" content="3;url=${safeUrl}">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Helvetica Neue',Arial,sans-serif;background:#1a1a1a;color:#e8e8e8;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1.5rem}
.card{max-width:520px;width:100%;background:#242424;border:1px solid #333;border-radius:14px;padding:2.25rem 2rem;text-align:center}
.logo{font-size:26px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#fff;margin-bottom:0.25rem}
.logo .red{color:#e63946}
.tagline{font-size:11px;color:#999;letter-spacing:0.4px;margin-bottom:1.75rem}
h1{font-size:20px;font-weight:600;color:#fff;margin:0 0 0.75rem}
.sub{font-size:14px;color:#bbb;line-height:1.6;margin:0 0 1.75rem}
.spinner{display:inline-block;width:32px;height:32px;border:3px solid #333;border-top-color:#40c9a2;border-radius:50%;animation:spin 0.8s linear infinite;margin-bottom:1.25rem}
@keyframes spin{to{transform:rotate(360deg)}}
.status{font-size:13px;color:#40c9a2;margin-bottom:2rem}
.btn{display:inline-block;background:#40c9a2;color:#1a1a1a;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;transition:background 0.15s}
.btn:hover{background:#35b08d}
.fine{font-size:11px;color:#666;margin-top:1.5rem;line-height:1.5}
.fine a{color:#888;text-decoration:underline}
.fine a:hover{color:#bbb}
</style></head>
<body><div class="card">
<div class="logo">Work<span class="red">Decoded</span>HQ</div>
<div class="tagline">The workplace playbook they don’t give you</div>
<div class="spinner" aria-hidden="true"></div>
<h1>Connecting you to your session</h1>
<p class="sub">${safeLabel}</p>
<p class="status">Launching Google Meet…</p>
<a id="join" class="btn" href="${safeUrl}" rel="noopener">Open meeting now</a>
<p class="fine">If nothing happens, click the button above. Need help? Email <a href="mailto:support@workdecodedhq.com">support@workdecodedhq.com</a>.</p>
</div>
<script>
// Auto-redirect after 3s via JS (the meta refresh above is the no-JS fallback).
// Use replace() so the back button doesn't return here.
setTimeout(function(){
  window.location.replace(${JSON.stringify(destinationUrl)});
}, 3000);
</script>
</body></html>`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!slug) {
    return new NextResponse(notFoundPage(), { status: 404, headers: HTML_HEADERS });
  }

  const store = getStore(STORE_NAME);
  const data = (await store.get(slug, { type: 'json' })) as ShortLinkRecord | null;
  if (!data || !data.url) {
    return new NextResponse(notFoundPage(), { status: 404, headers: HTML_HEADERS });
  }

  // Best-effort click increment — don't block the render on this. If the
  // write loses to a concurrent click we'll be off by one, which is fine
  // for our scale (a few thousand clicks/month).
  try {
    await store.setJSON(slug, { ...data, clicks: (data.clicks || 0) + 1 });
  } catch (err) {
    console.warn('[Redirect] click increment failed for', slug, err);
  }

  return new NextResponse(interstitialPage(data.url, data.label), {
    status: 200,
    headers: HTML_HEADERS,
  });
}
