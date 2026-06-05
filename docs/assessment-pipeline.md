# Assessment → result link → nurture pipeline (config + run)

How the quiz, hosted result page, and nurture sequence fit together, the env
vars that drive them, how to run Reece's 20-minute test, and the go-live gates.
This is operational config for **this** site — not a plan (the plan lives in the
vault: `.../dan-coach/delivery/dan-website-quiz-nurture-plan-2026-06-05.md`).

## Flow

1. `assessment.html` + `assessment.js` collect answers; scoring + the Authenticity
   Map render live in `assessment-core.js` (shared with the result page).
2. On submit, `netlify/functions/assessment-submit.js`:
   - stores the raw answers to a **Netlify Blob** (`assessment-results`) under a
     short unguessable id, and mints `/r/<id>`;
   - sends **email 1** (A1 or B1 — the branch's day-0 "snapshot" email) right
     away, carrying the `/r/<id>` link (no map rendered in-email);
   - **schedules** the rest of the branch with Resend `scheduled_at`
     (production = real day offsets; TEST_MODE = ~95s spacing);
   - sends an internal lead-notify email.
3. `result.html` (served at `/r/<id>`) fetches the answers via
   `/api/result-data?id=` and recomputes + renders the full map with the same core.

Branching: `result.route` = `diagnostic` (any 2 of 3 high signals) → Branch A
(6 emails / 12 days); else `nurture` → Branch B (7 emails / 21 days). Copy source:
vault `.../dan-resend-nurture-build/dan-nurture-sequence-copy.md` (pending Dan's
voice pass). Email bodies live in `netlify/lib/sequence.js`.

## Environment variables (Netlify → Site settings → Environment)

| Var | Purpose | Default if unset |
|---|---|---|
| `RESEND_API_KEY` | **Required** for any send. Without it, emails are skipped (no error). | — |
| `RESEND_FROM_EMAIL` | From address. Use the verified sending subdomain in prod, e.g. `Daniel Tiwari <daniel@send.danieltiwari.com>`. | `onboarding@resend.dev` |
| `TEST_MODE` | `true` → every recipient becomes `TEST_EMAIL`, both branches drip to that inbox, cadence compresses to `TEST_DRIP_SECONDS`. | off |
| `TEST_EMAIL` | Where the test sends. | `reece.j.rainer@gmail.com` |
| `TEST_DRIP_SECONDS` | Spacing between test emails (13 × 95s ≈ 20 min). | `95` |
| `NOTIFY_TO` | Prod internal lead notification recipient. | `email@danieltiwari.com` |
| `BOOK_URL` | Booking link used in the sequence + result CTA. | Reece's Calendly placeholder |
| `BCC_TO` | Optional prod BCC (e.g. Reece while bedding in). | none |
| `DAN_REPLY_TO_EMAIL` | Reply-to override. | `email@danieltiwari.com` (prod) |
| `BLOBS_SITE_ID` / `BLOBS_TOKEN` | Explicit Netlify Blobs config. **Required for manual `netlify deploy` CLI deploys** (the auto-injected Blobs context only exists on git/Netlify-built deploys). Set to the site id + a Netlify token. Can be removed once the site deploys via git. | auto-config |

> **Current prod state (2026-06-05):** deployed manually via CLI to danieltiwari.com with
> `TEST_MODE=true`, `BLOBS_SITE_ID`, `BLOBS_TOKEN`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`,
> `DAN_NOTIFY_EMAIL` all set. `/v1` `/v2` `/v3` are live (noindexed) for the homepage pick.
> Because this was a manual CLI deploy (not git), the live site is ahead of `main` until the
> branch is merged + a git build runs (at which point `BLOBS_*` can be dropped).

## Reece's 20-minute test

1. Set `TEST_MODE=true`, `RESEND_API_KEY`, and `RESEND_FROM_EMAIL` (verified domain
   preferred so the test also validates deliverability).
2. Deploy, open `/assessment.html`, complete + submit.
3. Expect: email 1 instantly + the remaining 12 emails (both branches) to
   `TEST_EMAIL`, one every ~95s across ~20 min. The on-page result renders inline
   and reveals the shareable `/r/<id>` link; `/r/<id>` shows the full map.
4. Review copy/links/spacing. Then Dan does his voice pass on
   `dan-nurture-sequence-copy.md` → mirror edits into `netlify/lib/sequence.js`.

## Go-live gates (before flipping TEST_MODE off)

- [ ] **`send.danieltiwari.com` verified in Resend — SPF + DKIM + DMARC all green.**
      (decision #6; must be confirmed in the Resend account — not checkable from the build sandbox.)
- [ ] `RESEND_FROM_EMAIL` set to a `send.danieltiwari.com` address.
- [ ] `BOOK_URL` swapped from the Calendly placeholder to Dan's Cal.com link (decision #5).
- [ ] Dan's voice pass applied to the sequence copy.
- [ ] Set `TEST_MODE=false` (or unset). Confirm `NOTIFY_TO=email@danieltiwari.com`.
- [ ] (optional) `BCC_TO=reece...` for a few real leads while bedding in.

## Notes / limits

- Scheduling uses Resend `scheduled_at`; Resend allows up to ~30 days ahead, so the
  21-day Branch B fits. If cadence ever extends past 30 days, switch the tail to a
  Resend dashboard Automation or a re-trigger.
- Scheduled sends are fire-and-forget — they don't auto-stop if a lead books a call.
  If "pause on booking" becomes needed, store the Resend message ids and cancel them,
  or move the sequence to a Resend Automation with a wait-for-event step.
- `netlify/lib/` is intentionally outside `netlify/functions/` so it is bundled as a
  shared module, not deployed as its own function endpoint.
