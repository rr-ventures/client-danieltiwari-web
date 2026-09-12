# Current direction

The live plan for this repo is **PL-260611-DW**, "Run web ops for Daniel Tiwari":

`02_areas/Business/spareday/Clients/dan-coach/tasks/Run web ops for Daniel Tiwari.md`

Read its `## Outstanding` and `## Progress log` before changing anything here. That
plan is the source of truth for what is decided and what is still open; files in
this repo can be ahead of it or behind it.

## What is live right now (13 September 2026)

The hand-written-results work is **merged, published and serving**. It went live 12 September
04:51; Daniel then shipped his own copy fix on top (`869976a`, live 21:07).

Proven against the published site, not assumed:
- 14/14 exposure checks pass. A bare result link and a forged pass both get 401.
- The reader login works end to end: code requested, sent, delivered, wrong code refused, real
  code accepted, page opened, an unwritten result says "not ready", the pass will not open
  anyone else's result, and the code cannot be reused.

**Still waiting on one approval click:** the newest build carries the thank-you wording fix, and
Netlify bakes SECRET env values in at BUILD time, so `RESULTS_AUTHOR_TOKEN` only reaches the
functions once a build made after the rotation is published. Until then the workspace API
answers 401 to that token.

## The next real piece of work

**Somebody can finish the whole assessment without ever saying who they are.** Name and email
are asked in the LAST section, so an abandoned run leaves nothing at all, and a finished one
can still carry a throwaway name. `GZUIboj2tu6Y` (12 September) came in as "D" with a
yahoo.de address and may well be Daniel testing.

Reece's call, 13 September: **first name and email are asked BEFORE the assessment starts**,
so the person is known from the first click and their progress can be saved against them
rather than only in their own browser. That means a new opening section, the contact fields
moving out of section 07, and a record written as soon as the email is given rather than only
on submit. Not started.

## Known and not fixed

- The assessment is behind a `preview_access=true` cookie gate in `netlify.toml`.
  Testers get in with **`danieltiwari.com/assessment?key=danielpreview`**, which sets the
  cookie and passes them straight through (built 2026-09-12). The key sits in
  `assessment-coming-soon.html` in plain sight and always has: this keeps the assessment
  off the open web, it is not security. Opening it to everyone means deleting the two
  coming-soon redirects in `netlify.toml`.
- `netlify.toml` routes `/api/assessment-notify` to a function that does not exist.
  Dead route, safe to delete.
- (fixed 2026-09-12, live) the thank-you after submitting used to say "Thanks for testing this
  with me". It now matches the confirmation email's words. Verified by fetching the live
  assessment.js, not by trusting the commit.
- The approval email used to be headlined by the NEWEST commit in a release, so a batch
  ending in a tidy-up went out looking like housekeeping. `netlify/lib/release-headline.js`
  now prefers a merge message, then the first non-chore commit, and the email lists every
  commit with a file count. Covered by 8 checks in `scripts/check-results-feature.sh`.
- The publish approval lives in the DEPLOY gate, not in `result-admin.js`. Daniel hitting
  Publish there makes a result readable by that one person immediately, and emails them the
  link; that is the intended behaviour and is his call to make, not something to approve.
- Daniel's Telegram website agent **works**. Proven 2026-09-12 by posting a real update to
  the live webhook as Reece and reading the answer back in Telegram. Its AI key was replaced
  from the secret store earlier that day; whether that was the fix cannot be proven, because
  a Netlify secret cannot be read back. Model: `anthropic/claude-sonnet-5` via `AGENT_MODEL`.
