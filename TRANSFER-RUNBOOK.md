# Work Decoded — Transfer Runbook

**Purpose:** everything a new operator/engineer needs to take this system over cold — accounts, architecture, every automation, the data model, how to run it day-to-day, what's fragile, and what's still pending. Current as of **2026-06-10**, reconciled against the live Airtable base, Netlify site, and git state that day (see §13 Changelog).

> Companion docs: `SOP.md` (Nick's day-to-day + maintainer procedures), `TRAINING.md` (Nick's onboarding plan), `scripts/AUTOMATION-AND-TEMPLATES.md` (flow + all message copy), `scripts/setup-twilio-sms.js` (canonical SMS copy), `AUDIT-2026-06-08.md` (audit findings + fixes). Where this runbook and older handoff docs disagree, **this runbook wins** — it reflects the live state.

---

## 1. What this system is

A consulting business ("Work Decoded") that sells short workplace-advisory sessions. A client books on the website → the booking lands in Airtable → a human (Michelle) accepts it → automations send confirmations/reminders by SMS, create the Google Meet + calendar event, and invoice via Square. Feedback is collected after the session.

**The one manual gate:** Michelle sets a Session's `Status` → **Accepted**. That single change fires the confirmation SMS, the calendar/Meet event, and the paid-tier invoice.

---

## 2. Architecture / end-to-end flow

```
Client books on the site (/book → intake-form.html)
        │  posts to /api/book (server proxy: validates, rate-limits,
        │  forwards to the Zapier catch-hook — hook URL is now a server
        │  env var, no longer exposed in client code; live 2026-06-10)
        ▼
[Zap] WorkDecoded Intake → Airtable CRM  (LIVE)
  • Create Client record
  • Create Session record (Status = Pending)        ← waits for Michelle
  • Send client confirmation email + consultant email
        │
        ▼
Michelle reviews → sets Session Status = Accepted     ← THE manual gate
        │
        ├─►[Zap] SS-1v2: Accepted → Calendar + SMS
        │     • Create Google Calendar event + Google Meet
        │     • Write Meet Link + Event ID back to the Session
        │     • Send SS-1 confirmation SMS
        │     (guard: only if Meet Link is empty → fires once)
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
[Zap] SS-2 (24h before) → reminder SMS
[Zap] SS-3 (1h before)  → reminder SMS WITH Meet link
        │
        ▼
Session happens on Google Meet
        │
        ▼
Calendar event ends → [Zap] Post-Session → consultant feedback request (email + /feedback)
        │
        ▼
Invoice paid in Square → [Zap] INV-2 → if a package, issue a Package Code
```

---

## 3. Accounts & access (⚠️ read this before a real transfer)

| System | Account / identifier | Notes |
|---|---|---|
| **Zapier** | Michelle Williams — **personal** account, logged in as `support@workdecodedhq.com` | ⚠️ All Zaps live here. For an airtight transfer, move them to a business-owned Zapier account (see §12). |
| **Airtable** | Base `appG108B0ALyLJ4A3` "Work Decoded - Client Records". Zapier connects to it via the **`jose@thealphacreative.com`** Airtable account (used in 17 Zaps). | ⚠️ Connected through a personal account; re-auth under a business account during transfer. |
| **Twilio** | Toll-free **+18555500594**, A2P 10DLC verified. | `To` must be `+1` + 10 digits (E.164). `From` = `+18555500594`. SMS is sent by Zapier's Twilio steps, not by the website. |
| **Square** | Sends the actual invoices. | INV-1 creates + publishes; INV-2 reacts to paid. |
| **Google Calendar** | `hello@workdecodedhq.com` (America/New_York). | Service account has **read-only** here for the site's availability check; SS-1v2 creates events via Zapier's Google Calendar connection. To delete events you must do it by hand in the Calendar UI. |
| **Netlify** | Site `workdecodedhq` (`8ff8a701-45db-4ad2-ad59-5f8254204eb2`). | Deploys from GitHub `main`. Branch pushes get deploy previews. |
| **GitHub** | `AlfaroJay/work-decoded` | Production branch: `main`. |

