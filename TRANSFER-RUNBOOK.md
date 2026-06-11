# Work Decoded — System Runbook

**Purpose:** everything an operator/engineer needs to run this system — accounts, architecture, every automation, the data model, day-to-day operations, and troubleshooting. Current as of **2026-06-10**; the full pipeline was verified end-to-end on this date.

> Companion docs: `NAMING.md` (canonical nomenclature — names and spellings used everywhere), `SOP.md` (day-to-day + maintainer procedures), `TRAINING.md` (onboarding plan), `scripts/AUTOMATION-AND-TEMPLATES.md` (flow + all message copy), `scripts/setup-twilio-sms.js` (canonical SMS copy). Where docs disagree, **this runbook wins**.

---

## 1. What this system is

A consulting business ("Work Decoded") that sells short workplace-advisory sessions. A client books on the website → the booking lands in Airtable → a human (Michelle) accepts it → automations send confirmations/reminders by SMS, create the Google Meet + calendar event, and invoice via Square. Feedback is collected after the session. Pre-paid multi-session packages are supported via redeemable package codes.

**The one manual gate:** Michelle sets a Session's `Status` → **Accepted**. That single change fires the confirmation SMS, the calendar/Meet event, and the paid-tier invoice.

---

## 2. Architecture / end-to-end flow

```
Client books on the site (/book → intake-form.html)
        │  posts to /api/book (server proxy: validates, rate-limits,
        │  bot-screens, normalizes the tier to Title Case, then forwards
        │  to the Zapier catch-hook — hook URL lives in a server env var)
        ▼
[Zap] WorkDecoded Intake → Airtable CRM  (LIVE, v15)
  • Create Client record
  • Create Session record (Status = Pending)        ← waits for Michelle
  • Send branded client email + consultant email
    (consultant email carries a SIGNED feedback link — see §8)
        │
        ▼
Michelle reviews → sets Session Status = Accepted     ← THE manual gate
        │
        ├─►[Zap] SS-1v2: Accepted → Calendar + SMS
        │     • Create Google Calendar event + Google Meet
        │     • Write Meet Link + Event ID back to the Session
        │     • Send SS-1 confirmation SMS
        │     (guard: only fires while Meet Link is empty → fires once)
        │
        └─►[Zap] INV-0: Accepted → Create Invoice  (if Session Price > 0)
              • Create Invoices row (Status=Pending, Due Date=Session Date)
                    │
                    ▼
              [Zap] INV-1: Pending invoice → Square
                • Find/create Square customer, build invoice, PUBLISH (emails it)
                • Write Square Invoice ID back; Status → Sent
        │
        ▼
[Zap] SS-2 (24h before) → reminder SMS     (checkbox guard → fires once)
[Zap] SS-3 (1h before)  → reminder SMS WITH Meet link  (same guard)
        │
        ▼
Session happens on Google Meet
        │
        ▼
Calendar event ends → [Zap] Post-Session → consultant feedback request
                      (email carries a SIGNED feedback link)
        │
        ▼
Invoice paid in Square → [Zap] INV-2 → if a package ("…pack"), issue a
                         PKG-XXXX-XXXX code, mark the invoice, email the
                         client, and log to Code Activity Log
```

Bookings with a session date **under 24 hours away** get their "24-hour" reminder immediately on Accept (the delay target is already past) — expected behavior, not a bug.

---

## 3. Accounts & access

| System | Account / identifier | Notes |
|---|---|---|
| **Zapier** | Michelle Williams — personal account, logged in as `support@workdecodedhq.com` | All Zaps live here. Consolidating to a business-owned account is accepted future work, not a blocker. Until then, do not rotate or disconnect its app connections — every Zap depends on them. |
| **Airtable** | Base `appG108B0ALyLJ4A3` "Work Decoded - Client Records" (owned by Work Decoded). Zapier connects via `jose@thealphacreative.com` (AlphaCreative business account, invited collaborator; used in 17 Zaps). | No ownership issue. |
| **Twilio** | Toll-free **+18555500594**, A2P 10DLC verified. | `To` must be `+1` + 10 digits (E.164). `From` = `+18555500594`. SMS is sent by Zapier's Twilio steps, not by the website. Texts only go to clients who opted in (`SMS Consent` checkbox, enforced by the SMS Zaps). |
| **Square** | Sends the actual invoices. | INV-1 creates + publishes; INV-2 reacts to paid invoices. |
| **Google Calendar** | `hello@workdecodedhq.com` (America/New_York). | The site's service account has **read-only** access for availability checks; SS-1v2 creates events via Zapier's Google Calendar connection. Deleting/moving events must be done by hand in the Calendar UI. |
| **Netlify** | Site `workdecodedhq` (`8ff8a701-45db-4ad2-ad59-5f8254204eb2`). | Deploys from GitHub `main`. Branch pushes get deploy previews. |
| **GitHub** | `AlfaroJay/work-decoded` | Production branch: `main`. |
| **Squarespace** | Marketing site `www.workdecodedhq.com`. | Custom nav + the `/book`→`book.workdecodedhq.com` redirect live in **Code Injection**; the footer is a **global code block**. |
| **Acuity** | `workdecodedhq.as.me` (legacy scheduler, still live). | Bookings made there import to Airtable via the "New Acuity appointment to Airtable" Zap, but bypass the SMS/invoice pipeline. Treat any Acuity booking as out-of-band. |

