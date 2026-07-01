# Daniel Tiwari Website Agent Context

This repo is Dan's public coaching website plus its Netlify Functions. Changes to
`main` build on Netlify and deploy to `danieltiwari.com`.

## Context Loading

- `netlify/lib/repo-agent.js` loads this file into the model prompt on every
  Telegram agent run. Treat this file as the compact source-of-truth map for how
  the website, newsletter, assessment funnel, GitHub edits, approvals, and deploys
  fit together.
- The agent also receives the GitHub file tree, the last few Telegram turns from
  Netlify Blobs, and any files it explicitly reads through its tools.
- If this file conflicts with a live code file, trust the code file and update
  this context in the same change.

## Build And Routing

- Runtime: this is a Netlify-hosted website and bot, not OpenClaw. The Telegram
  bot is implemented as Netlify Functions inside this repo.
- Message path: Telegram sends updates to `netlify/functions/telegram-bot.js`;
  that function starts `netlify/functions/telegram-agent-background.js`; the
  background worker calls the OpenRouter model/tool loop in
  `netlify/lib/repo-agent.js`; proposed changes are staged in Netlify Blobs and
  published only after email approval.
- Compute: Netlify Functions handle webhook/background execution. OpenRouter hosts
  the language model. GitHub is the editable source. Netlify deploys `main`.
- Static pages are top-level `*.html` files. `scripts/build-static-site.mjs` copies
  them into `dist/` during `npm run build`.
- Non-HTML public assets must be listed in `assetEntries` inside
  `scripts/build-static-site.mjs`, or they will not publish.
- Netlify Pretty URLs mean source links like `/assessment.html` are served to
  visitors as `/assessment`. Redirects in `netlify.toml` must handle the
  extensionless path when users click site buttons.
- API routes are redirects in `netlify.toml` to files under `netlify/functions/`.
- Key API redirects:
  - `/api/newsletter-submit` -> `netlify/functions/newsletter-submit.js`.
  - `/api/assessment-submit` -> `netlify/functions/assessment-submit.js`.
  - `/api/result-data` -> `netlify/functions/result-data.js`.
  - `/r/*` -> `result.html`.

## Live Forms And Emails

- Homepage newsletter form:
  - Markup and browser submit code: `index.html`, section `#newsletter`.
  - Browser POST target: `/api/newsletter-submit`.
  - Netlify redirect: `netlify.toml`.
  - Server handler: `netlify/functions/newsletter-submit.js`.
  - Subscriber store: Netlify Blobs via `netlify/lib/blobs.js`.
  - Subscriber confirmation email copy: `confirmationHtml()` in
    `netlify/functions/newsletter-submit.js`.
  - Confirmation flow: POST stores the subscriber as `pending` and sends a
    confirmation-link email; GET `/api/newsletter-submit?confirm=<token>` marks
    them `confirmed`.
  - Internal new-subscriber notification is sent only after the confirmation link
    is clicked.
  - Email delivery uses Resend through `netlify/lib/send.js`.
  - Editing `content/emails/` does not change this newsletter confirmation email.
  - Do not assume Kit, Mailchimp, ConvertKit, or another external platform unless a
    repo file proves that. The current newsletter welcome email is in this repo.

- Assessment and result nurture:
  - Quiz UI: `assessment.html`, `assessment.js`, and `assessment-core.js`.
  - Submit handler: `netlify/functions/assessment-submit.js`.
  - On submit, it stores the result in Netlify Blobs, sends the day-0 result-link
    email, and schedules/enrols the remaining nurture flow.
  - Result page: `result.html`, served at `/r/<id>` by `netlify.toml`.
  - Editable nurture email copy: `content/emails/branch-a/*.md` and
    `content/emails/branch-b/*.md`.
  - Email build step: `scripts/build-emails.mjs` validates the Markdown and writes
    `netlify/lib/emails.generated.json`.
  - Runtime renderer: `netlify/lib/sequence.js`.
  - Daily follow-up sending runs through `netlify/functions/nurture-drip.js` and
    uses drip progress stored in Netlify Blobs.

## Data Stores

Netlify Blobs is used as lightweight key/value storage:

- `assessment-results`: hosted quiz-result payloads for `/r/<id>`.
- `nurture-drip`: per-lead nurture state for the daily drip sender.
- `newsletter-subscribers`: homepage newsletter subscribers and one-time
  confirmation-token records.
- `agent-changesets`: pending Telegram agent edits waiting for approval.
- `agent-threads`: short Telegram conversation history for follow-up context.
- `change-gate`: pending repo/deploy approval state, if the change gate is enabled.

## Common Request Routing

- "Change my newsletter welcome email", "the email after the newsletter form", or
  "the email people get when they sign up to my newsletter" means edit
  `netlify/functions/newsletter-submit.js`, not `content/emails/`.
- "Change the assessment welcome email", "result email", "day-0 email", or
  "nurture sequence email" means edit the relevant Markdown file under
  `content/emails/`.
- "Change the funnel", "drip", "sequence", "branch A", "branch B", "A1/B1", or
  "day 3/day 6/day 21 email" means inspect `content/emails/README.md` and the
  matching Markdown file.
- "Someone submitted the quiz but did/didn't get emails" means inspect
  `assessment-submit.js`, `nurture-drip.js`, `sequence.js`, `send.js`, Blobs store
  usage, and env vars. Do not solve this by editing copy first.
- "Someone signed up to the newsletter but did/didn't get the email" means inspect
  `index.html`, `newsletter-submit.js`, `send.js`, `netlify.toml`, and subscriber
  Blobs store usage.
- Website copy, buttons, testimonials, and newsletter form text usually live in
  `index.html`.
- Booking links can appear in `index.html`, assessment functions, and nurture
  email merge fields. Trace the exact user-facing path before editing.

## GitHub, Approval, And Deploy

- The agent reads and stages files through the GitHub API, using repo-prefixed
  paths: `web/...` for this repo and `db/...` for `product-dancoaching-db`.
- `netlify/lib/repo-agent.js` stages changes in memory only; it does not commit.
- `telegram-agent-background.js` writes a pending changeset to the
  `agent-changesets` Blob store and emails Dan/Reece an approve/discard link.
- `telegram-bot.js` handles the approve/discard link. Approve calls
  `netlify/lib/repo-commit.js`, which commits the staged files to GitHub `main`.
- A web repo commit to `main` triggers Netlify to build and deploy the site.
- A db repo commit versions Dan's private coaching database only; it does not
  deploy the website.
- Two distinct publish paths, do not blend them: (a) a **Telegram-bot edit** is
  staged in Blobs and emailed for approve/discard BEFORE any commit, then commits
  "via Telegram" and auto-publishes; (b) a **direct git push to `main`** (e.g. from
  Reece's or Dan's Cowork Claude) builds first, then the change gate emails an
  "Approve & publish" link AFTER the build. No approval email almost always means
  the commit never reached GitHub `main`, so no build ever ran — check that before
  suspecting Netlify or email.

## Telegram Bot

- Telegram webhook: `netlify/functions/telegram-bot.js`.
- Background worker: `netlify/functions/telegram-agent-background.js`.
- Agent brain/prompt/tool loop: `netlify/lib/repo-agent.js`.
- Runtime context comes from this `AGENTS.md`, the system prompt in
  `netlify/lib/repo-agent.js`, the GitHub file tree, recent Telegram thread
  history stored in Netlify Blobs, and files the agent reads with its tools.
- Do not edit Telegram bot internals from Telegram unless Reece explicitly asks.
