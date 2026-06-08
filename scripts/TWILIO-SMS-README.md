# Work Decoded — Twilio SMS Setup Guide

**Toll-Free Number:** +1 (855) 550-0594  
**Status:** Approved for toll-free messaging  
**Owner:** Michelle Williams / Work Decoded  

> **✅ APPROVED TEMPLATES:** All SMS body text in `setup-twilio-sms.js` matches the approved copy from Michelle's `WorkDecoded_Complete_SMS_Templates.docx` (May 21, 2026). Primary versions are active. Alternative versions are documented in code comments for future monthly rotation.

> **Important:** All links (Google Meet + booking URLs) must be shortened with bit.ly or Rebrandly before inserting into Zapier merge fields. Full URLs will push messages over the 160-char limit.

---

## Quick Start

```bash
# 1. Install the Twilio SDK (from the work-decoded root)
npm install twilio

# 2. Preview all templates (no Twilio credentials needed)
node scripts/setup-twilio-sms.js --dry-run

# 3. List templates with merge field documentation
node scripts/setup-twilio-sms.js --list

# 4. Create the Messaging Service on Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxx TWILIO_AUTH_TOKEN=xxxxxxx \
  node scripts/setup-twilio-sms.js --setup

# 5. Send a test SMS to your phone
TWILIO_ACCOUNT_SID=ACxxxxxxx TWILIO_AUTH_TOKEN=xxxxxxx \
  node scripts/setup-twilio-sms.js --test --to=+1XXXXXXXXXX --template=SS-1
```

---

## SMS Templates

### Single Session Flow

| ID | Name | Trigger | When |
|----|------|---------|------|
| **SS-1** | Booking Confirmation | New Acuity appointment | Immediately after booking |
| **SS-2** | 24-Hour Reminder | Zapier Delay Until | 24 hours before session |
| **SS-3** | 1-Hour Reminder | Zapier Delay Until | 1 hour before session |

### Package Flow

| ID | Name | Trigger | When |
|----|------|---------|------|
| **PKG-1** | Package Purchase Confirmation | New Airtable record (Packages via Acuity) | Immediately after purchase |
| **PKG-2** | Monthly Check-In | Repeating Zap (every 30 days) | Every 30 days while sessions remain |
| **PKG-3** | Final Month Reminder | Zapier Delay Until (purchase + 335 days) | 30 days before package expiration |

---

## Merge Fields Reference

### SS-1: Booking Confirmation (130/160 chars)

| Field | Example | Source |
|-------|---------|--------|
| `clientFirstName` | Sarah | Acuity / Airtable Clients |
| `sessionDate` | Monday, May 5 | Acuity booking |
| `sessionTime` | 2:00 PM ET | Acuity booking |

### SS-2: 24-Hour Reminder (151/160 chars)

| Field | Example | Source |
|-------|---------|--------|
| `clientFirstName` | Sarah | Acuity / Airtable Clients |
| `sessionTime` | 2:00 PM ET | Acuity booking |

### SS-3: 1-Hour Reminder (151/160 chars)

| Field | Example | Source |
|-------|---------|--------|
| `clientFirstName` | Sarah | Acuity / Airtable Clients |
| `sessionTime` | 2:00 PM ET | Acuity booking |
| `meetLink` | bit.ly/wd-meet123 | Shortened Google Meet link from Acuity |

### PKG-1: Package Purchase Confirmation (155/160 chars)

| Field | Example | Source |
|-------|---------|--------|
| `clientFirstName` | Marcus | Acuity / Airtable Clients |
| `packageSize` | 3 | Airtable package field ("3" or "5") |
| `expirationDate` | June 8, 2027 | Auto-calculated: purchase date + 1 year |

### PKG-2: Monthly Check-In (152/160 chars)

| Field | Example | Source |
|-------|---------|--------|
| `clientFirstName` | Marcus | Acuity / Airtable Clients |
| `sessionsRemaining` | 2 | Airtable Sessions table (computed) |
| `bookingLink` | bit.ly/bookWD | Shortened Acuity booking URL |

### PKG-3: Final Month Reminder (158/160 chars)

| Field | Example | Source |
|-------|---------|--------|
| `clientFirstName` | Marcus | Acuity / Airtable Clients |
| `sessionsRemaining` | 1 | Airtable Sessions table (computed) |
| `expirationDate` | June 8, 2027 | Auto-calculated: purchase date + 1 year |
| `bookingLink` | bit.ly/bookWD | Shortened Acuity booking URL |

