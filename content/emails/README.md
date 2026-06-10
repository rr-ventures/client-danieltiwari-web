# Dan's nurture emails — how to edit them

These Markdown files **are** the live email funnel. Edit a file here, save/commit it, and the
change goes out to the funnel automatically. You never touch code.

## Where things are
- `branch-a/` — the **diagnostic** sequence (people who scored as a strong fit). 6 emails over 12 days.
- `branch-b/` — the **nurture** sequence (everyone else). 7 emails over 21 days.
- Files are sent in filename order. The number + day in the filename (`03-day6.md`) is just for ordering.

## How to edit an email
Open the `.md` file. The top part (between the `---` lines) is the settings:

```
---
day: 6
subject: "One thing to try this week"
preview: "Small, real, tied to your result."
---
```
- `day` = how many days after signup this email sends (day 0 = immediately).
- `subject` = the email subject line.
- `preview` = the grey preview text shown in the inbox before opening.

Below the second `---` is the email body. **One blank line between paragraphs.** Write normally.

## The few special bits
- `{{first_name}}` — becomes the person's first name.
- `{{top_focus_area}}` — the life area their quiz flagged (e.g. "Career").
- `{{authenticity_stage}}` — where they landed on the assessment (e.g. "Questioning").
- `**bold**` — makes text bold.
- A line that is just `[MAP]` — inserts the "Open your Authenticity Map" link.
- A line that is just `[BOOK]` — inserts the "Book a private conversation" link.

That's the whole list. Don't invent new `{{...}}` or `[...]` tokens — only the ones above work,
and using an unknown one will stop the change from publishing (a safety net, so a typo can't break
the live funnel — the previous version just keeps running until it's fixed).

## Two things to know
1. **Edits only reach NEW signups** (current setup). Someone already partway through the sequence
   keeps the version they started on. (We can change this later so edits reach everyone still in it.)
2. After you save, it takes a couple of minutes to go live while the site rebuilds.

## Don't edit
`netlify/lib/emails.generated.json` is built automatically from these files. Leave it alone.
