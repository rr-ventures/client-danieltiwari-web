# Current direction

The live plan for this repo is **PL-260611-DW**, "Run web ops for Daniel Tiwari":

`02_areas/Business/spareday/Clients/dan-coach/tasks/Run web ops for Daniel Tiwari.md`

Read its `## Outstanding` and `## Progress log` before changing anything here. That
plan is the source of truth for what is decided and what is still open; files in
this repo can be ahead of it or behind it.

## What is live right now (2026-09-12)

The assessment's hand-written-results work is built on the branch
`feat/hand-written-assessment-results` and is **deliberately not on `main`**, because
pushing to `main` queues an approve-and-publish email to Daniel. It ships when Reece
says so, not before.

What that branch changes, and why, in one line each:

- The automatic result page is **off** for prospects. Daniel reads their answers and
  writes each result himself at `/results`; `assessment-core.js` still scores the quiz,
  but only to fill the teaser and his own notification.
- Submitting sends **one** email: a thank-you plus two headline findings, no result link.
- Publishing a result emails that person the link, **once**. Editing a live page never
  re-sends it.
- Readers open a result with a 6-digit code sent to the email they submitted with, then
  hold a pass for 30 days.
- `RESULTS_AUTHOR_TOKEN` lets Daniel's own assistant write a result through the same
  endpoints. See `docs/writing-assessment-results.md`.

How it all fits together: `AGENTS.md`. How to prove it still works:
`bash scripts/check-results-feature.sh`.

## Known and not fixed

- The assessment is behind a `preview_access=true` cookie gate in `netlify.toml`.
  Testers get in with **`danieltiwari.com/assessment?key=danielpreview`**, which sets the
  cookie and passes them straight through (built 2026-09-12). The key sits in
  `assessment-coming-soon.html` in plain sight and always has: this keeps the assessment
  off the open web, it is not security. Opening it to everyone means deleting the two
  coming-soon redirects in `netlify.toml`.
- `netlify.toml` routes `/api/assessment-notify` to a function that does not exist.
  Dead route, safe to delete.
- The on-screen thank-you after submitting still says "Thanks for testing this with me",
  which reads wrong once these are real prospects rather than testers.
- Daniel's Telegram website agent **works**. Proven 2026-09-12 by posting a real update to
  the live webhook as Reece and reading the answer back in Telegram. Its AI key was replaced
  from the secret store earlier that day; whether that was the fix cannot be proven, because
  a Netlify secret cannot be read back. Model: `anthropic/claude-sonnet-5` via `AGENT_MODEL`.
