import { NextRequest, NextResponse } from 'next/server';
import { AIRTABLE_BASE_ID } from '@/lib/constants';

const CLIENTS_TABLE = 'Clients';

// CORS — same shape as /api/validate-code
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// Returns ONLY the safe demographic fields — never returns situation, urgency,
// legal categories, attorney info, or any consent state. Returning client must
// fill those out fresh every session per Michelle's legal requirement.
export async function GET(request: NextRequest) {
  const token = (request.nextUrl.searchParams.get('t') || '').trim();

  if (!token || !/^rec[A-Za-z0-9]{14}$/.test(token)) {
    return NextResponse.json(
      { valid: false, reason: 'Invalid prefill token.' },
      { status: 400, headers: CORS }
    );
  }

  const pat = process.env.AIRTABLE_PAT;
  if (!pat) {
    console.error('[ClientPrefill] AIRTABLE_PAT not configured');
    return NextResponse.json(
      { valid: false, reason: 'Server configuration error.' },
      { status: 500, headers: CORS }
    );
  }

  try {
    const url =
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(CLIENTS_TABLE)}/${token}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${pat}` },
    });

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json(
          { valid: false, reason: 'Client profile not found.' },
          { status: 200, headers: CORS }
        );
      }
      throw new Error(`Airtable error (${res.status})`);
    }

    const record = await res.json();
    const f = record.fields || {};

    // Airtable returns singleSelect fields as either { id, name, color } or as a plain string
    // depending on the API version / typecast settings. Normalize to plain strings.
    const pickName = (v: unknown): string => {
      if (!v) return '';
      if (typeof v === 'string') return v;
      if (typeof v === 'object' && v !== null && 'name' in v) {
        return String((v as { name: unknown }).name || '');
      }
      return '';
    };

    return NextResponse.json(
      {
        valid: true,
        clientId: token,
        firstName:    f['First Name']    || '',
        lastName:     f['Last Name']     || '',
        email:        f['Email']         || '',
        phone:        f['Phone']         || '',
        state:        pickName(f['State']),
        age40OrOlder: !!f['Age 40+'],
        employer:     f['Company Name']  || '',
        jobTitle:     f['Job Title']     || '',
        industry:     pickName(f['Industry']),
        unionMember:  pickName(f['Union Member']),
      },
      { status: 200, headers: CORS }
    );
  } catch (error) {
    console.error('[ClientPrefill] Lookup error:', error);
    return NextResponse.json(
      { valid: false, reason: 'Could not load profile right now.' },
      { status: 500, headers: CORS }
    );
  }
}