---

## Auto-Replies (Approved — Do Not Modify)

**STOP reply** (140 chars):
> Work Decoded: You have been unsubscribed and will receive no further messages from us. Reply START to resubscribe or HELP for assistance.

**HELP reply** (155 chars):
> Work Decoded: For support email support@workdecodedhq.com or visit WorkDecodedHQ.com. Reply STOP to unsubscribe. Msg & data rates may apply.

These are configured in the Twilio Console under Messaging → Services → Compliance → Advanced Opt-Out.

---

## Compliance Checklist

All templates follow these rules (required for toll-free messaging):

- [x] Brand name "Work Decoded:" at the start of every message
- [x] "Reply STOP to opt out" in every message
- [x] HELP keyword returns support info
- [x] STOP keyword confirms unsubscribe
- [x] Consent language on intake form (see script for exact text)

### Consent Language (for intake form checkbox)

> By checking this box, I expressly consent to receive SMS text messages from Work Decoded at the mobile phone number provided on this form. Messages will include session booking confirmations, appointment reminders, and related service updates. This consent is not a condition of purchase. Message and data rates may apply. Message frequency varies. Reply STOP to opt out at any time. Reply HELP for help. View our Privacy Policy at WorkDecodedHQ.com/privacy.

---

## Suppression Logic

The script includes a `shouldSendReminder()` function that checks:

1. **Opt-out status** — skip if client has opted out in Airtable
2. **Session status** — skip SS-2/SS-3 if session is cancelled or completed
3. **Package status** — skip PKG-2/PKG-3 if no sessions remain or package expired

In the Zapier setup, these checks are implemented as **Filter steps** between the trigger and the Send SMS action.

---

## Setup Steps (When Jose Is Back at Laptop)

### Step 1: Install Twilio SDK

```bash
cd ~/projects/work-decoded
npm install twilio
```

### Step 2: Get Twilio Credentials

