// Scheduled (daily) nurture drip — Model B.
// For every enrolled lead, send any email whose `day` has arrived and hasn't
// been sent yet, rendering from the CURRENT repo copy (buildBranch reads the
// baked emails.generated.json). This is what makes a copy edit reach everyone
// still in the sequence, not just future signups.
//
// Schedule is configured in netlify.toml: [functions."nurture-drip"] schedule = "@daily".
// Idempotent: a day is only added to sentDays after a successful send, so a
// failed/skipped send is retried next run; already-sent days are never repeated.
const { buildBranch } = require("../lib/sequence");
const { dripStore } = require("../lib/blobs");
const { sendResendEmail, mailConfig } = require("../lib/send");

const DAY_MS = 24 * 60 * 60 * 1000;

exports.handler = async () => {
  const store = dripStore();
  const { from, replyTo } = mailConfig();

  let listing;
  try {
    listing = await store.list();
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: `drip list failed: ${error.message}` }) };
  }

  const now = Date.now();
  let processed = 0, sent = 0, completed = 0;
  const warnings = [];

  for (const { key } of listing.blobs || []) {
    let rec;
    try {
      rec = await store.get(key, { type: "json" });
    } catch (error) {
      warnings.push(`${key}: read failed (${error.message})`);
      continue;
    }
    if (!rec || rec.done) continue;
    processed += 1;

    const elapsedDays = Math.floor((now - Date.parse(rec.startedAt)) / DAY_MS);
    const emails = buildBranch(rec.branch, rec.mergeFields || {});
    const sentDays = new Set(rec.sentDays || []);

    // send every due, not-yet-sent email (oldest first) — catch-up safe
    const due = emails
      .filter((e) => e.day <= elapsedDays && !sentDays.has(e.day))
      .sort((a, b) => a.day - b.day);

    let changed = false;
    for (const email of due) {
      const res = await sendResendEmail({
        from,
        to: [rec.email],
        reply_to: replyTo,
        subject: email.subject,
        html: email.html,
        tags: [{ name: "source", value: "nurture_drip" }],
      }).catch((err) => ({ error: err.message }));

      if (res && (res.error || res.skipped)) {
        warnings.push(`${key} day ${email.day}: ${res.error || res.reason}`);
        break; // stop this lead; retry remaining due emails next run
      }
      sentDays.add(email.day);
      sent += 1;
      changed = true;
    }

    const allDays = emails.map((e) => e.day);
    const done = allDays.every((d) => sentDays.has(d));
    if (changed || done) {
      rec.sentDays = [...sentDays].sort((a, b) => a - b);
      rec.done = done;
      try {
        await store.setJSON(key, rec);
        if (done) completed += 1;
      } catch (error) {
        warnings.push(`${key}: save failed (${error.message})`);
      }
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, processed, sent, completed, warnings }),
  };
};
