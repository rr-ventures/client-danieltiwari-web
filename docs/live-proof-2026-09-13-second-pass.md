# What was checked on the live site, 13 September 2026 (second pass)

Everything below was done against danieltiwari.com itself, in a real browser or
against the real endpoints, not against a local copy and not from an earlier note.

## The thing that was actually broken

`danieltiwari.com/assessment` sent every visitor to the "Being built right now"
page. The fix for that was built and merged the night before, but the site's own
approval gate had never been clicked, so the live site was still serving the
version from 12 Sep 23:34. Two finished builds were sitting unpublished behind it:
the one that opens the assessment, and the one that lets Reece sign in to the
results workspace. Both are now published.

Proof: loading /assessment in a browser landed on /assessment-coming-soon.html
before, and on the assessment itself after.

## Taken end to end, as a real person

A full assessment was submitted on the live site as "SPAREDAY TEST please ignore"
(reece@spareday.ai), 40 answers, from a 390px phone-width browser.

- Name and email are asked before the first question, and the person is written
  down at that first click (`/api/assessment-start` → 200).
- What they typed at the start was carried into the contact step at the end, with
  nothing retyped.
- The Report a bug button sent immediately and the email reached Daniel.
- The feedback box saved against the submission.
- The thank-you screen says "Thank you. Your answers are in", with no link to an
  empty page and no mention of testing.
- Four emails, all confirmed **delivered** by the sending service:
  - "Your assessment is in" → the person
  - "New assessment submission" → email@danieltiwari.com, and nobody else
  - "Bug report" → email@danieltiwari.com
  - the 6-digit workspace code → Reece
- No follow-up sequence email was sent and nobody was enrolled in one.

## The follow-up sequence really is off

Two independent locks, both checked: `ONLY_DAY_ZERO_FOR_NOW` is hard-coded true in
the submit handler so nobody new is ever enrolled, and every one of the 7 people in
the drip store is marked done. Nothing is queued for anyone.

## Not in test mode

`TEST_MODE` is unset on the live site, and `NOTIFY_TO` is email@danieltiwari.com
alone. Daniel's worry that submissions were being redirected to Reece's test inbox
was unfounded; they go to him.

## Reece can see what Daniel sees

`danieltiwari.com/results`, his own gmail address, code delivered, workspace opened,
10 submissions listed, a person's full answers readable, a result written,
published, and the person emailed the link. The 30-day pass survives leaving and
coming back.

## The reader side, from a clean browser

- A bare `/r/<id>` link with no browser state shows nothing, and the data endpoint
  returns 401 to an anonymous request.
- Asking for a code sent one to the submitting address.
- A wrong code was refused: "That code is not right."
- The right code opened the written result.

## Three things that were wrong, found here and fixed

1. **One person made two rows.** The finished submission minted a new id instead of
   finishing the record opened at the start, so anyone who completed the assessment
   appeared twice in Daniel's workspace, once as a ghost marked "didn't finish".
   Fixed, then re-proved by taking the whole assessment again: one row, one id,
   40 answers.
2. **Old approval emails were loaded guns.** Approving published that commit
   whatever had happened since, and seven unclicked approval links were still live,
   the oldest from 1 July. Clicking any of them would have rolled the site back by
   weeks and re-closed the assessment. Fixed, then proved by clicking the 1 July one
   on the live site: "This one is already on the site... Nothing was changed", and
   the live commit did not move.
3. **The newsletter form was a spam cannon.** 1,131 records, only 85 real, and every
   junk signup had made the site email a stranger from the same domain the
   assessment relies on. Rate limits, gmail dot/plus collapsing and a refusal list
   are in; the backlog is cleared (1,131 → 85) with
   `scripts/clean-subscriber-spam.mjs`.

## Still open, and whose they are

- **Daniel:** write the result for GZUIboj2tu6Y (12 Sep, 47 answers, yahoo.de) —
  the one real person waiting, and worth him confirming it is not himself.
- **Daniel:** the feedback box only reaches him if the person finishes and submits,
  because it travels with the submission. Someone who types feedback and abandons
  it is lost. The Report a bug button is different and sends immediately.
- **Reece:** four of his own June/July test submissions still sit in Daniel's list
  as "Reece", plus one labelled SPAREDAY TEST with a published result page kept so
  he can open it. Say the word and they go.
- **Reece:** Daniel said on 12 Sep that the Telegram website bot stopped working.
  Its wiring is healthy — bot live, webhook pointed at the site, nothing stuck, no
  errors, all keys present, model anthropic/claude-sonnet-5 — and a real message
  posted to the live webhook was accepted and dispatched. Whether the answer landed
  needs one look at his own Telegram.