1. Log into [twilio.com/console](https://www.twilio.com/console)
2. Copy your **Account SID** and **Auth Token** from the dashboard
3. Confirm the toll-free number +1 (855) 550-0594 is active under Phone Numbers

### Step 3: Run the Setup Script

```bash
# Preview first (no changes made)
TWILIO_ACCOUNT_SID=ACxxx TWILIO_AUTH_TOKEN=xxx \
  node scripts/setup-twilio-sms.js --setup --dry-run

# Then run for real
TWILIO_ACCOUNT_SID=ACxxx TWILIO_AUTH_TOKEN=xxx \
  node scripts/setup-twilio-sms.js --setup
```

The script will:
1. Create a Messaging Service named "Work Decoded SMS"
2. Add the toll-free number to the service
3. Print the Messaging Service SID (save this!)
4. Give instructions for configuring STOP/HELP replies in the Console

### Step 4: Configure STOP/HELP in Twilio Console

The script prints instructions, but in short:
1. Go to Twilio Console → Messaging → Services → "Work Decoded SMS"
2. Navigate to Compliance → Advanced Opt-Out
3. Paste the exact STOP and HELP reply text (see Auto-Replies section above)
4. Save

### Step 5: Send a Test SMS

```bash
TWILIO_ACCOUNT_SID=ACxxx TWILIO_AUTH_TOKEN=xxx \
  node scripts/setup-twilio-sms.js --test --to=+1XXXXXXXXXX --template=SS-1
```

Test each template (SS-1, SS-2, SS-3, PKG-1, PKG-2, PKG-3) to your phone.

### Step 6: Connect to Zapier

Templates have been verified against Michelle's `WorkDecoded_Complete_SMS_Templates.docx`. Follow the Zapier Integration section below to build the Zaps.

---

## Zapier Integration

Each SMS template maps to a Zap. Here's how to set them up:

### Zap 1: Single Session Flow (SS-1 → SS-2 → SS-3)

One Zap handles all three single-session texts using Zapier's "Delay Until" steps:

- **Trigger:** Acuity Scheduling → New Appointment Created
- **Action 1 (SS-1):** Twilio → Send SMS — booking confirmation immediately
  - From: Messaging Service SID
  - To: `{{client_phone}}` from Acuity
  - Body: `Work Decoded: Hi {{first_name}}! Your session is confirmed for {{date}} at {{time}}. We're ready for you — see you then! Reply STOP to opt out.`
- **Action 2:** Delay Until → session date/time minus 24 hours
- **Action 3 (SS-2):** Twilio → Send SMS — 24-hour reminder
  - Body: `Work Decoded: Hi {{first_name}}! Your session is tomorrow at {{time}}. Your consultant is prepared and ready for you. See you then! Reply STOP to opt out.`
- **Action 4:** Delay Until → session date/time minus 1 hour
- **Action 5 (SS-3):** Twilio → Send SMS — 1-hour reminder with Meet link
  - Body: `Work Decoded: Hi {{first_name}}! Your session starts in 1 hour at {{time}}. Join via Google Meet: {{short_meet_link}} You've got this. Reply STOP to opt out.`

**Cancellation handling:** Create a second Zap with trigger "Acuity → Appointment Cancelled" that suppresses SS-2 and SS-3. If rescheduled, send a new SS-1 with updated details and reschedule the reminder delays.

### Zap 2: PKG-1 (Package Purchase Confirmation)

- **Trigger:** Airtable → New Record in Packages table (populated by Acuity + Zapier)
- **Action:** Twilio → Send SMS
  - Body: `Work Decoded: Hi {{first_name}}! Your {{package_size}}-session package is confirmed. Sessions expire {{expiration_date}}. Book anytime at WorkDecodedHQ.com. Reply STOP to opt out.`

### Zap 3: PKG-2 (Monthly Check-In)

- **Trigger:** Repeating Zap → Every 30 days (or Schedule by Zapier daily with mod-30 filter)
- **Action 1:** Airtable → Find Records where Sessions Remaining > 0 AND package not expired AND client hasn't purchased a new package
- **Filter:** Only continue if records found
- **Action 2:** Twilio → Send SMS for each matching record
  - Body: `Work Decoded: Hi {{first_name}}! You have {{remaining}} session(s) ready. How are things at work? Book a check-in anytime: {{booking_link}} Reply STOP to opt out.`

### Zap 4: PKG-3 (Final Month Reminder)

- **Trigger:** Zapier Delay Until → purchase date + 335 days (or Schedule daily with 30-day-to-expiration filter)
- **Action 1:** Airtable → Find Record → check Sessions Remaining > 0
- **Filter:** Only continue if remaining > 0
- **Action 2:** Twilio → Send SMS
  - Body: `Work Decoded: Hi {{first_name}}! Your {{remaining}} session(s) expire in 30 days on {{expiration_date}}. Don't let them go! Book now: {{booking_link}} Reply STOP to opt out.`

### Zapier Tips

- Use the **Messaging Service SID** (not the phone number) in the "From" field — this ensures Twilio routes through the configured service with STOP/HELP handling.
- **Shorten all links** with bit.ly or Rebrandly before inserting into Twilio message bodies. Full Google Meet URLs will blow the 160-char limit.
- The Zapier Twilio integration uses `{{field_name}}` merge tags — map them to the Acuity/Airtable fields listed in the Merge Fields section above.
- **Suppress PKG-2** when remaining sessions = 0 or client has purchased a new package.
- **Suppress PKG-3** when remaining sessions = 0.
- **Suppress all texts** for clients who replied STOP — Twilio handles this automatically at the carrier level.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Yes | Starts with `AC`, found on Twilio dashboard |
| `TWILIO_AUTH_TOKEN` | Yes | Found on Twilio dashboard |
| `TWILIO_MESSAGING_SID` | After setup | The Messaging Service SID created by `--setup` |

---

## File Structure

```
work-decoded/
└── scripts/
    ├── setup-twilio-sms.js      ← Main script (this file)
    └── TWILIO-SMS-README.md     ← This documentation
```

---

## Troubleshooting

**"Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN"**  
Set the env vars before the command: `TWILIO_ACCOUNT_SID=ACxxx TWILIO_AUTH_TOKEN=xxx node ...`

**"Could not load twilio SDK"**  
Run `npm install twilio` from the project root.

**"Number not found in your Twilio account"**  
Confirm +18555500594 is purchased and active in your Twilio Console under Phone Numbers.

**Messages not being delivered**  
Check Twilio Console → Monitor → Messaging Logs for error codes. Common issues: unverified toll-free number, recipient opted out, invalid phone number format.
