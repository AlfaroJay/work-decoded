import { NextRequest, NextResponse } from 'next/server';
import { AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME, VALUE_MAP } from '@/lib/constants';
import type { IntakeFormData, SubmitResponse } from '@/lib/types';

// ---- Airtable record creation ----
async function createAirtableRecord(data: IntakeFormData): Promise<string> {
  const token = process.env.AIRTABLE_PAT;
  if (!token) throw new Error('Airtable token not configured');

  const fields: Record<string, unknown> = {};

  // Plain text
  if (data.firstName) fields['First Name'] = data.firstName;
  if (data.lastName) fields['Last Name'] = data.lastName;
  if (data.email) fields['Email'] = data.email;
  if (data.phone) fields['Phone'] = data.phone;
  if (data.preferredConsultant) fields['Preferred Consultant'] = data.preferredConsultant;
  if (data.situationDescription) fields['Situation Description'] = data.situationDescription;
  if (data.priorActionDetails) fields['Prior Action Details'] = data.priorActionDetails;

  // Booleans
  fields['Returning Client'] = data.returningClient === 'yes';
  fields['Prior HR/Legal Action'] = data.priorAction === 'yes';
  fields['Consent Given'] = data.consent;

  // Single-selects with value mapping
  if (data.referral && VALUE_MAP.referral[data.referral]) {
    fields['How They Heard About Us'] = VALUE_MAP.referral[data.referral];
  }
  if (data.employmentStatus) fields['Employment Status'] = data.employmentStatus;
  if (data.industry) fields['Industry'] = data.industry;
  if (data.issueType) fields['Primary Issue'] = data.issueType;
  if (data.companySize && VALUE_MAP.coSize[data.companySize]) {
    fields['Company Size'] = VALUE_MAP.coSize[data.companySize];
  }
  if (data.urgency && VALUE_MAP.urgency[data.urgency]) {
    fields['Urgency'] = VALUE_MAP.urgency[data.urgency];
  }

  const res = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error('[Airtable] POST failed:', res.status, errText);
    throw new Error(`Airtable error (${res.status})`);
  }

  const record = await res.json();
  return record.id;
}

// ---- Google Calendar event creation ----
async function createCalendarEvent(data: IntakeFormData): Promise<string> {
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const calendarId = process.env.GOOGLE_CALENDAR_ID;

  if (!credentials || !calendarId) {
    console.warn('[Calendar] Google Calendar not configured — skipping event creation');
    return 'not-configured';
  }

  // Dynamic import to avoid issues if googleapis isn't installed yet
  const { google } = await import('googleapis');

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(credentials),
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  const calendar = google.calendar({ version: 'v3', auth });

  const startDateTime = `${data.selectedDate}T${data.selectedTime}:00`;
  const startDate = new Date(startDateTime);
  const endDate = new Date(startDate.getTime() + 15 * 60 * 1000); // 15-min call

  const event = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: `Work Decoded — ${data.firstName} ${data.lastName}`,
      description: [
        `Client: ${data.firstName} ${data.lastName}`,
        `Email: ${data.email}`,
        `Phone: ${data.phone || 'N/A'}`,
        `Issue: ${data.issueType || 'Not specified'}`,
        `Urgency: ${data.urgency || 'Not specified'}`,
        '',
        `Situation: ${data.situationDescription || 'No details provided'}`,
      ].join('\n'),
      start: {
        dateTime: startDate.toISOString(),
        timeZone: 'America/New_York',
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: 'America/New_York',
      },
      attendees: data.email ? [{ email: data.email }] : [],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 15 },
        ],
      },
    },
  });

  return event.data.id || 'created';
}

// ---- Main handler ----
export async function POST(request: NextRequest) {
  try {
    const data: IntakeFormData = await request.json();

    // Basic validation
    if (!data.firstName || !data.lastName || !data.email) {
      return NextResponse.json(
        { success: false, message: 'First name, last name, and email are required.' },
        { status: 400 }
      );
    }
    if (!data.consent) {
      return NextResponse.json(
        { success: false, message: 'You must agree to the consent statement.' },
        { status: 400 }
      );
    }
    if (!data.selectedDate || !data.selectedTime) {
      return NextResponse.json(
        { success: false, message: 'Please select a date and time for your consultation.' },
        { status: 400 }
      );
    }

    // Step 1: Create Airtable record
    const clientRecordId = await createAirtableRecord(data);

    // Step 2: Create Google Calendar event
    const calendarEventId = await createCalendarEvent(data);

    const response: SubmitResponse = {
      success: true,
      message: 'Your consultation has been booked. You will receive a confirmation email shortly.',
      clientRecordId,
      calendarEventId,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Submit]', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Something went wrong. Please try again or email support@workdecodedhq.com.',
      },
      { status: 500 }
    );
  }
}
