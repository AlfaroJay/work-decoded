# Work Decoded — Automation Build Handoff (for Cowork)

> Paste this into a new **Cowork** conversation. Cowork drives the Zapier / Airtable / Square
> web UIs better than Claude Code's browser tooling. Everything below is current as of
> **2026-06-08**. Companion reference (deeper detail, all message copy): `scripts/AUTOMATION-AND-TEMPLATES.md`.

---

## 0. Accounts & tools you'll touch
- **Zapier** — Michelle Williams · Personal account (logged in as `support@workdecodedhq.com`). All Zaps live here.
- **Airtable** — base `appG108B0ALyLJ4A3` "Work Decoded - Client Records".
- **Twilio** — toll-free **+18555500594** (A2P 10DLC verified, delivers). `To` numbers must be `+1` E.164.
- **Square** — sends the actual invoices (INV-1 Zap creates them).
- **Google Calendar** — `hello@workdecodedhq.com` (America/New_York). Calendar API is **read-only** on this account — delete stray test events by hand.
- **Netlify** — site `workdecodedhq` (`8ff8a701-45db-4ad2-ad59-5f8254204eb2`), deploys from GitHub `AlfaroJay/work-decoded` `main`.

---

## 1. What's already LIVE — do NOT rebuild
| Zap | ID | Does |
|---|---|---|
| WorkDecoded Intake → Airtable CRM | `360012684` (v13) | Booking form → Client + Session records + branded client email + consultant email. Calendar step was removed (now happens on Accept). |
| **SS-1v2: Session Accepted → Calendar + SMS** | `366933187` | On `Status=Accepted`: Google Calendar event + Meet, saves Meet Link, sends SS-1 confirmation SMS. End-time bug fixed via `Session End` field. |
| INV-0: Session Accepted → Create Invoice | `367782983` | On Accept + `Session Price>0` + no existing invoice → Pending Invoices row. |
| INV-1: Invoice Request → Square | `367637945` | Pending invoice → Square creates + emails it. |
| INV-2: Invoice Paid → Package Code | `367640419` | Paid invoice → issues a Package Code (for packs). |
| Post-Session → Consultant Feedback | `363446853` + `361193654` | **Confirmed working** by the client. Leave alone. |

**Manual gate:** Michelle sets each session's `Status` → **Accepted**. That one change fires SS-1v2 (text + calendar + Meet) **and** INV-0→INV-1 (the paid-tier invoice).

---

## 2. IMMEDIATE — verify the test booking that was just accepted
Booking **WD-6SZV-XAXH** (record `recragUKFlrLJnjkg`, premier, $125, Tue Jun 9 9:00 AM ET, client Jose / 9173377055) was set to **Accepted** on 2026-06-08. Within ~5 min it should have produced **all** of:
1. SMS to 9173377055 (SS-1v2).
2. Google Calendar event + Meet on hello@workdecodedhq.com for Jun 9 9:00 AM ET.
3. A **$125 Square invoice** to the client's email (INV-0 → INV-1).

**Verify each in Zapier → Zap History.** If any didn't fire, open that Zap's history, read the error, fix. Common cause: trigger hadn't polled yet (wait 2 min), or a filter mismatch.

---

## 3. Airtable field IDs you'll need (Sessions table `tbloaE6gs8pZwx9j8`)
| Field | ID | Notes |
|---|---|---|
| Status | `fldEQ8J8Qj8KZOsNG` | singleSelect; "Accepted" triggers everything; "Cancelled" should suppress reminders |
| Session Date | `fld3phAqfSQxhMpoX` | dateTime (UTC instant) |
| Session Price | `fldXCwW3Q1eSwHycF` | formula; Standard 100 / Premier 125 / Crisis 175 / Discovery 0; 0 if package code |
| Session End | `fldFMj1RNqe5wRzhX` | formula ISO-8601 UTC = start + 15min(Discovery)/30min — calendar End |
| **Reminder 24h Time** | `fldDgK8zzUDoPjgEM` | formula ISO-8601 UTC = Session Date − 24h → SS-2 Delay Until |
| **Reminder 1h Time** | `fldPsOZeOTlVSWQ8L` | formula ISO-8601 UTC = Session Date − 1h → SS-3 Delay Until |
| Meet Link | `fldI53l7edokb9uKE` | url; set by SS-1v2 on Accept → use in SS-3 |
| Session Date Pretty | `fldnUroYIy49ZXEzU` | "Tuesday, June 9" |
| Session Time Pretty | `fldEJ24bOeibUd3Mn` | "9:00 AM ET" |
| First Name (from Client) | `fldILNCXJFwTmuJjZ` | lookup |
| Phone (from Client) | `fldOOpywFzikb3qmq` | lookup (10-digit; prefix `+1` for Twilio) |

