# Work Decoded — Training & Onboarding Guide

**For:** Nick · **Goal:** independently operate and maintain the booking system within two weeks.
**Read in this order:** this doc → `SOP.md` (procedures) → `TRANSFER-RUNBOOK.md` (deep reference).

---

## 1. The system in one paragraph

Work Decoded sells short workplace-advisory sessions. A client fills the intake form at **book.workdecodedhq.com/book** → the submission flows through a server proxy into **Zapier**, which writes a Client + Session record into **Airtable** → a human reviews and sets the Session's `Status` to **Accepted** → that one change triggers the confirmation text (**Twilio**), the **Google Calendar** event with Meet link, and the **Square** invoice → reminder texts go out 24 hours and 1 hour before → after the session, the consultant gets a feedback request. Airtable is the brain, Zapier is the nervous system, and "Accepted" is the trigger finger.

```
Form (Netlify site) → /api/book → Zapier → Airtable (Pending)
→ human sets Accepted → SMS + Calendar/Meet + Square invoice
→ reminders → session → feedback request
```

## 2. Accounts you need before day one

| System | What you need | Used for |
|---|---|---|
| Airtable | Collaborator on base "Work Decoded - Client Records" | Daily: accepting bookings, all client data |
| Zapier | Login (currently Michelle's account, `support@workdecodedhq.com`) | Zap History, editing automations |
| Twilio | Console access | SMS delivery checks |
| Square | Dashboard access | Invoices |
| Google | Access to `hello@workdecodedhq.com` calendar | Session events, manual calendar fixes |
| Netlify | Team member on site `workdecodedhq` | Deploys, env vars, rollbacks |
| GitHub | Collaborator on `AlfaroJay/work-decoded` | Website code |

⚠️ Several of these are still on personal accounts (runbook §3 + §12). Part of the handoff is moving them to business-owned accounts — flag any you receive as a personal credential.

## 3. Week 1 — operate (shadow, then drive)

**Day 1–2 — read and watch.** Read `SOP.md` Part 1. In Airtable, open the Sessions, Clients, Invoices, and Package Codes tables and click through one completed session end-to-end: its client, invoice, Meet link, booking code. In Zapier, open Zap History and match runs to that same session. You should be able to narrate: "this record caused this Zap run which sent this text."

**Day 3 — guided live accept.** With Jose/Michelle present, accept a real (or test) booking per SOP §1.2 and run the full verification checklist. Note how long each automation takes to fire (~2–5 min polling).

**Day 4 — break-glass drills.** Practice, without executing: where the OFF toggle is on each Zap; where Netlify rollback lives; how to read an errored Zap run; where Twilio shows a failed SMS. Walk SOP §3.4 line by line and locate every screen it mentions.

**Day 5 — solo with checkpoint.** Run the weekly check (SOP Part 2) yourself and write down anything that looks off. Review findings together.

**Exercise (safe, do once):** submit a test booking on the live form with your own phone/email, accept it, verify all four effects fire exactly once, then clean up: cancel the session, delete the calendar event by hand, void the Square invoice if one was created.

## 4. Week 2 — maintain

**Zapier literacy.** Open each LIVE Zap (runbook §6 lists all eight with IDs) in the editor *without publishing anything*. For each, identify: trigger, filter (find the dedup guard), and action steps. Read SOP §3.2 before touching anything.

**Codebase tour.** Clone the repo. Key map:

- `public/intake-form.html` — the live booking form (everything: UI, validation, tier logic)
- `src/app/api/book/route.ts` — the proxy the form posts to (do not rename payload keys)
- `src/app/api/availability/route.ts` — Google Calendar free/busy for the date picker
- `src/app/api/shorten/route.ts` + `src/app/r/[slug]/route.ts` — branded URL shortener (l.workdecodedhq.com)
- `src/lib/rateLimit.ts` — per-IP rate limiting used by every public route
- `public/feedback-form.html` + `/api/feedback` — consultant feedback
- `next.config.js` — rewrites (`/book`, `/feedback`)

**Exercise:** make a trivial copy change on a branch, push it, find the Netlify deploy preview, verify it, and delete the branch without merging. That's the whole safe-change loop with zero risk.

**Exercise:** in Airtable, on a *test* record, change `Session Type` and watch `Session Price` recompute. Now read the price formula and the option-sprawl warning (SOP §3.3) — you'll understand why that formula is fragile.

## 5. Things that will bite you (memorize these five)

1. **"Accepted" is a send button.** Verify after every accept. One status change = SMS + calendar + invoice.
2. **Never "Test step" on Twilio/Square steps in Zapier.** It really sends.
3. **New Airtable fields are invisible to Zaps** until you re-sample the trigger.
4. **Payload field names are a contract** between the form, `/api/book`, and the intake Zap. Rename nothing.
5. **When automations misbehave, turn the Zap OFF first**, investigate second.

## 6. Glossary

- **Catch-hook** — Zapier's incoming webhook URL that receives the form payload (now hidden behind `/api/book`).
- **Dedup guard** — a Zap filter (e.g. `Meet Link does not exist`) that stops a Zap re-firing when a record is edited.
- **SS-1/2/3** — confirmation / 24-hour / 1-hour SMS Zaps. **INV-0/1/2** — invoice creation / Square send / package-code Zaps. **PKG-1/2/3** — unbuilt package SMS Zaps.
- **Booking code** — `WD-XXXX-XXXX`, the client-facing reference generated at booking.
- **Package code** — prepaid multi-session code (feature not yet launched; INV-2 is broken — see SOP §3.5).
- **Deploy preview** — Netlify build of a non-main branch at a temporary URL; production is only ever `main`.
- **A2P 10DLC** — US carrier registration that lets the Twilio toll-free number send business SMS; why every text ends "Reply STOP to opt out."

## 7. Who to call

- **Jose** (`jose@thealphacreative.com`) — built the site, automations, and this handoff; escalation for anything technical.
- **Michelle** — business owner; decision-maker on accepting bookings, pricing, refunds, packages.
- **support@workdecodedhq.com** — the client-facing inbox; clients are told to use it for rescheduling.
