# Work Decoded — Zapier SMS Setup (Step-by-Step)

**Prerequisites before you start:**
1. Twilio Messaging Service created (via `setup-twilio-sms.js --setup`) ✅
2. Twilio account connected in Zapier (see Step 0 below)
3. Airtable account connected in Zapier ✅ (use the one with 6 Zaps)
4. Acuity Scheduling connected in Zapier ✅ (already used by live Zaps)
5. bit.ly or Rebrandly account for link shortening

---

## Step 0: Connect Twilio to Zapier (ONE-TIME)

This is the only manual prerequisite. Twilio is not currently connected.

1. Go to [zapier.com/app/connections](https://zapier.com/app/connections)
2. Click **+ Add Connection** → search "Twilio"
3. Enter your Twilio Account SID and Auth Token
4. Name it "Work Decoded Twilio"
5. Done — you can now use Twilio in any Zap

---

## Zap Architecture Overview

Michelle's approved doc specifies 4 Zaps total:

| Zap | Templates | Trigger | Notes |
|-----|-----------|---------|-------|
| **Zap 1** | SS-1, SS-2, SS-3 | Acuity: New Appointment | Single Zap with Delay Until steps |
| **Zap 2** | PKG-1 | Airtable: New Record (Packages) | Immediate confirmation |
| **Zap 3** | PKG-2 | Schedule: Every day | Filter for 30-day intervals + remaining > 0 |
| **Zap 4** | PKG-3 | Schedule: Every day | Filter for expiring in 30 days + remaining > 0 |

Plus one supplementary Zap for cancellation handling.

---

## Zap 1: Single Session Flow (SS-1 → SS-2 → SS-3)

**Name:** `WorkDecoded Single Session SMS (SS-1 → SS-2 → SS-3)`

### Step 1 — Trigger: Acuity Scheduling → New Appointment
- App: **Acuity Scheduling**
- Event: **New Appointment**
- Account: (select existing Acuity connection)
- No filters needed — fires on every new booking

### Step 2 — Action: Twilio → Send SMS (SS-1: Booking Confirmation)
- App: **Twilio**
- Event: **Send SMS**
- Account: Work Decoded Twilio
- From Number: `+18555500594` (or Messaging Service SID)
- To Number: `{{client phone}}` from Acuity step
- Message Body:
```
Work Decoded: Hi {{first name}}! Your session is confirmed for {{date}} at {{time}}. We're ready for you — see you then! Reply STOP to opt out.
```

### Step 3 — Delay Until
- App: **Delay by Zapier**
- Event: **Delay Until**
- Date/Time: `{{appointment date/time}}` minus 24 hours
- (Use Zapier's date math: `{{appointment datetime}} - 24h`)

### Step 4 — Action: Twilio → Send SMS (SS-2: 24-Hour Reminder)
- App: **Twilio**
- Event: **Send SMS**
- From Number: `+18555500594`
- To Number: `{{client phone}}`
- Message Body:
```
Work Decoded: Hi {{first name}}! Your session is tomorrow at {{time}}. Your consultant is prepared and ready for you. See you then! Reply STOP to opt out.
```

### Step 5 — Delay Until
- App: **Delay by Zapier**
- Event: **Delay Until**
- Date/Time: `{{appointment date/time}}` minus 1 hour

### Step 6 — Action: Twilio → Send SMS (SS-3: 1-Hour Reminder)
- App: **Twilio**
- Event: **Send SMS**
- From Number: `+18555500594`
- To Number: `{{client phone}}`
- Message Body:
```
Work Decoded: Hi {{first name}}! Your session starts in 1 hour at {{time}}. Join via Google Meet: {{shortened meet link}} You've got this. Reply STOP to opt out.
```

> **Note on Meet links:** The Google Meet link comes from Acuity's booking data. You need to shorten it with bit.ly/Rebrandly BEFORE it reaches the Twilio step. Option A: Use a Zapier "URL Shortener by Zapier" step between Step 5 and Step 6. Option B: Use a Formatter step to shorten it. Option C: If Acuity already outputs a short link, use that directly.

---

## Zap 1b: Cancellation Handler

**Name:** `WorkDecoded Cancel SMS Suppression`

### Step 1 — Trigger: Acuity Scheduling → Appointment Cancelled
- App: **Acuity Scheduling**
- Event: **Cancelled Appointment**

### Step 2 — Action: (Handle suppression)

> **Reality check:** Zapier's "Delay Until" steps in Zap 1 will still fire even if the appointment is cancelled — there's no built-in way to cancel a pending delay. Two approaches:
>
> **Option A (Simpler):** Add a **Filter** step right before each Twilio send (Steps 4 and 6) that checks Airtable to verify the session status ≠ "cancelled". This means Steps 4 and 6 become: Airtable Lookup → Filter → Twilio Send.
>
> **Option B (Cleaner):** Skip the Delay Until architecture entirely. Instead, use three separate Schedule-triggered Zaps that check Airtable each day for sessions happening tomorrow (SS-2) and in 1 hour (SS-3). This is what the README originally described and is more resilient to cancellations.

**Recommended: Option B** — separate daily/hourly scheduled Zaps with Airtable lookups. See Alternative Architecture below.

---

## Alternative Architecture (Recommended for Cancellation Safety)

If you want bulletproof cancellation handling, replace Zap 1's Delay Until approach with three independent Zaps:

### Zap 1a: SS-1 Only
- Trigger: Acuity → New Appointment
- Action: Twilio → Send SS-1 immediately

### Zap 1b: SS-2 (Daily Check)
- Trigger: Schedule by Zapier → Every Day at 9:00 AM ET
- Action 1: Airtable → Find Records where Session Date = tomorrow AND Status ≠ cancelled
- Filter: Only continue if records found
- Action 2: Loop (for each record) → Twilio → Send SS-2

### Zap 1c: SS-3 (Hourly Check)
- Trigger: Schedule by Zapier → Every Hour
- Action 1: Airtable → Find Records where Session DateTime is within next hour AND Status ≠ cancelled
- Filter: Only continue if records found
- Action 2: Loop (for each record) → Twilio → Send SS-3 with Meet link

---

## Zap 2: Package Purchase Confirmation (PKG-1)

**Name:** `WorkDecoded Package SMS (PKG-1)`

### Step 1 — Trigger: Airtable → New Record
- App: **Airtable**
- Event: **New Record**
- Account: (select the 6-Zap connection)
- Base: Work Decoded
- Table: **Packages** (or wherever package purchases land)

### Step 2 — Action: Twilio → Send SMS
- From Number: `+18555500594`
- To Number: `{{Phone}}` from Airtable
- Message Body:
```
Work Decoded: Hi {{First Name}}! Your {{Package Size}}-session package is confirmed. Sessions expire {{Expiration Date}}. Book anytime at WorkDecodedHQ.com. Reply STOP to opt out.
```

> **Airtable setup:** Ensure the Packages table has: First Name, Phone, Package Size (3 or 5), and Expiration Date (formula: DATEADD({Purchase Date}, 1, 'year')).

---

## Zap 3: Monthly Check-In (PKG-2)

**Name:** `WorkDecoded Monthly Check-In SMS (PKG-2)`

### Step 1 — Trigger: Schedule by Zapier
- Event: **Every Day** at 10:00 AM ET

### Step 2 — Action: Airtable → Find Records
- Table: **Packages**
- Formula filter: `AND({Sessions Remaining} > 0, {Package Expired} = FALSE(), MOD(DATETIME_DIFF(TODAY(), {Purchase Date}, 'days'), 30) = 0)`
- (Or use Zapier Filter step to check these conditions)

### Step 3 — Filter: Only Continue If
- Sessions Remaining > 0

### Step 4 — Action: Twilio → Send SMS (for each record)
- From Number: `+18555500594`
- To Number: `{{Phone}}`
- Message Body:
```
Work Decoded: Hi {{First Name}}! You have {{Sessions Remaining}} session(s) ready. How are things at work? Book a check-in anytime: {{Booking Link}} Reply STOP to opt out.
```

> **Booking Link:** Use a static shortened URL for the Acuity booking page (e.g., `bit.ly/bookWD`). Create this once in bit.ly and hardcode it in the message body.

---

## Zap 4: Final Month Reminder (PKG-3)

**Name:** `WorkDecoded Final Month SMS (PKG-3)`

### Step 1 — Trigger: Schedule by Zapier
- Event: **Every Day** at 10:00 AM ET

### Step 2 — Action: Airtable → Find Records
- Table: **Packages**
- Filter: Expiration Date is within 30 days AND Sessions Remaining > 0

### Step 3 — Filter: Only Continue If
- Sessions Remaining > 0

### Step 4 — Action: Twilio → Send SMS
- From Number: `+18555500594`
- To Number: `{{Phone}}`
- Message Body:
```
Work Decoded: Hi {{First Name}}! Your {{Sessions Remaining}} session(s) expire in 30 days on {{Expiration Date}}. Don't let them go! Book now: {{Booking Link}} Reply STOP to opt out.
```

---

## Pre-Launch Checklist

- [ ] Twilio connected in Zapier (Step 0)
- [ ] Create shortened booking link (bit.ly/bookWD or similar) — hardcode in PKG-2 and PKG-3
- [ ] Verify Airtable "Packages" table has: First Name, Phone, Package Size, Purchase Date, Expiration Date, Sessions Remaining
- [ ] Verify Airtable "Sessions" table has: First Name, Phone, Session Date, Session Time, Status, Google Meet Link
- [ ] Build Zap 1 (or 1a/1b/1c) — test with a test appointment in Acuity
- [ ] Build Zap 2 — test with a test package record in Airtable
- [ ] Build Zap 3 — test with a package record that hits the 30-day interval
- [ ] Build Zap 4 — test with a package record expiring within 30 days
- [ ] Send test SMS to Jose's phone for each template
- [ ] Send test SMS to Michelle's phone for final approval
- [ ] Configure STOP/HELP auto-replies in Twilio Console
- [ ] Publish all Zaps (toggle ON)

---

## Quick Reference: All Message Bodies

### SS-1 (130 chars)
```
Work Decoded: Hi [First Name]! Your session is confirmed for [Date] at [Time]. We're ready for you — see you then! Reply STOP to opt out.
```

### SS-2 (151 chars)
```
Work Decoded: Hi [First Name]! Your session is tomorrow at [Time]. Your consultant is prepared and ready for you. See you then! Reply STOP to opt out.
```

### SS-3 (151 chars)
```
Work Decoded: Hi [First Name]! Your session starts in 1 hour at [Time]. Join via Google Meet: [Short Meet Link] You've got this. Reply STOP to opt out.
```

### PKG-1 (155 chars)
```
Work Decoded: Hi [First Name]! Your [3/5]-session package is confirmed. Sessions expire [Expiration Date]. Book anytime at WorkDecodedHQ.com. Reply STOP to opt out.
```

### PKG-2 (152 chars)
```
Work Decoded: Hi [First Name]! You have [#] session(s) ready. How are things at work? Book a check-in anytime: [Short Booking Link] Reply STOP to opt out.
```

### PKG-3 (158 chars)
```
Work Decoded: Hi [First Name]! Your [#] session(s) expire in 30 days on [Expiration Date]. Don't let them go! Book now: [Short Booking Link] Reply STOP to opt out.
```

---

Work Decoded | WorkDecodedHQ.com | support@workdecodedhq.com
