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

**Nothing is waiting on an approval click.** Everything described here is published and serving.
Note that Netlify bakes SECRET env values in at BUILD time, so changing one only reaches the
functions once a build made AFTER the change is published.

## Who takes the assessment is known from the first click (13 September)

The start button sits at the TOP of the page, and nothing is asked of anyone until they press it
(Reece, 13 September). Pressing it reveals one short step: "Input your email so you can save your
answers as you go", first name and email, then Continue. So first name and email are still taken
before the first question and after the person has said yes, rather than after the last question. The person is
written down the moment they give them (`netlify/functions/assessment-start.js`), so somebody who
stops halfway is no longer invisible: their row shows in Daniel's workspace marked "didn't finish".
What they type is carried into the contact fields at the end, and a returning visitor is not asked
again. 8 browser checks cover it.

**A second gate was found and removed the same day.** `assessment.html` carried its own script that
replaced the page with a coming-soon one unless the visitor had a `preview_access` cookie.
That script, those redirects and the coming-soon page itself are all gone now.
Deleting the redirects in `netlify.toml` never touched it, so the assessment stayed shut for
everyone Daniel sent it to while every check reported it open. A fetch of the page returns 200
either way, which is exactly why it went unnoticed. **Any check on whether a page works has to LOAD
it in a browser, not fetch it.** `GZUIboj2tu6Y` (makadun617@yahoo.de) is Daniel's own
address, confirmed by Reece on 13 September, so it is not a lead waiting on a reply.

## Known and not fixed

- (fixed 2026-09-13, live) THE ASSESSMENT IS OPEN TO EVERYONE. It is not behind a cookie,
  there is no tester key, and `danieltiwari.com/assessment` is the link to send anybody. Two
  separate gates used to hold it shut: redirects in `netlify.toml` (removed 12 Sep) and a
  script inside `assessment.html` itself (removed 13 Sep). If you are answering a question
  about who can take the assessment, the answer is anyone with the link. The page keeps its
  own noindex, so it does not turn up in search.
- (fixed 2026-09-13, live) `/api/assessment-notify` is gone from `netlify.toml`.
- (fixed 2026-09-13, live) Name and email are asked BEFORE the first question, and finishing
  completes that same record. Someone who stops halfway shows in the workspace as
  "didn't finish"; someone who finishes appears once, not twice.
- (fixed 2026-09-13) An approval email can no longer roll the site backwards. Approving a
  change the live site already contains says so and publishes nothing.
- (fixed 2026-09-13) The newsletter form rate-limits signups per person and per network and
  refuses SMS gateways and throwaway domains. `scripts/clean-subscriber-spam.mjs` clears
  bot signups that were never confirmed.
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
