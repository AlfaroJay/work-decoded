# Work Decoded — Standard Operating Procedures

**For:** Nick (operator + maintainer) · **Current as of 2026-06-10**
**Companions:** `TRAINING.md` (your onboarding plan), `TRANSFER-RUNBOOK.md` (full system reference — IDs, schema, every Zap), `scripts/AUTOMATION-AND-TEMPLATES.md` (all message copy).

This document is the *how-to*. When you need the *why* or an ID, go to the runbook.

---

## Part 1 — Daily operations

### 1.1 The one thing that drives everything

A booking arrives from the website and lands in Airtable as a **Session with `Status = Pending`**. Nothing happens until a human sets that Session's **`Status` → `Accepted`**. That single change fires, automatically, within ~5 minutes:

1. SS-1 confirmation SMS to the client
2. Google Calendar event + Google Meet link on `hello@workdecodedhq.com`
3. A Square invoice emailed to the client (paid tiers only)
4. Scheduled 24-hour and 1-hour reminder texts

Treat "Accepted" like a send button. Don't flip it casually, and **never flip it back to Pending and then to Accepted again** unless you've confirmed the Meet Link field is already populated (that's the dedup guard — see §3.2).

### 1.2 Accept a booking

1. Open Airtable base **"Work Decoded - Client Records"** → **Sessions** table.
2. Find the new Pending session. Review the linked Client record (intake details) and check the calendar for conflicts.
3. Set `Status` = `Accepted`.
4. **Verify within ~10 minutes** (this is part of the procedure, not optional):
   - Calendar event with Meet link exists on `hello@workdecodedhq.com` — exactly **one**.
   - The session's `Meet Link` and `Google Calendar Event ID` fields are filled.
   - Paid tier? An Invoices row appeared with `Status = Pending`, then `Sent` + a Square Invoice ID once INV-1 runs.
   - Zapier → Zap History shows successful runs for SS-1v2 (and INV-0/INV-1 for paid tiers).

### 1.3 Discovery calls ($0)

Discovery sessions are free and are **not** auto-invoiced. If a paid follow-up is agreed on the call, create the invoice manually **after** the call: add an **Invoices** row with the amount, the linked Client and Session, `Status = Pending`, and a **Due Date** → INV-1 picks it up and sends it via Square. (A missing Due Date is the classic reason an invoice silently fails to send.)

### 1.4 Verify a send / find out what happened

- **Zapier → Zap History** — filter by Zap name. Every automation run, success or error, is here.
- **Twilio Console** — actual SMS delivery status (Zapier only shows that it asked Twilio to send).
- **Square Dashboard** — invoice status (sent / viewed / paid).
- **Google Calendar** (`hello@workdecodedhq.com`) — events and Meet links.

### 1.5 Reschedule or cancel

There is no automation for this today — it's manual:

1. Update `Session Date` in Airtable (or set `Status = Cancelled`).
2. Move or delete the calendar event **by hand** in Google Calendar (the site's service account is read-only there).
3. Tell the client — no automatic SMS goes out for changes.
4. If an invoice was already sent and the session is cancelled, void it in Square and update the Invoices row.

⚠️ Editing an Accepted session re-fires the "New or Updated Record" triggers. The dedup guards (`Meet Link exists` / `does not exist`) protect against duplicate calendar events and confirmations, but stay alert after edits — check Zap History if anything looks doubled.

### 1.6 Feedback

After the calendar event ends, the Post-Session Zap emails the consultant a feedback request linking to `/feedback`. This one works; leave it alone.

---

## Part 2 — Weekly checks (15 minutes)

1. **Zap History** — scan for errored runs across all Zaps. Errors don't announce themselves.
2. **Sessions table** — any Pending sessions older than a business day? Accept or decline them.
3. **Invoices table** — any rows stuck in `Pending` (no Square ID)? Usually a missing Due Date; fix and INV-1 retries on its next poll.
4. **Package Codes table** — should be empty of new rows until packages launch. If new codes appeared, INV-2 is misfiring again (see §3.4) — turn it off.
5. **Netlify** — confirm the last production deploy is green.

---

## Part 3 — Maintainer procedures

### 3.1 Website changes (Next.js on Netlify)

Repo: `AlfaroJay/work-decoded`. Production deploys automatically from `main`. **The safe-change workflow is mandatory:**

1. Branch off `main`. Never commit to `main` directly.
2. Push the branch → Netlify builds a **deploy preview** (production untouched).
3. Test on the preview URL. For form changes, submit a throwaway booking and walk the date picker.
4. Keep changes additive/backwards-compatible; remove old paths only after the new one is proven.
5. Merge to `main` only after the preview checks out. If production breaks: **Netlify → Deploys → instant rollback**.

Things that will bite you:

- **`/api/book` is a pass-through.** The intake Zap's trigger mapping depends on the exact JSON field names the form sends. Never rename payload keys in the form or in `/api/book` without re-mapping the Zap.
- Env vars live in Netlify site settings: `AIRTABLE_PAT`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_CALENDAR_ID`, `SHORTENER_API_KEY`, `ZAPIER_INTAKE_WEBHOOK`. Rotating any of these requires a redeploy to take effect.
- Everything client-facing is **Eastern Time**, formatted by Airtable formula fields (`Session Date Pretty` / `Session Time Pretty`). Don't reformat dates in code.

### 3.2 Editing Zaps safely

1. Editing a Zap creates a **draft**; nothing changes until you click **Publish**.
2. **Never click "Test step" on a Twilio or Square step** unless you intend a real send/invoice. Filters and delays are safe to test.
3. **The "new field" gotcha:** a newly added Airtable field won't appear in a Zap's field picker until you re-sample the trigger — trigger step → Test → "Find new records" → pick a record where the field is populated → Continue.
4. **Respect the dedup guards.** SS-1v2 fires only when `Status = Accepted` AND `Meet Link does not exist`. SS-2/SS-3 require `Meet Link exists`. Removing these guards re-creates the June 2026 runaway loop (6 duplicate calendar events + texts from one booking).
5. Dates pasted into Delay Until fields must be ISO-8601 with a trailing `Z` (the Airtable formula fields already output this). Twilio `To` = `+1` + 10-digit phone.

### 3.3 Airtable changes

- Adding fields is safe; renaming or retyping fields used by Zaps will silently break mappings — check the runbook §5/§6 for which fields each Zap uses, and re-sample triggers after adding fields.
- `Session Price` is a formula keyed to `Session Type` option names. If you touch Session Type options, verify pricing on a test record immediately.
- Known debt: Session Type has 10 sprawling options (lowercase + legacy capitalized + a "Premiere" misspelling). If you consolidate, update the price formula in the same sitting.

### 3.4 Emergency playbook

| Symptom | Action |
|---|---|
| Duplicate texts / events / invoices | **Turn the offending Zap OFF first** (toggle in Zapier — instant, deletes nothing). Then clean up duplicates by hand. Re-check the dedup filter before turning back on. |
| Bad website deploy | Netlify → Deploys → rollback to previous build. |
| Bookings failing on the site | Check Netlify function logs for `/api/book`; check that `ZAPIER_INTAKE_WEBHOOK` env var exists. The form shows clients a fallback message with `support@workdecodedhq.com`. |
| Invoice never reached the client | Zap History → INV-1 → read the error. Usually missing Due Date (fix the row) or a Square auth lapse. Use **"Replay errored steps"**, not full replay (full replay can create a duplicate invoice). |
| Unexpected Package Codes rows | INV-2 misfired (known bug). Turn INV-2 OFF, delete the bad rows. |
| SMS not arriving | Twilio Console → Monitor → check delivery + any A2P compliance flags. Confirm the client checked the SMS consent box (Phone may be blank otherwise). |

### 3.5 Known issues you inherit (priority order)

1. **INV-2 (paid invoice → package code) is broken** — wrong code format, blank session counts, and it fires for non-package invoices. Keep it OFF until rebuilt. Packages cannot launch until this is fixed.
2. **Record-ID-as-auth** on `/api/session`, `/api/intake`, `/api/feedback` — anyone with an Airtable record ID can read client intake PII. Planned fix: signed expiring tokens.
3. **No CAPTCHA on `/api/book`** — validation + rate limiting only. Add Turnstile/hCaptcha if junk bookings appear.
4. **Session Type option sprawl** (see §3.3).
5. **Reminder dedup** relies on `Meet Link exists`; a `Reminder Sent` checkbox would be sturdier if reminders ever duplicate.

Full detail: runbook §11–12, `AUDIT-2026-06-08.md`.
