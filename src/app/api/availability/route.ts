import { NextRequest, NextResponse } from 'next/server';
import type { AvailabilityResponse, TimeSlot } from '@/lib/types';
import { rateLimit, rateLimitResponse } from '@/lib/rateLimit';

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

// Fail closed — never silently return "everything is available", because that
// causes double-bookings. If we can't talk to Google Calendar, the form should
// surface an error and refuse to take a booking until availability is known.
function unavailable(reason: string, status = 503) {
  return NextResponse.json(
    { error: 'availability_unavailable', reason },
    { status }
  );
}

export async function GET(request: NextRequest) {
  // Rate limit: this endpoint proxies the Google Calendar API, so throttle per
  // IP to protect the Calendar quota. 60/min is generous for the date picker.
  const rl = await rateLimit(request, { key: 'availability', limit: 60, windowSec: 60 });
  if (!rl.ok) return rateLimitResponse(rl);

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');

  if (!date) {
    return NextResponse.json({ error: 'date parameter required' }, { status: 400 });
  }

  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const calendarId = process.env.GOOGLE_CALENDAR_ID;

  // Business hours: 9 AM – 5 PM ET
  const allSlots = generateSlots(9, 17);

  // No credentials → fail closed. The previous behavior (return all slots
  // available) was the direct cause of a 2026-05-11 double-booking incident.
  if (!credentials || !calendarId) {
    console.error('[Availability] GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_CALENDAR_ID not configured');
    return unavailable('calendar_not_configured');
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

    // For same-day requests, drop slots whose start time has already passed
    // (otherwise the picker shows 9 AM at 3 PM, which is silly and bookable
    // due to the upstream availability gap). Use ET because the form/calendar
    // are all ET. Slight 5-min nudge so a slot that started 1 minute ago
    // doesn't linger as bookable.
    const nowMs = Date.now();
    const slotIsPast = (time: string): boolean => {
      const slotStart = new Date(`${date}T${time}:00-04:00`).getTime();
      return slotStart < nowMs + 5 * 60 * 1000;
    };

    // Check each slot against busy ranges
    const slots: TimeSlot[] = allSlots
      .filter((time) => !slotIsPast(time))
      .map((time) => {
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
    console.error('[Availability] Google Calendar query failed', error);
    // Fail closed on API errors too — never serve "all available" when we
    // don't actually know the calendar's state.
    return unavailable('calendar_query_failed');
  }
}
