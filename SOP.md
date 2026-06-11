# Work Decoded — Standard Operating Procedures

**For:** Nick (operator + maintainer) · **Current as of 2026-06-10**
**Companions:** `NAMING.md` (canonical names — read before creating anything), `TRAINING.md` (your onboarding plan), `TRANSFER-RUNBOOK.md` (full system reference — IDs, schema, every Zap), `scripts/AUTOMATION-AND-TEMPLATES.md` (all message copy).

This document is the *how-to*. When you need the *why* or an ID, go to the runbook.

---

## Part 1 — Daily operations

### 1.1 The one thing that drives everything

A booking arrives from the website and lands in Airtable as a **Session with `Status = Pending`**. Nothing happens until a human sets that Session's **`Status` → `Accepted`**. That single change fires, automatically, within ~5 minutes:

1. SS-1 confirmation SMS to the client (if they opted in)
2. Google Calendar event + Google Meet link on `hello@workdecodedhq.com`
3. A Square invoice emailed to the client (paid tiers only)
4. Scheduled 24-hour and 1-hour reminder texts — each can fire only once per session, enforced by the `Reminder … Scheduled` checkboxes

Treat "Accepted" like a send button. Don't flip it casually.

### 1.2 Accept a booking

1. Open Airtable base **"Work Decoded - Client Records"** → **Sessions** table.
2. Find the new `Pending` session. Review the linked Client record (intake details) and check the calendar for conflicts.
3. Set `Status` = `Accepted`.
4. **Verify within ~10 minutes** (part of the procedure, not optional):
   - Calendar event with Meet link exists on `hello@workdecodedhq.com` — exactly **one**.
   - The session's `Meet Link` and `Google Calendar Event ID` fields are filled.
   - Paid tier? An Invoices row appeared with `Status = Pending`, then `Sent` + a Square Invoice ID once INV-1 runs.
   - Zapier → Zap History shows successful runs for SS-1v2 (and INV-0/INV-1 for paid tiers).

Note: if the session is **less than 24 hours away**, the "24-hour" reminder text arrives immediately after acceptance — that's expected (its send time is already past).

### 1.3 Discovery calls ($0)

Discovery sessions are free and are **not** auto-invoiced. If a paid follow-up is agreed on the call, invoice it **after** the call: add an **Invoices** row with the amount, the linked Client and Session, `Status = Pending`, and a **Due Date** → INV-1 picks it up and sends it via Square. (A missing Due Date is the classic reason an invoice silently fails to send.)

### 1.4 Packages

Pre-paid packages are sold via Square invoices whose `Package Type` contains "pack" (e.g. `Standard 3-pack`). When the client **pays**, INV-2 automatically issues a `PKG-XXXX-XXXX` code, emails it to the client, marks the invoice (`Package Code Issued`), and logs the event. One code per invoice, guaranteed by the checkbox guard.

Clients redeem codes at booking; the session prices at $0 and links to the code. Code history lives in the **Code Activity Log** table.

### 1.5 Verify a send / find out what happened

- **Zapier → Zap History** — filter by Zap name. Every automation run, success or error, is here.
- **Twilio Console** — actual SMS delivery status (Zapier only shows that it asked Twilio to send).
- **Square Dashboard** — invoice status (sent / viewed / paid).
- **Google Calendar** (`hello@workdecodedhq.com`) — events and Meet links.

### 1.6 Reschedule or cancel

There is no automation for this today — it's manual:

