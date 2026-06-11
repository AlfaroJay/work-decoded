import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/rateLimit';

/**
 * Server-side proxy for the public intake form.
 *
 * The form used to POST the booking straight to a public Zapier catch-hook,
 * which (a) exposed the hook URL in client code and (b) let anyone hit the
 * booking pipeline directly. This route sits in front of it: rate-limits per
 * IP, does light validation/normalization, then forwards the SAME JSON payload
 * to Zapier server-side. The hook URL now lives in the `ZAPIER_INTAKE_WEBHOOK`
 * server env var instead of `public/intake-form.html`.
 *
 * IMPORTANT: this is a pass-through. The intake Zap's trigger mapping depends
 * on the exact payload field names, so do NOT rename keys here. We only
 * validate required fields, normalize the phone/email, and cap free-text — the
 * rest of the payload is forwarded unchanged.
 */

// Free-text fields are capped to blunt abuse / oversized payloads. Generous —
// real intake answers never approach this.
const MAX_TEXT = 5000;
const TEXT_FIELDS = ['situation', 'schedulingNotes', 'otherOutcomeDetail', 'pipTimeline'];

// Minimum fields the booking pipeline needs to be usable. Kept deliberately
// small so a legitimate booking is never rejected over an optional field.
const REQUIRED = [
  'firstName',
  'lastName',
  'email',
  'selectedTier',
  'selectedDate',
  'selectedTime',
  'appointmentDatetime',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Canonical tier nomenclature (see NAMING.md): Airtable, Square, and all
// client-facing surfaces use Title Case. The form historically sends lowercase
// values, so we normalize here — the single choke point between the form and
// the rest of the system. Unknown values pass through unchanged (the intake
// Zap will surface them rather than silently dropping the booking).
const TIER_MAP: Record<string, string> = {
  standard: 'Standard',
  premier: 'Premier',
  crisis: 'Crisis',
  discovery: 'Discovery',
};

function bad(reason: string, status = 400) {
  return NextResponse.json({ ok: false, error: 'invalid_submission', reason }, { status });
}

export async function POST(req: NextRequest) {
  // Rate limit: this endpoint forwards into the booking pipeline (Airtable +
  // calendar + SMS + invoice), so throttle per IP. 10/min is well above any
  // real user. Fail-open — a limiter hiccup never blocks a booking.
  const rl = await rateLimit(req, { key: 'book', limit: 10, windowSec: 60 });
  if (!rl.ok) return rateLimitResponse(rl);

  const hook = process.env.ZAPIER_INTAKE_WEBHOOK;
  if (!hook) {
    // Misconfiguration — surface a friendly error rather than silently dropping
    // the booking. The form shows the reason + the support email.
    console.error('[Book] ZAPIER_INTAKE_WEBHOOK is not configured');
    return NextResponse.json(
      {
        ok: false,
        error: 'not_configured',
        reason:
          'Booking is temporarily unavailable. Please email support@workdecodedhq.com and we’ll get you scheduled.',
      },
      { status: 503 }
    );
  }

  let data: Record<string, unknown>;
  try {
    data = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad('Malformed request body.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return bad('Malformed request body.');
  }

  // ---- Bot defense (fail-open: absent fields never block a booking) -------
  // 1. Honeypot: the form ships an off-screen "website" input no human sees.
  //    If it arrives with a value, a form-filling bot completed the page.
  // 2. Time-trap: the form stamps when it rendered; a full intake completed
  //    in under 5 seconds is not a human.
  // Both cases return a fake success (so bots don't learn to adapt) and
  // nothing is forwarded to Zapier. Real failures stay loud; only confirmed
  // bot signatures are silently dropped, and each drop is logged.
  const hp = data.hpWebsite;
  if (typeof hp === 'string' && hp.trim() !== '') {
    console.warn('[Book] Honeypot tripped — submission dropped');
    return NextResponse.json({ ok: true, bookingCode: data.bookingCode ?? null });
  }
  if (typeof data.formRenderedAt === 'string' && data.formRenderedAt !== '') {
    const renderedAt = Date.parse(data.formRenderedAt);
    if (!Number.isNaN(renderedAt) && Date.now() - renderedAt < 5000) {
      console.warn('[Book] Time-trap tripped (form submitted <5s after render) — submission dropped');
      return NextResponse.json({ ok: true, bookingCode: data.bookingCode ?? null });
    }
  }
  // --------------------------------------------------------------------------

  // Required fields present + non-empty.
  for (const key of REQUIRED) {
    const v = data[key];
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
      return bad('Missing required field: ' + key);
    }
  }

  // Email must look like an email (it drives the confirmation + invoice).
  if (typeof data.email !== 'string' || !EMAIL_RE.test(data.email.trim())) {
    return bad('A valid email address is required.');
  }

  // Shallow copy so we normalize without mutating the parsed body. Field NAMES
  // are preserved — only values are cleaned. The bot-defense fields are
  // internal and never forwarded to the Zap.
  const payload: Record<string, unknown> = { ...data };
  delete payload.hpWebsite;
  delete payload.formRenderedAt;

  payload.email = (data.email as string).trim();

  if (typeof payload.phone === 'string') {
    const raw = payload.phone.trim();
    const digits = raw.replace(/\D/g, '');
    payload.phone = raw.startsWith('+') ? '+' + digits : digits;
  }

  // Normalize the tier to canonical Title Case (NAMING.md).
  if (typeof payload.selectedTier === 'string') {
    const canonical = TIER_MAP[payload.selectedTier.trim().toLowerCase()];
    if (canonical) payload.selectedTier = canonical;
  }

  for (const field of TEXT_FIELDS) {
    const v = payload[field];
    if (typeof v === 'string' && v.length > MAX_TEXT) {
      payload[field] = v.slice(0, MAX_TEXT);
    }
  }

  // Forward to Zapier server-side. Mirror the Content-Type the form used when
  // it posted directly (text/plain + JSON body), so the catch-hook parses the
  // fields identically to today — the safest "never break a live booking"
  // choice.
  try {
    const res = await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error('[Book] Zapier hook returned', res.status);
      return NextResponse.json(
        {
          ok: false,
          error: 'upstream_error',
          reason: 'We had trouble submitting your form. Please try again shortly.',
        },
        { status: 502 }
      );
    }
  } catch (err) {
    console.error('[Book] Forward to Zapier failed:', (err as Error)?.message);
    return NextResponse.json(
      {
        ok: false,
        error: 'upstream_error',
        reason: 'We had trouble submitting your form. Please try again shortly.',
      },
      { status: 502 }
    );
  }

  // Echo back the client-generated booking code so the form can keep showing it
  // on the success screen without trusting anything new from the server.
  return NextResponse.json({
    ok: true,
    bookingCode: typeof data.bookingCode === 'string' ? data.bookingCode : undefined,
  });
}
