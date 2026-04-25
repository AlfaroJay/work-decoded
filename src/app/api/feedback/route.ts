import { NextRequest, NextResponse } from 'next/server';
import { AIRTABLE_BASE_ID } from '@/lib/constants';

const SESSIONS_TABLE = 'Sessions';

const RISK_FLAG_MAP: Record<string, string> = {
  'Retaliation concern': 'Retaliation Concern',
  'Harassment escalation': 'Harassment Escalation',
  'Legal action likely': 'Legal Risk',
  'Mental health concern': 'Mental Health Concern',
  'Urgent follow-up': 'Urgent Follow-Up',
};

interface FeedbackPayload {
  token: string;
  sessionStatus: string;
  clientEmotionalState?: string;
  sessionNotes: string;
  guidanceProvided?: string;
  consultantNotes?: string;
  riskFlags?: string;
  followUpNeeded: boolean;
  followUpType?: string;
  followUpDue?: string;
  followUpNotes?: string;
  differentConsultantForFollowUp: boolean;
  differentConsultantNotes?: string;
  consultantEmail?: string;
}

export async function POST(request: NextRequest) {
  const pat = process.env.AIRTABLE_PAT;
  if (!pat) {
    console.error('[Feedback] AIRTABLE_PAT not configured');
    return NextResponse.json({ success: false, message: 'Server configuration error.' }, { status: 500 });
  }

  let data: FeedbackPayload;
  try { data = await request.json(); } catch { return NextResponse.json({ success: false, message: 'Invalid request body.' }, { status: 400 }); }

  if (!data.token || !/^rec[A-Za-z0-9]{14}$/.test(data.token))
    return NextResponse.json({ success: false, message: 'Invalid session token.' }, { status: 400 });

  if (!data.sessionStatus || !data.sessionNotes)
    return NextResponse.json({ success: false, message: 'Session status and summary are required.' }, { status: 400 });

  try {
    const checkRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(SESSIONS_TABLE)}/${data.token}`,
      { headers: { Authorization: `Bearer ${pat}` }, cache: 'no-store' }
    );
    if (!checkRes.ok) {
      if (checkRes.status === 404) return NextResponse.json({ success: false, message: 'Session not found.' }, { status: 404 });
      throw new Error(`Airtable lookup error (${checkRes.status})`);
    }

    const fields: Record<string, unknown> = {};
    if (data.sessionNotes) fields['Situation Summary'] = data.sessionNotes;
    if (data.clientEmotionalState) fields['Client Emotional State'] = data.clientEmotionalState;
    if (data.guidanceProvided) fields['Guidance Provided'] = data.guidanceProvided;

    if (data.riskFlags && data.riskFlags !== 'None') {
      fields['Risk Flags'] = data.riskFlags.split(', ').map((f: string) => {
        const trimmed = f.trim();
        return RISK_FLAG_MAP[trimmed] || trimmed;
      });
    }

    if (data.followUpNotes) fields['Recommended Next Steps'] = data.followUpNotes;
    if (data.consultantNotes) fields['Risk Flag Notes'] = data.consultantNotes;

    fields['Follow-Up Needed'] = data.followUpNeeded ? 'Yes' : 'No';
    fields['Different Consultant for Follow-Up'] = data.differentConsultantForFollowUp;

    const parts: string[] = [];
    if (data.differentConsultantNotes) parts.push(`Reassignment: ${data.differentConsultantNotes}`);
    if (data.followUpType) parts.push(`Follow-up type: ${data.followUpType}`);
    if (data.followUpDue) parts.push(`Follow-up due: ${data.followUpDue}`);
    if (data.consultantEmail) parts.push(`Submitted by: ${data.consultantEmail}`);
    parts.push(`Status: ${data.sessionStatus}`);
    parts.push(`Submitted: ${new Date().toISOString()}`);
    fields['Additional Notes'] = parts.join('\n');

    const updateRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(SESSIONS_TABLE)}/${data.token}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
        cache: 'no-store',
      }
    );

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      console.error('[Feedback] Update failed:', updateRes.status, errText);
      throw new Error(`Airtable update error (${updateRes.status})`);
    }

    return NextResponse.json({ success: true, message: 'Feedback recorded successfully.' });
  } catch (error) {
    console.error('[Feedback] Submit error:', error);
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
