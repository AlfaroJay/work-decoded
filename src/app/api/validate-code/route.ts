import { NextRequest, NextResponse } from 'next/server';
import { AIRTABLE_BASE_ID } from '@/lib/constants';

const PACKAGE_CODES_TABLE = 'Package Codes';

// Map "Standard 3-pack" / "Premier 5-pack" → tier the form's tier table uses
function packageTypeToTier(packageType: string): 'standard' | 'premier' | null {
  if (!packageType) return null;
  const t = packageType.toLowerCase();
  if (t.startsWith('standard')) return 'standard';
  if (t.startsWith('premier')) return 'premier';
  return null;
}

// CORS headers — the form posts from the same origin (workdecodedhq.netlify.app)
// but Squarespace-redirected loads can show as cross-origin in some browsers.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(request: NextRequest) {
  const code = (request.nextUrl.searchParams.get('code') || '').trim().toUpperCase();

  // Validate code format: WD-XXXX-XXXX or any reasonable alphanumeric+dash code
  if (!code || !/^[A-Z0-9-]{4,32}$/.test(code)) {
    return NextResponse.json(
      { valid: false, reason: 'Invalid code format.' },
      { status: 400, headers: CORS }
    );
  }

  const pat = process.env.AIRTABLE_PAT;
  if (!pat) {
    console.error('[ValidateCode] AIRTABLE_PAT not configured');
    return NextResponse.json(
      { valid: false, reason: 'Server configuration error.' },
      { status: 500, headers: CORS }
    );
  }

  try {
    // Look up the code in the Package Codes table.
    // Code is the primary field, but we use a filter rather than the GET-by-id
    // endpoint because users type the code value, not the Airtable record ID.
    const filter = encodeURIComponent(`{Code} = '${code.replace(/'/g, "\\'")}'`);
    const lookupUrl =
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(PACKAGE_CODES_TABLE)}` +
      `?filterByFormula=${filter}&maxRecords=1`;

    const res = await fetch(lookupUrl, {
      headers: { Authorization: `Bearer ${pat}` },
    });

    if (!res.ok) {
      console.error('[ValidateCode] Airtable lookup failed:', res.status);
      throw new Error(`Airtable error (${res.status})`);
    }

    const data = await res.json();
    const records = data.records || [];

    if (records.length === 0) {
      return NextResponse.json(
        { valid: false, reason: 'Code not found. Double-check the code or contact support.' },
        { status: 200, headers: CORS }
      );
    }

    const record = records[0];
    const fields = record.fields || {};
    const sessionsPurchased = Number(fields['Sessions Purchased'] || 0);
    const linkedSessions: string[] = fields['Sessions'] || [];
    const sessionsUsed = linkedSessions.length;
    const remaining = Math.max(0, sessionsPurchased - sessionsUsed);
    const packageType = String(fields['Package Type'] || '');
    const tier = packageTypeToTier(packageType);
    const clientLink: string[] = fields['Client'] || [];
    const clientId = clientLink[0] || null;

    // Optional: honor an Expires field if Michelle decides to use it later.
    const expiresStr = fields['Expires'];
    if (expiresStr) {
      const expiresDate = new Date(expiresStr);
      if (!isNaN(expiresDate.getTime()) && expiresDate.getTime() < Date.now()) {
        return NextResponse.json(
          { valid: false, reason: 'This package has expired. Contact support@workdecodedhq.com.' },
          { status: 200, headers: CORS }
        );
      }
    }

    if (remaining <= 0) {
      return NextResponse.json(
        {
          valid: false,
          reason: 'This package has been fully redeemed. Contact support@workdecodedhq.com to renew.',
          code,
          codeId: record.id,
          packageType,
          sessionsPurchased,
          sessionsUsed,
        },
        { status: 200, headers: CORS }
      );
    }

    return NextResponse.json(
      {
        valid: true,
        code,
        codeId: record.id,
        tier,
        packageType,
        sessionsPurchased,
        sessionsUsed,
        remaining,
        clientId,
      },
      { status: 200, headers: CORS }
    );
  } catch (error) {
    console.error('[ValidateCode] Lookup error:', error);
    return NextResponse.json(
      { valid: false, reason: 'We could not verify the code right now. Please try again or email support@workdecodedhq.com.' },
      { status: 500, headers: CORS }
    );
  }
}
