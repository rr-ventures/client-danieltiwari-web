# How Dan's website + bot actually works, end to end — and how to fully own it

This is the single map of the "engine room": every moving part of the live site, the
Telegram bot, forms, and email funnel — plus every external account and secret they
depend on, who currently owns it, and exactly what to do to move it fully under Dan so
nobody else is needed. If you (Claude) are ever asked "how does X work" or "what does
Dan still rely on someone else for", read this first, then verify against the live code
and `AGENTS.md`. Code wins over this doc; fix the doc in the same change if they differ.

## The one-paragraph mental model

Dan's website is plain HTML pages plus a set of small serverless functions, all in THIS
repo, hosted on Netlify. When a change lands on the repo's main line, Netlify rebuilds
the site; a safety gate then emails an "Approve & publish" link before it goes live. The
forms (newsletter + assessment quiz), the email funnel (nurture drip via Resend), and
Dan's Telegram bot (which edits the site by message, using an AI model via OpenRouter)
are ALL functions in this same repo. The only things NOT in the repo are the secret keys
and the accounts those functions plug into — see the ownership map below.

## What lives where (all code is in-repo)

| Part | Where it is | Notes |
|---|---|---|
| Public pages | top-level `*.html` | built into `dist/` by `scripts/build-static-site.mjs` |
| Newsletter form | `index.html` #newsletter → `netlify/functions/newsletter-submit.js` | double opt-in, stores in Netlify Blobs |
| Assessment quiz | `assessment*.html/js` → `netlify/functions/assessment-submit.js` | stores result, sends day-0 email, enrols nurture |
| Nurture funnel copy | `content/emails/branch-a|b/*.md` | compiled by `scripts/build-emails.mjs` |
| Daily funnel sender | `netlify/functions/nurture-drip.js` + `netlify/lib/sequence.js` | scheduled; progress in Blobs |
| Email delivery | `netlify/lib/send.js` | sends via Resend |
| Telegram bot (webhook) | `netlify/functions/telegram-bot.js` | receives Dan's messages + approve/discard clicks |
| Telegram bot (worker + brain) | `telegram-agent-background.js`, `netlify/lib/repo-agent.js` | AI edits staged in Blobs, emailed for approval, then committed |
| Change/approval gate | `netlify/lib/change-gate.js` | holds a build back, emails Approve & publish |
| Data storage | Netlify Blobs via `netlify/lib/blobs.js` | leads, results, drip state, pending edits, gate state |

Full detail of every route and flow is in `AGENTS.md`. This doc is the ownership layer
`AGENTS.md` does not cover.

## The external layer — the ONLY things not in a repo

These are the accounts and the ~28 secret settings the functions read at runtime. They
live in the Netlify site's environment settings (and the accounts behind them), NOT in
git — which is correct (secrets must never be committed). This is the real dependency.

### Accounts / services the live site depends on

| Service | What it does here | Currently owned by | To make Dan fully independent |
|---|---|---|---|
| GitHub org `rr-ventures` | holds both repos (`client-danieltiwari-web`, `product-dancoaching-db`) | the agency (current owner) | transfer both repos to Dan's own GitHub account, or add Dan as owner |
| Netlify | hosts the site + all functions + Blobs storage + holds every secret below | the agency (current owner) | transfer the Netlify site to Dan's Netlify team, or rebuild it there and re-link the repo |
| Telegram (BotFather) | the bot Dan messages | whoever created the bot | move the bot to Dan's Telegram, or re-create and swap the token |
| OpenRouter | the AI model the bot uses to edit the site | the agency's API key | Dan creates his own OpenRouter key, swap it in |
| Resend | sends all site email (confirmations, funnel, notifications) | the agency's account + verified sending domain | Dan creates his own Resend account, verifies the domain, swap the key |
| Domain `danieltiwari.com` | the web address | domain registrar (whoever holds the DNS) | ensure Dan controls the registrar login + DNS |

### The secret settings (Netlify environment variables)

Grouped by what they power. None of these are in the repo; they're in Netlify's dashboard.

- **Telegram bot:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `DAN_TELEGRAM_USER_ID`
- **AI model:** `OPENROUTER_CLIENTS_API_KEY` (the clients key, not Reece's personal one — changed 30 Jul 2026), `AGENT_MODEL` (default `anthropic/claude-sonnet-5`), `AGENT_MAX_STEPS`
- **Email sending (Resend):** `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `DAN_REPLY_TO_EMAIL`
- **Who gets notified:** `DAN_NOTIFY_EMAIL`, `REECE_NOTIFY_EMAIL`, `NOTIFY_TO` (overrides form notifications), `TEST_EMAIL`, `TEST_MODE` (redirects all mail to a test inbox — turn OFF in production)
- **GitHub editing (used by the bot to commit approved edits):** `GITHUB_TOKEN`, `GITHUB_RW_PAT`, `GH_REPO`, `GH_DB_REPO`, `GATE_REPO`
- **Netlify + storage:** `NETLIFY_API_TOKEN`, `SITE_ID`, `BLOBS_SITE_ID`, `BLOBS_TOKEN`
- **Booking link:** `BOOK_URL`
- **Auto-provided by Netlify (do not set):** `URL`, `DEPLOY_PRIME_URL`

If email goes to the wrong person, it's `DAN_NOTIFY_EMAIL` / `REECE_NOTIFY_EMAIL` /
`NOTIFY_TO` / `TEST_MODE` — a setting, not code.

## The clean handoff, in order (how Dan ends all reliance on anyone else)

1. **Repos → Dan's GitHub.** Transfer both repos to Dan's own account (or add him as an
   owner). Now the code, this doc, and `AGENTS.md` are fully his.
2. **Netlify → Dan's account.** Either transfer the existing Netlify site to Dan's
   Netlify team, or create a fresh Netlify site in Dan's account and connect it to his
   copy of the repo.
3. **Re-create the keys under Dan's own accounts** and paste them into his Netlify site's
   environment settings: his own OpenRouter key, his own Resend account (with the domain
   verified), his own Telegram bot token, and a GitHub access key that can write to his
   repos. Copy across the non-secret settings (notify emails, `BOOK_URL`, model name).
4. **Point the Telegram bot's webhook** at Dan's Netlify site so messages reach his copy.
5. **Confirm the domain** `danieltiwari.com` DNS is under Dan's control at the registrar.
6. **Test end to end on Dan's stack:** submit the newsletter form, submit the assessment,
   send the bot a trivial edit and approve it, and confirm the site rebuilds. When all
   four pass on Dan's own accounts, there is zero external reliance.

Until steps 1–3 are done, the site keeps running on the original owner's accounts and
keys — that is the real (and only) remaining dependency. It is an accounts/ownership
task, not something any instruction file can change.
