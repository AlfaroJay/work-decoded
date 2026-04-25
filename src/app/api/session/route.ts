import { NextRequest, NextResponse } from 'next/server';
import { AIRTABLE_BASE_ID } from '@/lib/constants';

const SESSIONS_TABLE = 'Sessions';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t');

  // Validate token format (Airtable record ID)
  if (!token || !/^rec[A-Za-z0-9]{14}$/.test(token)) {
    return NextResponse.json(
      { error: 'Invalid or missing session token.' },
      { status: 400 }
    );
  }

  const pat = process.env.AIRTABLE_PAT;
  if (!pat) {
    console.error('[Session] AIRTABLE_PAT not configured');
    return NextResponse.json(
      { error: 'Server configuration error.' },
      { status: 500 }
    );
  }

  try {
    // Fetch the session record
    const sessionRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(SESSIONS_TABLE)}/${token}`,
      {
        headers: { Authorization: `Bearer ${pat}` },
      }
    );

    if (!sessionRes.ok) {
      if (sessionRes.status === 404) {
        return NextResponse.json(
          { error: 'Session not found.' },
          { status: 404 }
        );
      }
      throw new Error(`Airtable error (${sessionRes.status})`);
    }

    const session = await sessionRes.json();
    const fields = session.fields;

    // Get the linked client record ID
    const clientIds: string[] = fields['Client'] || [];
    let clientName = '';
    let issueType = '';
    let situationSummary = '';

    if (clientIds.length > 0) {
      const clientRes = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent('Clients')}/${clientIds[0]}`,
        {
          headers: { Authorization: `Bearer ${pat}` },
        }
      );

      if (clientRes.ok) {
        const client = await clientRes.json();
        const cf = client.fields;
        const first = cf['First Name'] || '';
        const last = cf['Last Name'] || '';
        clientName = `${first} ${last}`.trim();
        issueType = cf['Primary Issue'] || '';
        situationSummary = cf['Situation Description'] || '';
      }
    }

    return NextResponse.json({
      sessionId: fields['Session ID'],
      clientName,
      issueType,
      situationSummary,
      sessionDate: fields['Session Date'] || null,
      topicArea: fields['Topic Area'] || '',
    });
  } catch (error) {
    console.error('[Session] Lookup error:', error);
    return NextResponse.json(
      { error: 'Failed to load session data.' },
      { status: 500 }
    );
  }
}
