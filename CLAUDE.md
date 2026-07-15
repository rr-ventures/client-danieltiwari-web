# Claude working rules — Dan's website (`client-danieltiwari-web`)

You are Dan's Claude working inside his live coaching **website** repo. Dan is not
technical: explain outcomes in plain English, never git/Netlify/deploy jargon he
didn't use first. Say what it means for him and what you need from him.

## Read the map first — don't guess how this site works

`AGENTS.md` in this repo is the source-of-truth map for how the website, forms,
emails, the assessment funnel, GitHub, the approval gate, and deploys fit
together. **Read it before answering any "how does X work / why didn't X happen"
question about this site.** If you're about to explain a mechanism from memory,
stop and read the file instead — guessing here is the #1 failure.

## How a change actually goes live (the whole chain)

A change is NOT live just because you edited a file, and NOT live just because you
"pushed." The real chain, in order:

1. The change is committed and **pushed to GitHub `main`**.
2. GitHub landing a new commit on `main` makes **Netlify build** the site.
3. When the build finishes, a safety gate (`netlify/lib/change-gate.js`) holds it
   back and **emails Dan and Reece an "Approve & publish" link** — the site does
   NOT auto-go-live.
4. Someone clicks **Approve**; the site updates ~1 minute later.

Every link depends on the one before it. No build means no email. No commit on
GitHub means no build. So **if the approval email never arrives, the fault is
almost always at step 1 — the commit never reached GitHub — not Netlify or email.**

## MANDATORY: verify your push actually landed before saying "done"

Committing locally is not the same as the commit reaching GitHub. A push can fail
or do nothing without an obvious error. So after any push, **prove the commit is on
GitHub before you tell Dan it's sent:**

- Run `git ls-remote origin main` (or `git log origin/main -1` after a fetch) and
  confirm your new commit's ID is the one on `origin/main`.
- If it isn't there, the push did not land. Say so plainly, and treat "no approval
  email" as expected — not a Netlify problem.

Never report a change as sent, building, or awaiting approval unless you have
confirmed the commit is on GitHub `main`.

## When "the approval email didn't come" — diagnose in THIS order

1. **Is the commit on GitHub `main`?** (`git ls-remote origin main`.) If no → the
   push never landed; that's the whole problem. Fix that first.
2. If the commit IS on GitHub but there's no build showing → then it's worth
   checking Netlify. Only reach for "Netlify didn't build" AFTER step 1 passes.
3. Check the spam folder on the approval recipients before concluding email failed.

Do not open with a Netlify or email theory. The commit-on-GitHub check is cheap and
catches this almost every time.

## Two different publish paths — don't blend them

- **A direct edit + push (what you do here):** triggers a build, then the gate
  emails an "Approve & publish" link. Approval comes AFTER the build.
- **A Telegram-bot edit (Dan messaging the site's own bot):** the bot stages the
  change and emails an approve/discard link BEFORE any commit; on approve it
  commits "via Telegram" and the gate auto-publishes it. This is a separate system.

If you edited via a push, you are on the first path. Don't expect or explain the
Telegram staging flow.

## Git

Reece's fleet auto-saves your work; you don't manage branches or ask Dan about git
plumbing. But you MUST still verify the push landed (above) before claiming a
website change is sent — that verification is not optional.

## Local preview (`dist/`) goes stale after a pull — resync it every time

`dist/` is a local-only preview copy (gitignored, not tracked by git — confirm with
`git check-ignore -v dist/<file>` if unsure). A `git pull` updates the real source
files but does **not** touch `dist/`, so right after pulling, whatever is being
previewed locally (e.g. `localhost:3000`) can still be showing yesterday's version
even though the pull succeeded. This already caused a false "the sync didn't work"
report once — don't repeat it.

**Whenever you pull updates in this repo, immediately resync `dist/` from the
current source files before telling Dan anything is up to date or checking it in a
browser.** Don't wait for an unrelated edit to trigger it as a side effect. If you
don't know the exact resync mechanism in the current session, at minimum copy the
changed source files over their `dist/` counterparts yourself before reporting the
pull as complete.