1. Update `Session Date` in Airtable (or set `Status = Cancelled`).
2. Move or delete the calendar event **by hand** in Google Calendar (the site's service account is read-only there).
3. Tell the client — no automatic SMS goes out for changes.
4. If rescheduling and you want fresh reminder texts at the new time, **untick** the session's `Reminder 24h Scheduled` / `Reminder 1h Scheduled` checkboxes — each tick-removal re-arms that reminder exactly once.
5. If an invoice was already sent and the session is cancelled, void it in Square and update the Invoices row.

Editing an Accepted session is safe: all three SMS Zaps carry dedup guards (the Meet-Link filter for SS-1v2, the checkboxes for SS-2/SS-3), so edits won't duplicate sends.

### 1.7 Feedback

After the calendar event ends, the Post-Session Zap emails the consultant a feedback request with a **signed link** to `/feedback`. Links expire after 60 days; if a consultant reports an "invalid or expired link," send them a fresh one (runbook §8).

---

## Part 2 — Weekly checks (15 minutes)

1. **Zap History** — scan for errored runs across all Zaps. Errors don't announce themselves.
2. **Sessions table** — any `Pending` sessions older than a business day? Accept or decline them.
3. **Invoices table** — any rows stuck in `Pending` (no Square ID)? Usually a missing Due Date; fix the row and INV-1 retries on its next poll.
4. **Package Codes table** — every row should trace to a paid pack invoice (check `Package Code Issued` on the invoice) or a deliberate manual issue.
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
- `/api/book` also runs the bot screen (honeypot + render-time trap) and normalizes the tier to Title Case — keep both if you touch it.
- Env vars live in Netlify site settings: `AIRTABLE_PAT`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_CALENDAR_ID`, `SHORTENER_API_KEY`, `ZAPIER_INTAKE_WEBHOOK`, `LINK_SIGNING_SECRET`. Changing any of them requires a redeploy to take effect.
- Everything client-facing is **Eastern Time**, formatted by Airtable formula fields (`Session Date Pretty` / `Session Time Pretty`). Don't reformat dates in code or Zaps.

### 3.2 The marketing site (Squarespace)

`www.workdecodedhq.com` is a separate Squarespace site. Three non-obvious things:

- The **header nav and the `/book` → `book.workdecodedhq.com` redirect live in Code Injection** (Settings → Advanced → Code Injection). Don't remove the redirect; it's how all marketing-site CTAs reach the real booking form. (It also runs inside the Squarespace page editor — to edit the `/book` page itself, temporarily disable the redirect line, edit, then restore it.)
- The **footer is a global code block** (edit any page → footer section → double-click the CODE block). Footer links live there.
- The old **Acuity scheduler (`workdecodedhq.as.me`) is still live**. Acuity bookings import to Airtable via their own Zap but get **no** SMS/calendar/invoice automations. If a session "didn't get its texts," check whether it came from Acuity.

### 3.3 Editing Zaps safely

1. Editing a Zap creates a **draft**; nothing changes until you click **Publish**.
2. **Never click "Test step" on a Twilio or Square step** unless you intend a real send/invoice. Filters, delays, code steps, and Airtable lookups are safe to test. Airtable *create/update* test steps write real rows — clean up after.
3. **The "new field" gotcha:** a newly added Airtable field won't appear in a Zap's field picker until you re-sample the trigger — and unchecked checkboxes are invisible to sampling (populate the field on a record first).
4. **Respect the dedup guards.** SS-1v2 fires only while `Meet Link does not exist`. SS-2/SS-3 require their `Reminder … Scheduled` checkbox to be unchecked, and each Zap checks its own box *before* its delay step. INV-2 requires `Package Code Issued` to be unchecked and sets it when a code is issued. Removing any of these guards will cause duplicate sends — they are the reason edits to live records are safe.
5. The intake and post-session Zaps each contain a **Code step** that mints signed consultant links. The secret inside must match Netlify's `LINK_SIGNING_SECRET` (rotation procedure: runbook §8).
6. Dates pasted into Delay Until fields must be ISO-8601 with a trailing `Z` (the formula fields already output this). Twilio `To` = `+1` + 10-digit phone.

### 3.4 Airtable changes

- Adding fields is safe; renaming or retyping fields used by Zaps will silently break mappings — check the runbook §5/§6 for which fields each Zap uses, and re-sample triggers after adding fields.
- `Session Price` is a formula keyed to `Session Type` option names; the canonical set is exactly `Standard` / `Premier` / `Crisis` / `Discovery` (NAMING.md). If you add or rename options, update the formula in the same sitting and verify pricing on a test record.
- The `… Scheduled` / `… Issued` checkboxes are **Zap-owned**. Don't tick them manually except to deliberately suppress a send; untick to deliberately re-arm one.

### 3.5 Emergency playbook

| Symptom | Action |
|---|---|
| Duplicate texts / events / invoices | **Turn the offending Zap OFF first** (toggle in Zapier — instant, deletes nothing). Clean up duplicates by hand. Verify the Zap's dedup guard (filter + checkbox) is intact before re-enabling. |
| Bad website deploy | Netlify → Deploys → rollback to previous build. |
| Bookings failing on the site | Netlify function logs for `/api/book`; check `ZAPIER_INTAKE_WEBHOOK` exists. The form shows clients a fallback message with `support@workdecodedhq.com`. |
| Invoice never reached the client | Zap History → INV-1 → read the error. Usually a missing Due Date (fix the row). Use **"Replay errored steps"**, not full replay (full replay can create a duplicate invoice). |
| A paid pack invoice didn't produce a code | Zap History → INV-2. Check the invoice's `Package Type` contains "pack" and `Package Code Issued` is unchecked, then replay errored steps. |
| Unexpected Package Codes rows | Check the linked invoice's `Package Code Issued` and the Code Activity Log to trace the source; turn INV-2 OFF while investigating. |
| SMS not arriving | Twilio Console → Monitor → delivery + A2P compliance flags. Confirm the client's `SMS Consent` is ticked (no consent = no texts, by design). |
| Consultant link "invalid or expired" | Send a fresh signed link (runbook §8). |
| Suspected bot/junk bookings | Check Netlify function logs for "[Book] Honeypot tripped" / "Time-trap tripped". If real junk gets through, the escalation path is a vendor CAPTCHA (runbook §12). |
