# Work Decoded — Automation & Templates Reference

**Internal operations reference** for the booking → confirmation → reminders → feedback → invoicing pipeline. One place for every client message and the logic behind when each fires. Keep in sync with the live Zaps (Michelle Williams · Personal) and `scripts/setup-twilio-sms.js` (the approved-copy source).

---

## 1. The full flow at a glance

```
Client books (intake form, /book)
        │  Zapier intake webhook
        ▼
WorkDecoded Intake → Airtable CRM  (LIVE)
  • Create Client record
  • Create Session record  (Status = Pending)   ← waits for Michelle
  • Send confirmation email (Gmail)              ← booking received
        │
        ▼
Michelle reviews → sets Session Status = Accepted
        │  (this is the single manual gate)
        ▼
SS-1v2: Session Accepted → Calendar + SMS
  • Create Google Calendar event WITH Google Meet  → Meet link
  • Save Meet Link + Event ID back to the Session
  • Send SS-1 confirmation SMS
        │
        ├─►  Session Accepted → Create Invoice  (if Session Price > 0)
        │      → Invoices row (Status = Pending) → INV-1 → Square invoice sent
        │
        ▼
SS-2  (24h before)  → reminder SMS
SS-3  (1h before)   → reminder SMS WITH Meet shortlink
        │
        ▼
Session happens on Google Meet
        │
        ▼
Calendar event ends → consultant feedback request (email + /feedback link)
        │
        ▼
Invoice paid (Square) → INV-2 → if a package, issue Package Code
```

**Manual actions Michelle owns:** (1) Accept each session, (2) send the **post-Discovery** invoice (custom amount) after a free intro call, (3) refund/adjust as needed.

---

## 2. Pricing & invoice logic

Prices live on the intake form + website (`prices` in `intake-form.html`):

| Tier | Price | Duration | Invoice |
|---|---|---|---|
| **Discovery** | Free ($0) | 15 min | **Manual, AFTER the call** (Michelle sends a custom invoice for the engagement) |
| **Standard** | $100 | 30 min | **Auto, on Accept** (paid immediately) |
| **Premier** | $125 | 30 min | **Auto, on Accept** (paid immediately) |
| **Crisis** | $175 | 30 min | **Auto, on Accept** (paid immediately) |
| **Package-code redemption** | $0 (pre-paid) | — | **No invoice** (already paid) |

The form writes the computed price to the Session's **`Session Price`** field (`quotedTotal`: 0 for Discovery and package-code, else the tier price). The auto-invoice rule is one condition:

> **On Accept, create an invoice only when `Session Price > 0`.**

That automatically does the right thing: paid tiers invoice immediately; Discovery (0) and package-code (0) are skipped. Discovery's post-call invoice is sent by hand through the same Invoices → INV-1 → Square path.

**Best-practice note:** paid tiers are invoiced at confirmation with payment due before the session — standard for advisory work and the main protection against no-show non-payment.

---

## 3. SMS templates (Twilio — approved, from `WorkDecoded_Complete_SMS_Templates.docx`)

Merge fields are filled from Airtable. Date = `Session Date Pretty` ("Monday, June 8"), time = `Session Time Pretty` ("4:45 PM ET") — both derived from `Session Date` so they're always present and in Eastern time. Meet link = shortened `Meet Link` (l.workdecodedhq.com).

**SS-1 — Booking Confirmation** (on Accept)
```
Work Decoded: Hi {First Name}! Your session is confirmed for {Date} at {Time}. We're ready for you — see you then! Reply STOP to opt out.
```

**SS-2 — 24-Hour Reminder**
```
Work Decoded: Hi {First Name}! Your session is tomorrow at {Time}. Your consultant is prepared and ready for you. See you then! Reply STOP to opt out.
```

**SS-3 — 1-Hour Reminder** (carries the Meet link)
```
Work Decoded: Hi {First Name}! Your session starts in 1 hour at {Time}. Join via Google Meet: {Meet Shortlink} You've got this. Reply STOP to opt out.
```

**PKG-1 — Package Purchase Confirmation**
```
Work Decoded: Hi {First Name}! Your {3/5}-session package is confirmed. Sessions expire {Expiration Date}. Book anytime at WorkDecodedHQ.com. Reply STOP to opt out.
```

**PKG-2 — Monthly Check-In**
```
Work Decoded: Hi {First Name}! You have {#} session(s) ready. How are things at work? Book a check-in anytime: {Booking Link} Reply STOP to opt out.
```

**PKG-3 — Final Month Reminder**
```
Work Decoded: Hi {First Name}! Your {#} session(s) expire in 30 days on {Expiration Date}. Don't let them go! Book now: {Booking Link} Reply STOP to opt out.
```

**Compliance (Twilio Console):**
- Consent checkbox copy (on the form) and STOP/HELP auto-replies are the approved A2P 10DLC language.
- All sends end with "Reply STOP to opt out." Reminders skip if the session is cancelled/completed or the client opted out.

---

## 4. Email + invoice

- **Booking confirmation email** — Gmail step in the intake Zap, sent when the booking is received. Includes the booking reference (WD-XXXX-XXXX) and notes the session is via Google Meet at the scheduled time. *(Should reference the same `Session Date Pretty` / `Session Time Pretty` for date/time consistency.)*
- **Invoice** — generated and emailed by **Square** (no custom copy; Square's template). Triggered by INV-1 when a Pending Invoices row appears. Paid invoices flow to INV-2, which issues a Package Code for pack purchases.

---

## 5. Date/time format — single standard

Everywhere a client or consultant sees a session time it reads: **"Monday, June 8 at 4:45 PM ET"** (date = *Weekday, Month D*; time = *h:mm AM/PM ET*). Sourced from the two Airtable formula fields `Session Date Pretty` / `Session Time Pretty`, and matched in the form success screen, consultant intake-view, and feedback form. All forced to Eastern.

---

## 6. Zap status (as of this reference)

| Zap | Purpose | State |
|---|---|---|
| WorkDecoded Intake → Airtable CRM | Booking → records + email | LIVE (calendar step to be removed — moved to SS-1v2) |
| SS-1v2: Session Accepted → Calendar + SMS | Accept → Meet + SS-1 | Built; **OFF** pending final validation |
| Session Accepted → Create Invoice | Auto-invoice paid sessions | **To build** |
| SS-2 / SS-3 reminders | 24h / 1h reminders | Built; **OFF** — verify copy + publish |
| PKG-1 / PKG-2 / PKG-3 | Package SMS | Built; **OFF** — verify + publish |
| INV-1: Invoice Request → Square | Pending invoice → Square | LIVE |
| INV-2: Invoice Paid | Paid → package code | LIVE |

---

*Source of truth for SMS copy: `scripts/setup-twilio-sms.js`. Architecture/handoff: `COWORK_HANDOFF.md`.*