**Env vars** (Netlify site settings; see `.env.local.example`): `AIRTABLE_PAT`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_CALENDAR_ID` (=`hello@workdecodedhq.com`), `SHORTENER_API_KEY`, and `ZAPIER_INTAKE_WEBHOOK` (the intake catch-hook URL — server-side only since 2026-06-10; it is no longer hardcoded in `public/intake-form.html`).

---

## 4. The website (Next.js 14, App Router)

- **Repo:** `AlfaroJay/work-decoded`, deploys from `main` to Netlify. Node 20.
- **Routes that take real traffic:** `/book` → `public/intake-form.html` (the live form); `/feedback` → `public/feedback-form.html`. Rewrites are in `next.config.js`.
- **API routes** (`src/app/api/*`): `availability` (Google Calendar free/busy), `validate-code` (package-code lookup), `submit`/`intake`/`session`/`feedback`/`shorten`, `legal/[slug]`, and `r/[slug]` (URL-shortener redirect).
- **Intake path (since 2026-06-10):** the form posts to **`/api/book`**, a same-origin server proxy that validates required fields, caps free-text length, rate-limits per IP (10/min, fail-open), and forwards the unchanged JSON payload to the Zapier catch-hook (`ZAPIER_INTAKE_WEBHOOK` env var). **Do not rename payload keys in `/api/book`** — the intake Zap's trigger mapping depends on the exact field names. `src/app/api/submit/route.ts` and `src/components/DateTimePicker.tsx` remain dead code (rate-limited but unused).
- All public API routes now carry per-IP rate limiting (`src/lib/rateLimit.ts`, fail-open).
- **Booking reference code:** `WD-XXXX-XXXX`, generated client-side and stored on the Session (`Booking Code`).
- **Date/time standard:** everything the client/consultant sees reads "Monday, June 8 at 4:45 PM ET", sourced from Airtable formula fields `Session Date Pretty` / `Session Time Pretty` (always Eastern).

---

## 5. Airtable data model (base `appG108B0ALyLJ4A3`)

### Sessions — `tbloaE6gs8pZwx9j8`
| Field | ID | Notes |
|---|---|---|
| Session ID | `fld2yMRCaBypYQF8k` | autonumber |
| Status | `fldEQ8J8Qj8KZOsNG` | singleSelect; **"Accepted" fires everything** |
| Session Type | `fld6RIbB9L3Rbv8bR` | singleSelect (see option-sprawl note in §11) |
| Session Date | `fld3phAqfSQxhMpoX` | dateTime (UTC instant) |
| Session Price | `fldXCwW3Q1eSwHycF` | formula: Standard 100 / Premier 125 / Crisis 175 / Discovery 0; 0 if package code |
| Session End | `fldFMj1RNqe5wRzhX` | formula ISO-8601 UTC = start + 15min(Discovery)/30min |
| Reminder 24h Time | `fldDgK8zzUDoPjgEM` | formula ISO-8601 UTC = Session Date − 24h → SS-2 Delay Until |
| Reminder 1h Time | `fldPsOZeOTlVSWQ8L` | formula ISO-8601 UTC = Session Date − 1h → SS-3 Delay Until |
| Meet Link | `fldI53l7edokb9uKE` | url; set by SS-1v2 on Accept; used by SS-3 + dedup guards |
| Google Calendar Event ID | `fldqST96z4MDiycwS` | set by SS-1v2 |
| Booking Code | `fldpfpNSsZOndgJng` | WD-XXXX-XXXX |
| Session Date Pretty | `fldnUroYIy49ZXEzU` | "Tuesday, June 9" |
| Session Time Pretty | `fldEJ24bOeibUd3Mn` | "9:00 AM ET" |
| First Name (from Client) | `fldILNCXJFwTmuJjZ` | lookup |
| Phone (from Client) | `fldOOpywFzikb3qmq` | lookup (10-digit; prefix `+1` for Twilio) |
| Client | `fldYUcVGJIyOA64CZ` | link → Clients |
| Invoices | `fldBJaNg8Yp4GfQbF` | link → Invoices |

### Clients — `tblv8GHs4Ui6MivvJ`
First Name `fldfDAKjntoogVqfV` · Phone `fldAmKpo0NhU6MXxY` · Email `fldNwChPv09T8Ln79` (plus full intake fields: employer, industry, issue type, situation, legal categories, etc.).

### Invoices — `tblDsLqu5xQTXJnDf`
Invoice Number `fldbhgfIaEE1jPwrP` · Client `fldwwI5yYPpRePJCp` · Session `fldTQbQFOHDSXbzAB` · Amount `fld7zJWGd68pYOZSF` · Status `fldCtwEix0czYxvBx` (Draft/Pending/Sent/Paid) · Invoice Date `fld5iZIvMM505ulyz` · **Due Date `fldF0su5R9sKOmawO`** (now set by INV-0) · Square Invoice ID `fldm827e6WFfmGC31` · Package Type `fldTakl3KFTLY8OCN`.

### Package Codes — `tblljv2xBOHUgV6S9`
Code `fldeUcZZnU6PwgBG9` · Client `fldHeLOO2vHAWsIqU` (link) · Package Type `fldO8hH4nwzs0SjcK` · Sessions Purchased `fld3zSvuIuVmWKzsp` · Issued `fld1MFtLXPHiDtyzL` · Expires `fldfvTRwRC5RuyZog` · plus `Sessions` (redeemed links) and `Notes`.

---

## 6. Zapier — every Zap and its current state

| Zap | ID | State | What it does |
|---|---|---|---|
| WorkDecoded Intake → Airtable CRM | `360012684` (v13) | **LIVE** | Booking form → Client + Session records + branded client email + consultant email. (Calendar step was removed — now on Accept.) |
| **SS-1v2: Accepted → Calendar + SMS** | `366933187` (v2) | **LIVE** | On Accept: Google Calendar event + Meet, saves Meet Link, sends SS-1 SMS. **Filter: `Status = Accepted` AND `Meet Link does not exist`** (dedup guard added 2026-06-08). |
| **INV-0: Accepted → Create Invoice** | `367782983` (v2) | **LIVE** | On Accept + `Session Price > 0` + no existing invoice → create Invoices row. **Now sets `Due Date = Session Date`** (added 2026-06-08). |
| **INV-1: Invoice Request → Square** | `367637945` (v2) | **LIVE** | Pending invoice → Square: find/create customer, create invoice, **publish** (emails it), write Square ID back. **Publish step now sends `Content-Type: application/json`** (fixed 2026-06-08). |
| INV-2: Invoice Paid → Package Code | `367640419` | **LIVE** | Paid invoice → issues a Package Code. ⚠️ **Has bugs — see §11.** |
| **SS-2: 24-Hour Reminder SMS** | `367789675` | **LIVE** | On Accept (+ Meet Link exists), Delay Until `Reminder 24h Time`, send SS-2 SMS. Built + published 2026-06-08. |
| **SS-3: 1-Hour Reminder SMS** | `367805536` | **LIVE** | Same, Delay Until `Reminder 1h Time`, SS-3 SMS **with the Meet link**. Built + published 2026-06-08. |
| Post-Session → Consultant Feedback | `363446853` + `361193654` | **LIVE** | Feedback request after the session. Confirmed working — leave alone. |

**OFF / not in use:**
- Old reminder skeletons (replaced today, safe to delete): SS-2 `366924136`, SS-3 `366926614`.
- Package SMS skeletons (not built — confirm packages are actually being sold first): PKG-1 `366927461`, PKG-2 `366927973`, PKG-3 `366928327`.

---

## 7. SMS copy (source of truth: `scripts/setup-twilio-sms.js`)

Merge fields from Airtable: name = `First Name (from Client)`, time = `Session Time Pretty`, date = `Session Date Pretty`, Meet link = `Meet Link`. Every message ends "Reply STOP to opt out." (A2P compliance).

```
SS-1 (Accept, live):
Work Decoded: Hi {First Name}! Your session is confirmed for {Date} at {Time}. We're ready for you — see you then! Reply STOP to opt out.

SS-2 (24h):
Work Decoded: Hi {First Name}! Your session is tomorrow at {Time}. Your consultant is prepared and ready for you. See you then! Reply STOP to opt out.

SS-3 (1h, carries Meet link):
Work Decoded: Hi {First Name}! Your session starts in 1 hour at {Time}. Join via Google Meet: {Meet Link} You've got this. Reply STOP to opt out.

PKG-1/2/3: see scripts/AUTOMATION-AND-TEMPLATES.md §3 (not yet live).
```

---

## 8. Pricing & invoice logic

| Tier | Price | Invoice |
|---|---|---|
| Discovery | $0 | Manual, **after** the call (custom Square invoice) |
| Standard | $100 | Auto on Accept |
| Premier | $125 | Auto on Accept |
| Crisis | $175 | Auto on Accept |
| Package-code session | $0 (pre-paid) | No invoice |

Rule (INV-0): on Accept, create an invoice only when `Session Price > 0`. INV-1 then publishes it in Square with **Payment due date = the session date** (set via the Invoice's Due Date, populated by INV-0).

---

## 9. Operating procedures (day-to-day)

**Accept a booking →** In Airtable Sessions, set the session's `Status` = `Accepted`. Within ~5 min you should see: SS-1 confirmation text, a Google Calendar event + Meet on `hello@workdecodedhq.com`, and (for paid tiers) a Square invoice emailed to the client. SS-2/SS-3 reminders are scheduled automatically.

**Send a Discovery (post-call) invoice →** Discovery is $0 and isn't auto-invoiced. After the call, create a Pending Invoices row with the custom amount (and a Due Date) → INV-1 sends it via Square.

**Verify a send →** Zapier → Zap History, filter by the Zap. SMS delivery also shows in the Twilio Console. Calendar events appear on `hello@workdecodedhq.com`.

**⚠️ The "new field" gotcha (important):** a newly added Airtable field won't appear inside a Zap until you **re-sample the trigger** — open the trigger step → Test → "Find new records" → pick a record where that field is populated → Continue. This bites every time you add a field that a downstream step needs.

**Other Zapier gotchas:** paste ISO-8601 with a trailing `Z` into Delay/date fields (the formula fields already output that). To clear a mapped token: click into the field, Cmd+A, Backspace. Twilio `To` = `+1` + 10 digits.

---

## 10. Safe-change workflow (so you never break live bookings)

1. Work on a **branch**, never directly on `main`. Push it → Netlify builds a **deploy preview** (production untouched).
2. Test on the preview URL: submit throwaway bookings, walk the date picker.
3. Make changes **additive and backwards-compatible** first; remove the old path only after the new one is proven in production.
4. Merge to `main` only after the preview checks out. Netlify has instant rollback if needed.
5. For Zaps: edit creates a draft; **Publish** turns it live. Test steps that don't send (filters, delays) freely; **never** click "Test step" on a Twilio/Square step unless you intend a real send.

---

## 11. Known issues, risks & tech debt

**Automation**
- **🔴 INV-2 is still misfiring (re-confirmed 2026-06-10).** Beyond the original bug (code derived from the Square invoice ID tail, wrong format, `Sessions Purchased` left blank), it is now confirmed to issue package codes for **non-package invoices too**: on 2026-06-09 it created `WD-VV7UEIKP` (client 53) and `WD-OXQWEIKP` (client 54) for **Single Session** paid invoices, which should never get a code at all. **Recommended: turn INV-2 OFF in Zapier until it's rebuilt** (add a filter `Package Type contains "pack"`, generate a real random `WD-XXXX-XXXX`, set `Sessions Purchased`, and add a dedup guard). The two bad codes above + `WD-DEMO-TEST` should be deleted at handoff.
- **Session Type option sprawl (verified 2026-06-10)** — the Sessions `Session Type` single-select has **10 options**: lowercase from the current form (`standard`, `premier`, `crisis`, `discovery`) plus legacy (`Standard`, `Premier`, `Premiere` ← misspelling, `Crisis`, `Initial Consultation`, `Follow-Up`). The price formula handles both cases today but it's fragile; consolidate to one canonical set.
- **Reminder dedup** is guarded by `Meet Link exists` but the underlying "New or Updated Record" trigger can still re-fire on edits; a `Reminder Sent` checkbox would be more robust if reminders ever multiply.

**Website / security** (documented in `AUDIT-2026-06-08.md`; status updated 2026-06-10)
- ✅ **Fixed 2026-06-10 (merged to `main`):** intake now proxied server-side via `/api/book` (C1, partially — see below); per-IP rate limiting on all public routes (H2); DST offset bug in `/api/availability` (M1); URL-shortener destination host allowlist (H3).
- **Record-ID-as-auth** on `/api/session`, `/api/intake`, `/api/feedback` still exposes client PII to anyone with a record ID (rate limiting now slows enumeration, but the fix is signed/expiring tokens) — **top remaining security item (H1)**.
- **Bot defense** — `/api/book` validates and rate-limits but has no CAPTCHA; add Turnstile/hCaptcha if junk bookings appear.
- `validate-code` formula "escaping" is ineffective; the input allowlist is the real defense (don't loosen it). It also still returns more metadata than needed (M4).

**Ownership risk (relevant to "airtight transfer")**
- Zapier is on **Michelle's personal account**; Airtable is connected via **Jose's personal account**; Calendar lives on `hello@`. None are owned by a neutral business entity. A truly airtight transfer means re-creating/re-authing these connections under business-owned accounts (see §12).

---

## 12. Transfer checklist (to hand this off cleanly)

1. **Zapier:** move the Zaps to a business-owned Zapier account (Zapier "Transfer Zaps", or recreate). Re-auth the Airtable, Twilio, Square, Google connections under business credentials. Confirm each Zap is ON afterward.
2. **Airtable:** add the business account as base owner; re-point the Zapier Airtable connection to it; rotate the `AIRTABLE_PAT` and update it in Netlify.
3. **Google:** confirm the service account key and `hello@` calendar access carry over; rotate `GOOGLE_SERVICE_ACCOUNT_JSON` if needed.
4. **Twilio / Square:** confirm business ownership and that A2P registration + the invoice templates remain valid.
5. **GitHub / Netlify:** transfer repo ownership; confirm Netlify build hooks + all env vars (`AIRTABLE_PAT`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_CALENDAR_ID`, `SHORTENER_API_KEY`).
6. **Secrets:** rotate every key after the people-change.
7. Re-run a full **test booking** end-to-end after the transfer and confirm SMS + calendar + invoice all fire.

---

## 13a. Changelog — work done 2026-06-10 (pre-handoff solidification)

- **Verified live state** against this runbook: Airtable base schema + data, Netlify env vars + deploys, git branches, and the production form.
- **Merged `security/rate-limiting` + `security/intake-proxy` to `main`** (deployed): the form now posts to `/api/book`; the Zapier hook URL moved to the `ZAPIER_INTAKE_WEBHOOK` env var (already set in Netlify 2026-06-09); per-IP rate limiting live on all public API routes.
- **Fixed the `/api/availability` DST bug (M1):** ET offset now derived per-date via `Intl` instead of hardcoded `-04:00`.
- **Added URL-shortener destination allowlist (H3):** only `meet.google.com` and `*.workdecodedhq.com`.
- **Found new INV-2 damage:** two malformed codes (`WD-VV7UEIKP`, `WD-OXQWEIKP`) issued 2026-06-09 for *Single Session* invoices — see §11; INV-2 should be turned OFF until rebuilt.
- **Wrote `SOP.md` + `TRAINING.md`** for Nick (operator + maintainer handoff).
- Committed this runbook + the audit to the repo (they were previously untracked).

**Still pending (manual, needs Zapier/Calendar/Square login):** turn OFF + rebuild INV-2; delete bad package codes `WD-VV7UEIKP` / `WD-OXQWEIKP` / `WD-DEMO-TEST`; delete 5 duplicate Jun 9 calendar events; delete old skeleton Zaps `366924136` / `366926614`; void the test $125 Square invoice; consolidate Session Type options; run one end-to-end test booking through the new `/api/book` path.

---

## 13. Changelog — work done 2026-06-08

- **SS-1v2 dedup guard** added (`Meet Link does not exist`) — stopped a runaway loop that had created 6 duplicate calendar events / texts for a test booking.
- **INV-0** now sets invoice `Due Date = Session Date`.
- **INV-1** publish step fixed (`Content-Type: application/json`) — invoices now actually send; the test invoice was delivered.
- **SS-2 + SS-3** reminder Zaps built, dedup-guarded, and published ON.
- **Airtable cleanup:** 2 malformed package codes + 4 orphan Session rows deleted.
- **Rate limiting** implemented on all public API routes (branch `security/rate-limiting`, not yet merged — see `SHIP-rate-limiting.md`).

**Still pending (manual):** delete 5 duplicate Jun 9 calendar events; delete old skeleton Zaps `366924136` / `366926614`; void the test $125 Square invoice; check Twilio for duplicate test texts; fix INV-2 before launching packages.

---

## 14. Emergency / rollback

- **A Zap is misbehaving:** turn it OFF (toggle in Zapier) — that stops it immediately without deleting anything. Check Zap History for the error.
- **A bad website deploy:** Netlify → Deploys → instant rollback to the previous build.
- **Runaway duplicates (texts/events/invoices):** turn off the offending Zap first, then clean up the duplicates by hand (calendar events are manual; Airtable rows via the UI). The most likely culprit is a trigger re-firing on record edits — re-check the dedup filter.
