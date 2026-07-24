# Assessment quiz — flow state, coaching philosophy, implementation conventions

Working notes for the Wheel of Life self-assessment lead magnet (`assessment.html` /
`assessment.js` / `assessment-core.js`). This is the durable companion to
`dan-brainstorm-raw.md` (Dan's raw content) — this file is Claude's own working
knowledge of the flow structure, resolved decisions, and code conventions, kept here
so it travels with the repo instead of living only in local session memory.

**Trust the live code over this doc if they ever disagree** — the step flow especially
has been restructured more than once.

## Current step flow (verified against live code 2026-07-22)

Step 0 — Fulfillment (1-5 per area, one card at a time)
Step 1 — Urgency flag (pick up to 3 pressing areas, or "nothing's pressing"; folds in
the old "spillover effect" idea rather than a separate ranking page)
Step 2 — Focus recommendation (1 area selected, tap to swap)
Step 3 — Deeper questions per focus area (see below)
Step 4 — Inner State + Personality fit signals
Step 5 — Contact info

An older "Importance ranking" step and a separate arrow-ranking "Spillover" step do
NOT exist in the live flow — `initSpilloverStep` in `assessment.js` is dead code (no
matching HTML container). If a future session's notes reference a 7-step flow with
importance ranking as its own step, that's stale — verify against the code.

## Deeper questions flow (per focus area)

1. **cause** — Why does [area] only feel like X/5? (full brainstorm content done —
   dissatisfaction reframed as compass + fuel, not a bad thing)
2. **vision** — Consciously aware of what your 5/5 would look like? (Yes/Partially/Not yet)
3. **vision-describe** — Describe your 5/5 (bullet list + "I genuinely want these")
4. **vision-item-achievable** — Per bullet: Achievable / Literally impossible
5. **vision-achievable-check** *(skipped if all achievable)* — shows non-achievable
   items ("addressed in acceptance section"), asks if the remaining vision still holds
6. **vision-revised** *(skipped unless revise)* — new bullet list, achievable items pre-populated
7. **acts** — Are you contributing to the above? Yes/No
8. **acts-list** *(skipped if No)* — what you ARE doing that contributes + what you
   COULD be doing but aren't
9. **acts-reasons ("Hidden Values")** *(skipped if No/empty)* — uses **laddering**
   (Means-End Chain Theory, Reynolds & Gutman: keep asking why until a terminal value).
   Per action/inaction: type a reason → "the real reason, or something deeper?" →
   deeper adds a layer; "this is it" locks the terminal value and asks whether Dan
   wants to keep living by it. "+ Add another reason" starts an independent ladder for
   the same action. Implementation: `renderActsWhyLadders` in `assessment.js`, state
   key `deeper_<area>_why_threads` (array of `{layers[], terminal}`), decisions in
   `deeper_<area>_acts_values_continue`.
10. **control** — "Anything you cannot change and must accept?" — auto-pre-populated
    from non-achievable vision items
11. **control-attitude** *(skipped if No)* — per circumstance: how do you feel about
    it (open text) + is this how you want to feel (Yes/No)

## Process rule: hold the flow state, don't ask "what's next" generically

When continuing a brainstorm session on this flow, check the step order above and
name the specific next step (e.g. after acts-list comes acts-values, not a jump to a
new topic) rather than asking an open "what's next?". Dan is relying on Claude to
hold the sequence, not re-derive it each time — this was a direct, frustrated
correction ("I NEED TO BE ABLE TO RELY ON YOU").

When transcribing Dan's brainstorm into `dan-brainstorm-raw.md`, only capture
substantive PDF-bound content — strip out conversational meta-feedback he's giving
directly to Claude about process.

## Governing coaching philosophy — fit signals (Step 4, "Section B")

Dan explicitly does not want deep per-symptom PDF content here: "these are just
symptoms, similar to how our Western medical system prescribes medication to treat
symptoms instead of addressing the root cause... get the individual back on track to
live in alignment with himself, and then the symptoms go away by themselves."
Don't push for more per-item brainstorming on Inner State sub-items, Compulsive
Patterns, or Lifestyle — that's resolved, not outstanding, and pushing on it goes
against how Dan actually coaches.

Status per fit-signal question:
- **Readiness** — full PDF-ready content.
- **Inner state** — Anxiety, Depression, Apathy, Anger/resentment: full content
  (built via Socratic client-roleplay, see method below). PTSD scoped (Dan doesn't
  feel qualified beyond the general metaphysical-foundation point). Frustration/
  pressure, Meaninglessness, Panic attacks, Hypochondria deliberately thin — living
  answer library territory, not further brainstorming.
- **Compulsive patterns** — general theory only (addiction as distraction, or an
  unmet desire/value being satisfied by it). Per-substance content intentionally not
  written.
- **Lifestyle** — general theory only (sleep/exercise/diet as non-negotiable). Same
  reasoning as Compulsive patterns.
- **The mainstream / Track record / The stakes** — purpose captured only (screening/
  personality fit, journey stage, urgency), thin by design, not PDF-content-bearing.

## Content-generation workflow: the living answer library

For open-text/bullet answers with no matching brainstorm-doc guidance yet, Dan
writes the first PDF response manually. Treat these as a growing reference library —
for later users with semantically similar open-text answers, reuse/adapt Dan's prior
manual response rather than inventing new copy. Applies especially to fit-signal
follow-ups and the control-attitude "how do you feel" field. Agreed process, not yet
implemented in code.

## Content-elicitation methods

**For assessment page copy generally:** Dan finds it hard to generate copy from
scratch. Don't ask him to write or brainstorm freely — ask 2-4 sharp, concrete
questions per page whose answers map straight into the draft text, then draft and
show it back for approval. Work one page at a time, in live-flow order. Show the
current copy first, broken into its distinct blocks (headline, lede, bullets, body,
CTA). Good question angles: the one true reason this exists, what makes a claim on
the page actually earned, what objection the reader is carrying right before the
next action. Check `dan-voice-reference.md` before finalizing wording. Skip
re-litigating sections already content-complete unless Dan asks to revisit.

**For Socratic client-roleplay** (Dan plays coach, Claude plays client, to dig out
his coaching philosophy for a fit-signal or similar): keep the "client" answers
simple, uncertain, and a little inarticulate ("I don't know... tired, maybe?" /
"Yeah, that's it"). Never have the client produce the reframe, metaphor, or
diagnosis — that's Dan's line to deliver. If the client pre-solves the insight, the
exercise stops working: the value is Dan doing the actual work of arriving at and
stating the insight himself. Keep any needed factual detail (symptoms, situation)
concrete and surface-level, not analytical.

## Content conventions

- **Per-page guidance bullets stay terse.** These "what I want to explain to the
  user" points Dan dictates (which double as his per-question explainer-video
  talking points) are bullet points, not paragraphs. Render roughly what he says in
  one tight line, keeping his emphasis (e.g. CAPS words) — don't add reasoning,
  caveats, or extra sentences he didn't ask for. Example — Dan: "5 should be their
  DREAM LIFE VISION, realistic or not" → bullet: "Let a 5 be your DREAM LIFE VISION
  for that area, realistic or not."

## Implementation conventions

- **Arrow-button ranking lists** (importance/urgency-style reorder UI): after a move,
  use `window.scrollBy({ top: after - before, behavior: "instant" })` where before/
  after are `btn.getBoundingClientRect().top` captured before and after the DOM
  reorder. This keeps the button under the user's cursor/finger. Do NOT use
  `btn.focus()` or a deferred focus call — both were tried and failed to keep the
  button in place; the DOM reorder shifts page content out from under a focus-based
  approach.
- **Error message positioning:** error `<p>` elements must be the first child inside
  the nav button container (`.form-nav`, `.fulfillment-nav`), not placed in the
  document flow before it. Use `flex-direction: column` on the nav container with a
  nested `.form-nav-buttons` div for the actual buttons. Placing errors in the flow
  between content and nav makes their position vary with content length — always put
  them directly above the buttons instead.

## Key files

- `assessment.html` — CSS, step HTML, inline JS
- `assessment.js` — step init functions, `_deeperState`
- `assessment-core.js` — `AREAS` array, `rankAllAreas`
- `docs/dan-brainstorm-raw.md` — master brainstorm doc, Dan's raw words verbatim, do
  not paraphrase
- `docs/dan-voice-reference.md` — voice/copy rules
