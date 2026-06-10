import { NextRequest, NextResponse } from 'next/server';
import { AIRTABLE_BASE_ID } from '@/lib/constants';
import { rateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { verifySessionToken } from '@/lib/signedToken';

/**
 * Read-only intake lookup for consultants prepping for a session.
 *
 * GET /api/intake?t={signedToken}
 *
 * Looks up the Session record (token verifies to its record ID), follows the
 * Client link, and returns the full Client + selected Session fields so the
 * consultant can read the client's intake form responses ahead of (or after)
 * the call.
 *
 * Auth: signed, expiring token (src/lib/signedToken.ts), minted by the Zaps
 * that email consultant links. Bare record IDs are rejected.
 *
 * Response shape:
 *   {
 *     session: { id, sessionId, date, topicArea, tier, consultantName },
 *     client:  { ...all fields on the Clients record... }
 *   }
 */

const SESSIONS_TABLE = 'Sessions';
const CLIENTS_TABLE = 'Clients';

export async function GET(request: NextRequest) {
  // Rate limit: this endpoint returns sensitive client PII keyed only by a
  // record ID, so throttle per IP to slow ID-guessing/enumeration.
  const rl = await rateLimit(request, { key: 'intake', limit: 30, windowSec: 60 });
  if (!rl.ok) return rateLimitResponse(rl);

  const token = verifySessionToken(request.nextUrl.searchParams.get('t'));
  if (!token) {
    return NextResponse.json(
      { error: 'Invalid or expired link. Please use the link from your most recent email.' },
      { status: 401 }
    );
  }

  const pat = process.env.AIRTABLE_PAT;
  if (!pat) {
    console.error('[Intake] AIRTABLE_PAT not configured');
    return NextResponse.json(
      { error: 'Server configuration error.' },
      { status: 500 }
    );
  }

  try {
    const sessionRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(SESSIONS_TABLE)}/${token}`,
      { headers: { Authorization: `Bearer ${pat}` } }
    );
    if (sessionRes.status === 404) {
      return NextResponse.json(
        { error: 'Session not found.' },
        { status: 404 }
      );
    }
    if (!sessionRes.ok) {
      throw new Error(`Airtable session error (${sessionRes.status})`);
    }
    const session = await sessionRes.json();
    const sf = session.fields;

    const clientIds: string[] = sf['Client'] || [];
    if (!clientIds.length) {
      return NextResponse.json(
        { error: 'No client linked to this session.' },
        { status: 404 }
      );
    }

    const clientRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(CLIENTS_TABLE)}/${clientIds[0]}`,
      { headers: { Authorization: `Bearer ${pat}` } }
    );
    if (!clientRes.ok) {
      throw new Error(`Airtable client error (${clientRes.status})`);
    }
    const client = await clientRes.json();

    // Defensively flatten consultant name — could be a string OR a linked
    // record array OR a lookup-formula array depending on field type.
    const rawConsultant = sf['Consultant Name'] ?? sf['Consultant'] ?? '';
    const consultantName = Array.isArray(rawConsultant)
      ? rawConsultant[0] || ''
      : rawConsultant;

    return NextResponse.json({
      session: {
        id: session.id,
        sessionId: sf['Session ID'] || null,
        date: sf['Session Date'] || null,
        topicArea: sf['Topic Area'] || '',
        tier: sf['Tier'] || sf['Service Tier'] || '',
        consultantName,
      },
      client: client.fields,
    });
  } catch (error) {
    console.error('[Intake] Lookup error:', error);
    return NextResponse.json(
      { error: 'Failed to load intake data.' },
      { status: 500 }
    );
  }
}