**Netlify env vars** (site settings; see `.env.local.example`): `AIRTABLE_PAT`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_CALENDAR_ID` (=`hello@workdecodedhq.com`), `SHORTENER_API_KEY`, `ZAPIER_INTAKE_WEBHOOK` (the intake catch-hook URL — server-side only), `LINK_SIGNING_SECRET` (HMAC secret for consultant links; must match the Zapier Code steps — see §8). Env-var changes require a redeploy to reach the API routes.

---

## 4. The website (Next.js 14, App Router)

- **Repo:** `AlfaroJay/work-decoded`, deploys from `main` to Netlify. Node 20.
- **Routes that take real traffic:** `/book` → `public/intake-form.html` (the live form); `/feedback` → `public/feedback-form.html`. Rewrites are in `next.config.js`.
- **API routes** (`src/app/api/*`):
  - `book` — the booking proxy. Validates required fields, screens bots (honeypot + render-time trap, both fail-open and silently dropped when tripped), normalizes the tier to Title Case, rate-limits per IP, forwards the unchanged payload to the Zapier catch-hook. **Do not rename payload keys** — the intake Zap's trigger mapping depends on the exact field names.
  - `availability` — Google Calendar free/busy for the date picker. DST-aware ET offsets. Fails closed (an error means "no slots", never "all slots").
  - `validate-code` — package-code lookup. Input allowlist `^[A-Z0-9-]{4,32}$` is the security boundary; don't loosen it.
  - `session` / `intake` / `feedback` — consultant-facing reads/writes, authenticated by **signed, expiring tokens** (§8). Bare Airtable record IDs are rejected with 401.
  - `shorten` + `r/[slug]` — branded URL shortener (`l.workdecodedhq.com`); destinations restricted to `meet.google.com` and `*.workdecodedhq.com`.
  - `submit` — dead code (the form posts to `book`); kept rate-limited but unused, safe to delete with care.
- All public routes carry per-IP rate limiting (`src/lib/rateLimit.ts`, fail-open).
- **Date/time standard:** everything client/consultant-facing reads "Monday, June 8 at 4:45 PM ET", sourced from Airtable formula fields `Session Date Pretty` / `Session Time Pretty` (always Eastern).

---

## 5. Airtable data model (base `appG108B0ALyLJ4A3`)

### Sessions — `tbloaE6gs8pZwx9j8`
| Field | ID | Notes |
|---|---|---|
| Session ID | `fld2yMRCaBypYQF8k` | autonumber |
| Status | `fldEQ8J8Qj8KZOsNG` | singleSelect Pending/Accepted/Completed/Cancelled; **"Accepted" fires everything**; intake sets Pending |
| Session Type | `fld6RIbB9L3Rbv8bR` | singleSelect: `Standard` / `Premier` / `Crisis` / `Discovery` (Title Case — see NAMING.md) |
| Session Date | `fld3phAqfSQxhMpoX` | dateTime (UTC instant) |
| Session Price | `fldXCwW3Q1eSwHycF` | formula: Standard 100 / Premier 125 / Crisis 175 / Discovery 0; 0 if package code; honors Price Override |
| Session End | `fldFMj1RNqe5wRzhX` | formula ISO-8601 UTC = start + 15min(Discovery)/30min |
| Reminder 24h Time | `fldDgK8zzUDoPjgEM` | formula ISO-8601 UTC = Session Date − 24h → SS-2 Delay Until |
| Reminder 1h Time | `fldPsOZeOTlVSWQ8L` | formula ISO-8601 UTC = Session Date − 1h → SS-3 Delay Until |
| Reminder 24h Scheduled | `fldnPZKjDYUeJoH30` | checkbox; **SS-2 dedup guard** — set by the Zap before its delay; untick to deliberately re-send |
| Reminder 1h Scheduled | `fldKNjlPF6C6rgFrO` | checkbox; **SS-3 dedup guard** — same pattern |
| SMS Consent | `fldogTAlo7CwFFRto` | checkbox from the form; SMS Zaps only text when true |
| Meet Link | `fldI53l7edokb9uKE` | url; set by SS-1v2 on Accept; used by SS-3 + the SS-1v2 fire-once guard |
| Google Calendar Event ID | `fldqST96z4MDiycwS` | set by SS-1v2; joins the post-session Zap back to this row |
| Booking Code | `fldpfpNSsZOndgJng` | client-facing reference, `WD-XXXX-XXXX` |
| Session Date Pretty | `fldnUroYIy49ZXEzU` | "Tuesday, June 9" |
| Session Time Pretty | `fldEJ24bOeibUd3Mn` | "9:00 AM ET" |
| Price Override | `fld6ACBELaaFsZqK4` | currency; manual price for custom quotes (e.g. post-Discovery invoice) |
| First Name (from Client) | `fldILNCXJFwTmuJjZ` | lookup |
| Phone (from Client) | `fldOOpywFzikb3qmq` | lookup (10-digit; prefix `+1` for Twilio) |
| Client | `fldYUcVGJIyOA64CZ` | link → Clients |
| Invoices | `fldBJaNg8Yp4GfQbF` | link → Invoices |

### Clients — `tblv8GHs4Ui6MivvJ`
First Name `fldfDAKjntoogVqfV` · Phone `fldAmKpo0NhU6MXxY` · Email `fldNwChPv09T8Ln79`, plus the full intake (employer, industry, situation, legal categories, consents, etc.) and `Intake Brief` (formula — the consultant email body).

### Invoices — `tblDsLqu5xQTXJnDf`
Invoice Number `fldbhgfIaEE1jPwrP` (format `WD-YYYY-NNN`) · Client `fldwwI5yYPpRePJCp` · Session `fldTQbQFOHDSXbzAB` · Amount `fld7zJWGd68pYOZSF` · Status `fldCtwEix0czYxvBx` (Draft/Pending/Sent/Paid) · Invoice Date `fld5iZIvMM505ulyz` · Due Date `fldF0su5R9sKOmawO` (set by INV-0 = session date) · Square Invoice ID `fldm827e6WFfmGC31` · Package Type `fldTakl3KFTLY8OCN` · **Package Code Issued** `fldzvvymDqC8b5K8D` (checkbox; INV-2 dedup guard — set by the Zap when a code is issued).

### Package Codes — `tblljv2xBOHUgV6S9`
Code `fldeUcZZnU6PwgBG9` (format `PKG-XXXX-XXXX`) · Client `fldHeLOO2vHAWsIqU` · Package Type `fldO8hH4nwzs0SjcK` · Sessions Purchased `fld3zSvuIuVmWKzsp` · Issued `fld1MFtLXPHiDtyzL` · Expires `fldfvTRwRC5RuyZog` (blank = never, per the marketing-site promise) · Sessions (redeemed links) · Notes.

### Code Activity Log — `tbls5B0UqhnriI28g`
Audit trail of code issuance/redemption events, written by the Zaps.

---

## 6. Zapier — every Zap and its current state

| Zap | ID | State | What it does |
|---|---|---|---|
| WorkDecoded Intake → Airtable CRM | `360012684` (v15) | **LIVE** | Booking form → Client + Session (Status=Pending) + branded client email + consultant email with the intake brief and a **signed** feedback link (Code step, §8). |
| SS-1v2: Accepted → Calendar + SMS | `366933187` | **LIVE** | On Accept: Google Calendar event + Meet, saves Meet Link, sends SS-1 SMS. Filter: `Status = Accepted` AND `Meet Link does not exist` → fires once. |
| INV-0: Accepted → Create Invoice | `367782983` | **LIVE** | On Accept + `Session Price > 0` + no existing invoice → create Invoices row with `Due Date = Session Date`. |
| INV-1: Invoice Request → Square | `367637945` | **LIVE** | Pending invoice → Square: find/create customer, create invoice, publish (emails it), write Square ID back, Status → Sent. |
| INV-2: Invoice Paid → Package Code + Email | `367640419` (v2) | **LIVE** | Paid **pack** invoice (filter: `Package Type contains "pack"` AND `Package Code Issued is false`) → generate `PKG-XXXX-XXXX` (Code step), create the Package Codes row with Sessions Purchased, **mark the invoice issued**, email the code to the client, log the event. Single-session invoices never produce codes. |
| SS-2: 24-Hour Reminder SMS | `367789675` (v3) | **LIVE** | On Accept (+ Meet Link exists + `Reminder 24h Scheduled` is false) → **check the box** → Delay Until `Reminder 24h Time` → SS-2 SMS. The box is set before the delay, so record edits can never schedule duplicates. |
| SS-3: 1-Hour Reminder SMS | `367805536` (v2) | **LIVE** | Same structure with `Reminder 1h Scheduled`; SS-3 SMS includes the Meet link. |
| Post-Session → Consultant Feedback Reminder | `363446853` (v7) | **LIVE** | Calendar event ends → find the Session → mint a **signed** feedback link (Code step, §8) → email the consultant. Skips if feedback was already submitted (grace-window filter). |
| WorkDecoded Feedback → Airtable Sessions | `361193654` | **LIVE** | Legacy webhook path that records feedback into the Session row. |
| New Acuity appointment to Airtable | — | **LIVE** | Legacy import: Acuity bookings → Airtable records (no SMS/invoice automation). |
| PKG-1/2/3 (package SMS flows) | `366927461` / `366927973` / `366928327` | OFF (skeletons) | Build when packages launch and there's real volume to message. |

---

## 7. SMS copy (source of truth: `scripts/setup-twilio-sms.js`)

Merge fields from Airtable: name = `First Name (from Client)`, time = `Session Time Pretty`, date = `Session Date Pretty`, Meet link = `Meet Link`. Every message ends "Reply STOP to opt out." (A2P compliance).

```
SS-1 (on Accept):
Work Decoded: Hi {First Name}! Your session is confirmed for {Date} at {Time}. We're ready for you — see you then! Reply STOP to opt out.

SS-2 (24h):
Work Decoded: Hi {First Name}! Your session is tomorrow at {Time}. Your consultant is prepared and ready for you. See you then! Reply STOP to opt out.

SS-3 (1h, carries Meet link):
Work Decoded: Hi {First Name}! Your session starts in 1 hour at {Time}. Join via Google Meet: {Meet Link} You've got this. Reply STOP to opt out.

PKG-1/2/3: see scripts/AUTOMATION-AND-TEMPLATES.md §3 (not yet live).
```

---

## 8. Signed consultant links (how link auth works)

Consultant-facing pages (`/api/session`, `/api/intake`, `/api/feedback`, and the pages that call them) require a **signed, expiring token** in the `t` query parameter. A bare Airtable record ID is rejected with 401.

- **Format:** `recXXXXXXXXXXXXXX.<expiresUnix>.<sig>` where `sig` = first 32 hex chars of HMAC-SHA256 over `recordId.expires`, keyed by `LINK_SIGNING_SECRET`. TTL is 60 days.
- **Verifier:** `src/lib/signedToken.ts` (the file documents the matching generator).
- **Minters:** two "Run Javascript" Code steps in Zapier — one in the intake Zap (consultant email) and one in the Post-Session Zap (feedback reminder). Both embed the same secret.
- **Rotating the secret:** generate a new value → update `LINK_SIGNING_SECRET` in Netlify → trigger a redeploy → update the constant in **both** Zapier Code steps → publish both Zaps. Links sent before rotation stop working (consultants can use the link in their most recent email).
- A consultant reporting "Invalid or expired link" should be sent a fresh link: easiest is re-running the relevant Zap step, or minting a token with the documented snippet.

---

## 9. Pricing & invoice logic

| Tier | Price | Invoice |
|---|---|---|
| Discovery | $0 | Manual, **after** the call (set `Price Override` on the session or create a Pending Invoices row with an amount + due date — INV-1 sends it) |
| Standard | $100 | Auto on Accept |
| Premier | $125 | Auto on Accept |
| Crisis | $175 | Auto on Accept |
| Package-code session | $0 (pre-paid) | No invoice |

Rule (INV-0): on Accept, create an invoice only when `Session Price > 0`. INV-1 publishes it in Square with payment due = the session date.

**Packages:** a paid invoice whose `Package Type` contains "pack" triggers INV-2, which issues a `PKG-XXXX-XXXX` code (NAMING.md §3), emails it to the client, and logs the event. The `Package Code Issued` checkbox on the invoice guarantees one code per invoice.

---

## 10. Operating procedures (day-to-day)

See `SOP.md` for the full procedures. The essentials:

**Accept a booking →** In Airtable Sessions, set `Status` = `Accepted`. Within ~5 min: SS-1 confirmation text, a Google Calendar event + Meet on `hello@workdecodedhq.com`, and (for paid tiers) a Square invoice emailed to the client. SS-2/SS-3 reminders schedule automatically and can each fire only once per session.

**Verify a send →** Zapier → Zap History, filter by the Zap. SMS delivery shows in the Twilio Console. Calendar events appear on `hello@workdecodedhq.com`.

**The "new field" gotcha:** a newly added Airtable field won't appear inside a Zap until you re-sample the trigger (trigger step → Test → "Find new records" → pick a record where that field is populated). Note that **unchecked checkboxes are invisible** to Zapier sampling — populate the field on a record first.

**Other Zapier gotchas:** paste ISO-8601 with a trailing `Z` into Delay/date fields (the formula fields already output that). Twilio `To` = `+1` + 10 digits. Never click "Test step" on a Twilio/Square step unless you intend a real send.

---

## 11. Safe-change workflow (so you never break live bookings)

1. Work on a **branch**, never directly on `main`. Push it → Netlify builds a **deploy preview** (production untouched).
2. Test on the preview URL: submit throwaway bookings, walk the date picker.
3. Make changes **additive and backwards-compatible** first; remove the old path only after the new one is proven in production.
4. Merge to `main` only after the preview checks out. Netlify has instant rollback.
5. For Zaps: edit creates a draft; **Publish** turns it live. Test steps that don't send (filters, delays, code, Airtable lookups) freely; **never** "Test step" on Twilio/Square steps casually (it really sends).
6. Env-var changes need a redeploy to take effect (an empty commit works).

---

## 12. Known limitations & hardening backlog (forward-looking)

- **Bot defense** on `/api/book` is honeypot + render-time trap + rate limiting. If junk bookings ever appear, the escalation path is a vendor CAPTCHA (Turnstile / reCAPTCHA / hCaptcha) — single integration point in `/api/book` plus a widget on the form.
- **INV-2's trigger leg** (Square "New Paid Invoice") gets its first real exercise when a customer actually pays a pack invoice — watch Zap History after the first package sale. Every downstream step is individually verified.
- **PKG-1/2/3 SMS flows** are unbuilt skeletons; build them when packages have real volume.
- **Account consolidation:** Zapier lives on a personal account and the calendar on `hello@` — accepted as-is. If consolidating later: move/re-auth every Zap connection under business credentials, rotate all secrets, and re-run a full test booking (see §13).
- **`validate-code`** returns slightly more metadata than strictly needed; the input allowlist is the real boundary.
- **Acuity** remains a live side-door for bookings (imported to Airtable, no automations). Retire it when Michelle is ready.

---

## 13. Full pipeline test (run after any major change)

1. Book via the live form (use a real phone you control, tick SMS consent; pick a time 60–90 min out for fast reminder turnaround).
2. Verify in Airtable: Client + Session created, Status=Pending, tier in Title Case, price correct.
3. Set Status=Accepted. Within ~5 min verify: SS-1 text, calendar event + Meet link (exactly one), invoice row → Square invoice emailed (Status=Sent + Square ID).
4. Reminders: confirm `Reminder … Scheduled` boxes get checked and each text arrives once (for <24h bookings the 24h text arrives immediately).
5. After the calendar event ends: consultant feedback email arrives; its link opens the feedback form (signed link works).
6. Edit the accepted session (change any field) and confirm **no** duplicate texts/events/invoices result.
7. Clean up: delete the Airtable rows (Session, Client, Invoice), delete the calendar event by hand, **void the Square invoice** in the Square dashboard.

---

## 14. Emergency / rollback

- **A Zap is misbehaving:** turn it OFF (toggle in Zapier) — instant, deletes nothing. Check Zap History for the error.
- **A bad website deploy:** Netlify → Deploys → instant rollback to the previous build.
- **Duplicate texts/events/invoices:** turn the offending Zap OFF first, then clean up by hand (calendar events manually; Airtable rows via the UI). Check that the Zap's dedup guard (Meet-Link filter or `… Scheduled`/`… Issued` checkbox) is intact before turning it back on.
- **Bookings failing on the site:** Netlify function logs for `/api/book`; confirm `ZAPIER_INTAKE_WEBHOOK` exists. The form shows clients a fallback message with `support@workdecodedhq.com`.
- **Invoice never reached the client:** Zap History → INV-1 → read the error (usually a missing Due Date). Fix the row and use **"Replay errored steps"**, never a full replay (a full replay can duplicate the invoice).
- **Consultant link says invalid/expired:** send a fresh signed link (§8).
