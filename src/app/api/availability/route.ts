import { NextRequest, NextResponse } from 'next/server';
import type { AvailabilityResponse, TimeSlot } from '@/lib/types';

// Generate 15-minute slots between business hours
function generateSlots(startHour: number, endHour: number): string[] {
  const slots: string[] = [];
  for (let h = startHour; h < endHour; h++) {
    for (let m = 0; m < 60; m += 15) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return slots;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');

  if (!date) {
    return NextResponse.json({ error: 'date parameter required' }, { status: 400 });
  }

  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const calendarId = process.env.GOOGLE_CALENDAR_ID;

  // Business hours: 9 AM – 5 PM ET
  const allSlots = generateSlots(9, 17);

  // If Google Calendar isn't configured yet, return all slots as available
  // (allows the form to work while Michelle sets up the service account)
  if (!credentials || !calendarId) {
    const response: AvailabilityResponse = {
      date,
      slots: allSlots.map((time) => ({ time, available: true })),
    };
    return NextResponse.json(response);
  }

  try {
    const { google } = await import('googleapis');

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(credentials),
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });

    const calendar = google.calendar({ version: 'v3', auth });

    // Get all events for the requested date
    const dayStart = `${date}T00:00:00-04:00`; // ET offset
    const dayEnd = `${date}T23:59:59-04:00`;

    const events = await calendar.events.list({
      calendarId,
      timeMin: dayStart,
      timeMax: dayEnd,
      singleEvents: true,
      orderBy: 'startTime',
    });

    // Build a set of busy time ranges
    const busyRanges: Array<{ start: number; end: number }> = [];
    for (const event of events.data.items || []) {
      if (event.start?.dateTime && event.end?.dateTime) {
        busyRanges.push({
          start: new Date(event.start.dateTime).getTime(),
          end: new Date(event.end.dateTime).getTime(),
        });
      }
    }

    // Check each slot against busy ranges
    const slots: TimeSlot[] = allSlots.map((time) => {
      const slotStart = new Date(`${date}T${time}:00-04:00`).getTime();
      const slotEnd = slotStart + 15 * 60 * 1000;

      const isBusy = busyRanges.some(
        (range) => slotStart < range.end && slotEnd > range.start
      );

      return { time, available: !isBusy };
    });

    const response: AvailabilityResponse = { date, slots };
    return NextResponse.json(response);
  } catch (error) {
    console.error('[Availability]', error);
    // Fallback: return all slots available rather than breaking the form
    const response: AvailabilityResponse = {
      date,
      slots: allSlots.map((time) => ({ time, available: true })),
    };
    return NextResponse.json(response);
  }
}
