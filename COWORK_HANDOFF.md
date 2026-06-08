# Work Decoded — Cowork Handoff

Paste this into a new Cowork session to pick up cleanly.

## Who and what

- **Michelle** owns Work Decoded, a workplace consulting business.
- **Site:** `workdecodedhq.com` on Squarespace (still password-protected, pre-launch).
- **Forms:** intake form (`/book`) and consultant feedback form (`/feedback`) hosted separately on Netlify.
- **Vercel was suspended** — likely Hobby-tier-vs-commercial-use violation. Migrated to Netlify.
- **User:** Jose (jose@thealphacreative.com), AlphaCreative, GitHub `AlfaroJay`.

## Architecture

| Layer | Location | Status |
|---|---|---|
| Source code | GitHub `AlfaroJay/work-decoded`, branch `main` | Live |
| Hosting | Netlify project `workdecodedhq.com` (alias `workdecodedhq.netlify.app`) | Live |
| Marketing site | Squarespace `dahlia-parakeet-jx2b.squarespace.com` → `workdecodedhq.com` | Password gate on |
| Authoritative DNS | Google Cloud DNS (Squarespace's standard) | Apex/www stays on Squarespace |
| Form backend | Zapier webhook → Airtable + Google Calendar | Live |

## Current URLs

- **Intake form:** `https://workdecodedhq.netlify.app/book` (also `/intake-form.html`) — works
- **Feedback form:** `https://workdecodedhq.netlify.app/feedback` (also `/feedback-form.html`) — works
- **Availability API:** `https://workdecodedhq.netlify.app/api/availability` — works
- **Subdomain aliases set up but SSL stuck:** `book.workdecodedhq.com`, `feedback.workdecodedhq.com`

## Form changes already shipped

The intake form (`/public/intake-form.html`) has:

1. Tier selection redesigned as a side-by-side comparison table (desktop) with a stacked card fallback for mobile
2. Brand logo image (`WorkDecodedHQ_logo_white.png`) replacing the styled-text header
3. Privacy Notice + Client Services Agreement link click-tracking — submission blocks until both clicked, green checkmarks on visit
4. Smooth scroll-to-top on the success screen so users see the confirmation
5. Mobile responsive overhaul: 16px input font (kills iOS auto-zoom), stacked submit row, 3-column date grid at ≤600px, 2-column time grid at ≤360px, smaller logo, tighter section padding, extra-small breakpoint at ≤360px

## Squarespace redirect chain (to make `workdecodedhq.com/book` work)

Strategy: redirect to subdomain so URL still feels like Michelle's brand (`book.workdecodedhq.com`).

Set up in three layers:

1. **DNS CNAME** (Squarespace DNS panel): `book` and `feedback` → `workdecodedhq.netlify.app`
2. **URL Mappings** (Squarespace Settings → Developer Tools → URL Mappings):
   ```
   /book -> https://book.workdecodedhq.com 301
   /feedback -> https://feedback.workdecodedhq.com 301
   ```
3. **Header Code Injection** (Settings → Advanced → Code Injection): JavaScript fallback that fires on page load and redirects `/book`/`/feedback` to `book.workdecodedhq.com`/`feedback.workdecodedhq.com`. Belt-and-suspenders in case URL Mappings don't fire on existing pages.

## What's stuck right now (THE current blocker)

`book.workdecodedhq.com` and `feedback.workdecodedhq.com` show `NET::ERR_CERT_COMMON_NAME_INVALID`. Netlify is still serving its wildcard `*.netlify.app` cert because Let's Encrypt provisioning is failing.

**Root cause:** Netlify's domain-management page has these listed:
- `workdecodedhq.netlify.app` (Netlify subdomain)
- `workdecodedhq.com` (Primary domain — "Netlify DNS propagating...")
- `www.workdecodedhq.com` (Redirects to primary — "Netlify DNS propagating...")
- `book.workdecodedhq.com` (Domain alias — Netlify DNS ✓)
- `feedback.workdecodedhq.com` (Domain alias — Netlify DNS ✓)

`workdecodedhq.com` and `www.workdecodedhq.com` should NOT be on Netlify (Michelle keeps Squarespace at apex). Netlify is trying to issue one cert covering all five domains, and Let's Encrypt validation fails for the apex/www (since they point to Squarespace IPs, not Netlify), which blocks the cert from issuing for `book.` and `feedback.` too.

**Locked state:** when you try to remove the apex/www, Netlify shows "We're provisioning a certificate for your site, you cannot change custom domains until that process completes."

**Fix order once Netlify unlocks** (cert request will time out in 15–60 min):
1. Set `book.workdecodedhq.com` as primary domain
2. Remove `workdecodedhq.com` from the project
3. Remove `www.workdecodedhq.com` from the project
4. Wait ~2 min — new cert auto-issues for the three remaining domains
5. Visit `book.workdecodedhq.com` in incognito to verify

Optional: Netlify Support chat can manually unlock the cert state immediately.

## Pending tasks

- [ ] Unlock the Netlify cert state and remove `workdecodedhq.com` + `www.workdecodedhq.com` from the project (above)
- [ ] Add a payment method to Netlify even on the free plan — converts overage from "site goes dark" to "tiny bill," prevents Vercel-style suspension
- [ ] Michelle removes the Squarespace password and publishes the site → full chain `workdecodedhq.com/book` → `book.workdecodedhq.com` → Netlify form goes live

## Key IDs and links

- Netlify project: `workdecodedhq.com` (URL-stable: https://app.netlify.com/projects/workdecodedhq.com)
- Netlify domain management: https://app.netlify.com/projects/workdecodedhq.com/domain-management
- Netlify team: AlphaCreative (`alfarojay`)
- GitHub repo: https://github.com/AlfaroJay/work-decoded
- Squarespace site config: https://dahlia-parakeet-jx2b.squarespace.com/config/
- Squarespace DNS: https://account.squarespace.com/domains/managed/workdecodedhq.com/dns/dns-settings
- Squarespace URL Mappings: https://dahlia-parakeet-jx2b.squarespace.com/config/settings/developer-tools/url-mappings
- Squarespace Code Injection: https://dahlia-parakeet-jx2b.squarespace.com/config/settings/advanced/code-injection
- Zapier intake hook: `https://hooks.zapier.com/hooks/catch/27132993/uj9mk1d/`

## Notes for the next session

- The Squarespace editor and Netlify dashboard are heavily React-based; some interactions don't automate cleanly. Most work happens fastest if Jose drives those UIs and Claude drives GitHub, sandbox shell, and the Squarespace internal APIs (URL Mappings, DNS, Code Injection — those CodeMirror editors can be set programmatically).
- There are TWO intake forms on Netlify: a Next.js React form at `/` (light theme, multi-step) and the dark-themed HTML form at `/book` and `/intake-form.html`. The HTML form is the one Michelle has been iterating on. The React form at `/` is a parallel implementation that may or may not be deprecated — worth asking Michelle.
- The `feedback.workdecodedhq.com` subdomain serves `/feedback-form.html`, the consultant-side post-session form (different from the intake form). Don't confuse them.
- Local repo at `~/projects/work-decoded` may have stale `.git/index.lock` files that the sandbox can't delete due to mount permissions; user clears with `rm -f .git/index.lock` in Terminal.
