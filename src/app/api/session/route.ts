import { NextRequest, NextResponse } from 'next/server';
import { AIRTABLE_BASE_ID } from '@/lib/constants';
import { rateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { verifySessionToken } from '@/lib/signedToken';

const SESSIONS_TABLE = 'Sessions';

export async function GET(request: NextRequest) {
  // Rate limit: returns session + client PII keyed only by a record ID.
  // Throttle per IP to slow ID-guessing/enumeration.
  const rl = await rateLimit(request, { key: 'session', limit: 30, windowSec: 60 });
  if (!rl.ok) return rateLimitResponse(rl);

  // Signed, expiring token (see src/lib/signedToken.ts). Bare record IDs are
  // rejected — the link must come from a Zap-minted signed URL.
  const token = verifySessionToken(request.nextUrl.searchParams.get('t'));
  if (!token) {
    return NextResponse.json(
      { error: 'Invalid or expired link. Please use the link from your most recent email.' },
      { status: 401 }
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
    // Default everything to safe empty values so the feedback form can render
    // even when Airtable returns no data for a field (e.g. legacy records).
    const client: Record<string, unknown> = {
      clientName: '',
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      state: '',
      age40: false,
      employer: '',
      jobTitle: '',
      industry: '',
      employmentStatus: '',
      unionMember: '',
      issueType: '',
      situationSummary: '',
      urgency: '',
      spokeWithHR: '',
      pipStatus: '',
      pipTimeline: '',
      documenting: '',
      attorneyStatus: '',
      legalCategories: [] as string[],
      desiredOutcomes: [] as string[],
      priorAction: false,
      priorActionDetails: '',
      schedulingNotes: '',
      packageCode: '',
      intakeSubmittedAt: '',
    };

    if (clientIds.length > 0) {
      const clientRes = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent('Clients')}/${clientIds[0]}`,
        {
          headers: { Authorization: `Bearer ${pat}` },
        }
      );

      if (clientRes.ok) {
        const cdata = await clientRes.json();
        const cf = cdata.fields || {};
        const first = cf['First Name'] || '';
        const last = cf['Last Name'] || '';
        client.firstName = first;
        client.lastName = last;
        client.clientName = `${first} ${last}`.trim();
        client.email = cf['Email'] || '';
        client.phone = cf['Phone'] || '';
        client.state = cf['State'] || '';
        client.age40 = !!cf['Age 40+'];
        client.employer = cf['Company Name'] || '';
        client.jobTitle = cf['Job Title'] || '';
        client.industry = cf['Industry'] || '';
        client.employmentStatus = cf['Employment Status'] || '';
        client.unionMember = cf['Union Member'] || '';
        client.issueType = cf['Primary Issue'] || '';
        client.situationSummary = cf['Situation Description'] || '';
        client.urgency = cf['Urgency'] || '';
        client.spokeWithHR = cf['Spoke With HR'] || '';
        client.pipStatus = cf['PIP Status'] || '';
        client.pipTimeline = cf['PIP Timeline'] || '';
        client.documenting = cf['Documenting'] || '';
        client.attorneyStatus = cf['Attorney Status'] || '';
        client.legalCategories = Array.isArray(cf['Legal Categories'])
          ? cf['Legal Categories']
          : [];
        client.desiredOutcomes = Array.isArray(cf['Desired Outcomes'])
          ? cf['Desired Outcomes']
          : [];
        client.priorAction = !!cf['Prior HR/Legal Action'];
        client.priorActionDetails = cf['Prior Action Details'] || '';
        client.schedulingNotes = cf['Scheduling Notes'] || '';
        client.packageCode = cf['Package Code'] || '';
        client.intakeSubmittedAt = cf['Intake Submitted At'] || '';
      }
    }

    return NextResponse.json({
      sessionId: fields['Session ID'],
      sessionDate: fields['Session Date'] || null,
      sessionType: fields['Session Type'] || '',
      topicArea: fields['Topic Area'] || '',
      ...client,
    });
  } catch (error) {
    console.error('[Session] Lookup error:', error);
    return NextResponse.json(
      { error: 'Failed to load session data.' },
      { status: 500 }
    );
  }
}
