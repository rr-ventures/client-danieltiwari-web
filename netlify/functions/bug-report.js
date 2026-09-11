const { sendResendEmail, mailConfig, leadActionEmail } = require("../lib/send");

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" } };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const message = String(data.message || "").trim();
  if (!message) {
    return { statusCode: 400, body: JSON.stringify({ error: "A description is required" }) };
  }
  const page = String(data.page || "").trim() || "(unknown page)";

  // Same "where do internal emails go" settings as every other internal
  // notification (assessment-submit.js) — TEST_MODE redirects this too.
  const TEST_MODE = /^(1|true|yes)$/i.test(String(process.env.TEST_MODE || ""));
  const TEST_EMAIL = process.env.TEST_EMAIL || "reece.j.rainer@gmail.com";
  const { from, replyTo } = mailConfig();
  const notifyTo = TEST_MODE ? TEST_EMAIL : (process.env.NOTIFY_TO || process.env.DAN_NOTIFY_EMAIL || "email@danieltiwari.com");

  const result = await sendResendEmail({
    from,
    to: String(notifyTo).split(",").map((s) => s.trim()).filter(Boolean),
    reply_to: replyTo,
    subject: `Bug report — ${page}`,
    html: leadActionEmail({
      kind: "Bug report",
      rows: [["Page", escapeHtml(page)]],
      extraHtml: `<p style="font-family:Georgia,serif;margin-top:1rem;white-space:pre-wrap">${escapeHtml(message)}</p>`,
    }),
    tags: [{ name: "source", value: "assessment_bug_report" }],
  }).catch((err) => ({ error: err.message }));

  if (result && result.error) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, warning: result.error }) };
  }
  return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: !!(result && result.skipped) }) };
};
