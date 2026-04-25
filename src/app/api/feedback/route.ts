import { NextRequest, NextResponse } from 'next/server';
import { AIRTABLE_BASE_ID } from '@/lib/constants';

const SESSIONS_TABLE = 'Sessions';

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
    return NextResponse.json(
      { success: false, message: 'Server configuration error.' },
      { status: 500 }
    );
  }

  let data: FeedbackPayload;
  try {
    data = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: 'Invalid request body.' },
      { status: 400 }
    );
  }

  // Validate required fields
  if (!data.token || !/^rec[A-Za-z0-9]{14}$/.test(data.token)) {
    return NextResponse.json(
      { success: false, message: 'Invalid session token.' },
      { status: 400 }
    );
  }
  if (!data.sessionStatus || !data.sessionNotes) {
    return NextResponse.json(
      { success: false, message: 'Session status and summary are required.' },
      { status: 400 }
    );
  }

  try {
    // Verify the session exists first
    const checkRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(SESSIONS_TABLE)}/${data.token}`,
      {
        headers: { Authorization: `Bearer ${pat}` },
      }
    );

    if (!checkRes.ok) {
      if (checkRes.status === 404) {
        return NextResponse.json(
          { success: false, message: 'Session not found. Please check the link.' },
          { status: 404 }
        );
      }
      throw new Error(`Airtable lookup error (${checkRes.status})`);
    }

    // Build the update fields
    const fields: Record<string, unknown> = {};

    // Situation Summary (consultant's session notes)
    if (data.sessionNotes) fields['Situation Summary'] = data.sessionNotes;

    // Client Emotional State (single select)
    if (data.clientEmotionalState) fields['Client Emotional State'] = { name: data.clientEmotionalState };

    // Guidance Provided
    if (data.guidanceProvided) fields['Guidance Provided'] = data.guidanceProvided;

    // Risk Flags (multiple select)
    if (data.riskFlags && data.riskFlags !== 'None') {
      const flags = data.riskFlags.split(', ').map(f => ({ name: f.trim() }));
      fields['Risk Flags'] = flags;
    }

    // Recommended Next Steps (using follow-up notes)
    if (data.followUpNotes) fields['Recommended Next Steps'] = data.followUpNotes;

    // Risk Flag Notes (using consultant private notes)
    if (data.consultantNotes) fields['Risk Flag Notes'] = data.consultantNotes;

    // Follow-Up Needed (single select: Yes / No / Possibly)
    fields['Follow-Up Needed'] = data.followUpNeeded ? { name: 'Yes' } : { name: 'No' };

    // Different Consultant for Follow-Up (checkbox)
    fields['Different Consultant for Follow-Up'] = data.differentConsultantForFollowUp;

    // Additional Notes (different consultant notes + any extra context)
    const additionalParts: string[] = [];
    if (data.differentConsultantNotes) {
      additionalParts.push(`Reassignment note: ${data.differentConsultantNotes}`);
    }
    if (data.followUpType) {
      additionalParts.push(`Follow-up type: ${data.followUpType}`);
    }
    if (data.followUpDue) {
      additionalParts.push(`Follow-up due: ${data.followUpDue}`);
    }
    if (data.consultantEmail) {
      additionalParts.push(`Submitted by: ${data.consultantEmail}`);
    }
    additionalParts.push(`Status: ${data.sessionStatus}`);
    additionalParts.push(`Submitted: ${new Date().toISOString()}`);
    fields['Additional Notes'] = additionalParts.join('\n');

    // Update the session record
    const updateRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(SESSIONS_TABLE)}/${data.token}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${pat}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields }),
      }
    );

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      console.error('[Feedback] Update failed:', updateRes.status, errText);
      throw new Error(`Airtable update error (${updateRes.status})`);
    }

    return NextResponse.json({
      success: true,
      message: 'Feedback recorded successfully.',
    });
  } catch (error) {
    console.error('[Feedback] Submit error:', error);
    return NextResponse.json(
      { success: false, message: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
