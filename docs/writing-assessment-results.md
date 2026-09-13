# Writing someone's assessment result

Daniel reads each person's answers and writes their result himself. Nothing
automatic is ever shown to them. This is how that works, and how his assistant can
do the writing for him.

## The flow

1. Someone finishes the assessment.
2. They get no email at all (Daniel's call, 2026-09-13) — they hear nothing yet.
3. Daniel gets an email with their full answers and a link to his workspace.
4. He writes their result and hits **Publish to them**.
5. They open their page, type the email they used, get a 6-digit code, and read
   it. The code is remembered for 30 days, so coming back is not a chore.

## Daniel's workspace

`https://danieltiwari.com/results`

He signs in with a code sent to his own address, picks a person on the left, reads
their answers, writes in the box on the right, and publishes. **Insert blank
template** drops in the empty shape to write into. A draft is invisible to them;
only Publish lets them read it.

Formatting is plain HTML: `<h2>` for a section heading, `<p>` for a paragraph,
`<ul><li>` for a list, `<blockquote>` to quote their own words back to them.

## Doing it from his assistant instead

Same doors, driven as plain JSON. Authenticate with the standing token instead of
a code:

```
Authorization: Bearer <RESULTS_AUTHOR_TOKEN>
```

That token lives in the site's environment settings as `RESULTS_AUTHOR_TOKEN`. It
is write-access to every result page, so it goes in his assistant's own
configuration, never in a message or a file in either repo.

List everyone who has submitted:

```
GET https://danieltiwari.com/api/result-admin?action=list
```

Read one person's answers and whatever is written so far:

```
GET https://danieltiwari.com/api/result-admin?action=get&id=<id>
```

Save a draft, or publish:

```
POST https://danieltiwari.com/api/result-admin
{"action":"save","id":"<id>","html":"<h2>Where you are</h2><p>…</p>"}
{"action":"publish","id":"<id>"}
{"action":"unpublish","id":"<id>"}
```

`publish` with no `html` publishes whatever draft is already saved, so the
assistant can write with `save`, let Daniel read it at `/results`, and publish
only once he is happy.

## Why it is built this way

- **The automatic result is off.** Daniel's words are the product; a machine
  verdict landing first undercuts them and contradicts what he tells people.
- **The raw answers and his writing are stored apart**, so rewriting a result can
  never damage what the person actually submitted.
- **A forwarded link is not a way in** — the code proves they own the email the
  assessment came in on.
- **Results go to Daniel, not to Reece.** They are the prospect's private
  information.