---

## 4. TASK 1 — Finish the reminder Zaps (SS-2, SS-3)
**Design = Accept-triggered "Delay Until"** (each accepted session schedules its own exact-time reminder). This is more reliable than the old schedule-polling skeletons — no date-matching, no looping, no timezone lag.

### SS-2 (24-hour reminder) — already 80% built
A duplicate of SS-1v2 was created and partly converted: Zap **`367789675`** (currently named "(Copy) WorkDecoded SS-1v2…", Draft, OFF). Current steps:
1. Airtable **New or Updated Record** (Sessions) — trigger ✓
2. Filter — `Status` exactly matches `Accepted` ✓
3. **Delay Until** — added, but **not yet mapped** ⬅ finish this
4. Twilio **Send SMS** — still has the SS-1 confirmation copy ⬅ change this

**To finish SS-2:**
1. Open step 1 → **Test** tab → **Find new records** → pick the WD-6SZV-XAXH record (so the new `Reminder 24h Time` field becomes available downstream — *new Airtable fields don't appear in a Zap until you re-sample the trigger*).
2. Step 3 Delay Until → **Date/Time Delayed Until** = `{{Reminder 24h Time}}`. Leave "handle past dates" = "Continue if it's up to one day".
3. Step 4 Twilio → **From** `+18555500594`, **To** `+1{{Phone (from Client)}}`, **Message** = SS-2 copy (§6).
4. **Rename** the Zap → `WorkDecoded SS-2: 24-Hour Reminder SMS`. **Publish** (turn ON).

### SS-3 (1-hour reminder)
Duplicate the finished SS-2 (or SS-1v2 again) and change only:
- Delay Until = `{{Reminder 1h Time}}`
- Message = SS-3 copy (§6) — **includes the Meet link** `{{Meet Link}}`
- Rename → `WorkDecoded SS-3: 1-Hour Reminder SMS`, Publish.

### Cleanup
Delete the two old empty skeleton Zaps once SS-2/SS-3 are live: **SS-2 `366924136`** and **SS-3 `366926614`** (they use a Schedule trigger with an unconfigured Find step).

### Dedup note (important)
The Airtable "New or Updated Record" trigger re-fires on **any** edit to an accepted session → could schedule **duplicate** reminders. Harden by either (a) setting the trigger to watch only the `Status` field, or (b) adding a "Reminder Sent" checkbox the Zap sets, plus a filter. **The same applies to live SS-1v2** — consider adding `Meet Link is empty` to its filter so re-edits don't create duplicate calendar events / texts.

---

## 5. TASK 2 — Build the package Zaps (PKG-1/2/3)
**Package Codes** table `tblljv2xBOHUgV6S9`: `Code`, `Client`(link), `Package Type`, `Sessions Purchased`(number), `Sessions`(redeemed links), `Issued`(date), `Expires`(date), `Notes`. Client phone/name come via the `Client` link → Clients table `tblv8GHs4Ui6MivvJ` (`Phone` `fldAmKpo0NhU6MXxY`, `First Name` `fldfDAKjntoogVqfV`, `Email` `fldNwChPv09T8Ln79`).

Existing OFF skeletons: PKG-1 `366927461`, PKG-2 `366927973`, PKG-3 `366928327`.

- **PKG-1 Package Confirmation** — trigger: New Record in Package Codes → (lookup client phone) → Twilio PKG-1 copy. Easiest: add a lookup field on Package Codes for the client's Phone so Twilio can map it directly.
- **PKG-2 Monthly Check-In** — Schedule monthly → find codes with sessions remaining (add a formula `Sessions Remaining = Sessions Purchased − COUNT(Sessions)`; filter > 0) → Twilio PKG-2.
- **PKG-3 Final-Month Reminder** — Schedule daily → codes where `Expires` is ~30 days out AND sessions remaining > 0 → Twilio PKG-3. (Many packages have no expiry — those are simply skipped.)

> ⚠️ Confirm with Michelle whether packages are actually being **sold yet**. If not, build + leave OFF until launch.

---

## 6. Approved SMS copy (source of truth: `scripts/setup-twilio-sms.js`)
Merge fields from Airtable. Date = `Session Date Pretty`, Time = `Session Time Pretty`, name = `First Name (from Client)`.

```
SS-1 (Accept, already live):
Work Decoded: Hi {First Name}! Your session is confirmed for {Date} at {Time}. We're ready for you — see you then! Reply STOP to opt out.

SS-2 (24h):
Work Decoded: Hi {First Name}! Your session is tomorrow at {Time}. Your consultant is prepared and ready for you. See you then! Reply STOP to opt out.

SS-3 (1h, carries Meet link):
Work Decoded: Hi {First Name}! Your session starts in 1 hour at {Time}. Join via Google Meet: {Meet Link} You've got this. Reply STOP to opt out.

PKG-1 (package purchase):
Work Decoded: Hi {First Name}! Your {3/5}-session package is confirmed. Sessions expire {Expiration Date}. Book anytime at WorkDecodedHQ.com. Reply STOP to opt out.

PKG-2 (monthly check-in):
Work Decoded: Hi {First Name}! You have {#} session(s) ready. How are things at work? Book a check-in anytime: {Booking Link} Reply STOP to opt out.

PKG-3 (final month):
Work Decoded: Hi {First Name}! Your {#} session(s) expire in 30 days on {Expiration Date}. Don't let them go! Book now: {Booking Link} Reply STOP to opt out.
```
Every send ends with "Reply STOP to opt out." (A2P compliance). Reminders should skip if the session is Cancelled/Completed or the client opted out.

---

## 7. Pricing / invoice logic
| Tier | Price | Invoice |
|---|---|---|
| Discovery | $0 | Manual, **after** the call (Michelle sends a custom Square invoice via a `Price Override`) |
| Standard | $100 | Auto on Accept |
| Premier | $125 | Auto on Accept |
| Crisis | $175 | Auto on Accept |
| Package-code session | $0 (pre-paid) | No invoice |

Auto-invoice rule (INV-0): on Accept, create invoice only when `Session Price > 0`.

---

## 8. Gotchas (learned the hard way)
- **New Airtable fields won't appear in a Zap** until you re-sample the trigger: step 1 → Test → **Find new records** → pick a record where that field is populated.
- **Delay / date fields**: paste ISO-8601 with a trailing `Z` (the `Session End` / `Reminder *` formula fields already output exactly that).
- **Remove a mapped token** in a Zap field: click into it, `Cmd+A`, `Backspace` twice.
- **Zapier static dropdowns** sometimes reject programmatic clicks → use the field's kebab (⋮) menu → **Custom** → type the value/ID.
- **Two-click delete** on a Zap step: click "Delete", then "Really delete?".
- **Twilio `To`** must be `+1` + the 10-digit phone. `From` = `+18555500594`.
- **Google Calendar** API is read-only on hello@ — delete test events manually in the Calendar UI.

---

## 9. Reference
- `scripts/AUTOMATION-AND-TEMPLATES.md` — full flow diagram + all copy + invoice logic.
- `scripts/setup-twilio-sms.js` — canonical SMS copy.
- Memory note: `~/.claude/projects/-Users-alphacreative-projects-work-decoded/memory/workdecoded_booking_automation.md`.
