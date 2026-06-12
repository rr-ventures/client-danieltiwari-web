// Shared Resend send + mail config, used by assessment-submit (day-0 + notify)
// and the scheduled nurture-drip function (subsequent emails).

async function sendResendEmail(payload) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { skipped: true, reason: "RESEND_API_KEY missing" };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || body.error?.message || `Resend failed with ${response.status}`);
  }
  return body;
}

function mailConfig() {
  return {
    from: process.env.RESEND_FROM_EMAIL || "Daniel Tiwari <onboarding@resend.dev>",
    replyTo: process.env.DAN_REPLY_TO_EMAIL || "email@danieltiwari.com",
    bookUrl: process.env.BOOK_URL || "https://cal.eu/danieltiwari/connect",
  };
}

// Build a clear "ACTION REQUIRED — add this lead to the CRM" internal email.
// rows: array of [label, value] (value should already be HTML-escaped).
// extraHtml: optional trailing HTML (e.g. a result-page link).
function leadActionEmail({ kind, rows, extraHtml = "" }) {
  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 14px 6px 0;color:#8a857a;white-space:nowrap;vertical-align:top">${label}</td>
         <td style="padding:6px 0;color:#15140f"><strong>${value}</strong></td></tr>`
    )
    .join("");
  return `<div style="font-family:Georgia,serif;color:#15140f;line-height:1.6;max-width:34rem">
    <div style="background:#fbeaea;border:1px solid #e3b7b7;border-radius:8px;padding:10px 14px;margin-bottom:1.1rem">
      <span style="font-size:.72rem;font-weight:bold;letter-spacing:.08em;color:#b23b3b;text-transform:uppercase">⚑ Action required — add to CRM</span>
    </div>
    <p style="margin:0 0 .6rem">New ${kind.toLowerCase()}. Please add this lead to your CRM:</p>
    <table style="border-collapse:collapse;font-size:.95rem">${rowsHtml}</table>
    ${extraHtml}
    <p style="font-size:.8rem;color:#8a857a;margin-top:1.6rem">Sent automatically from danieltiwari.com when a lead comes in.</p>
  </div>`;
}

module.exports = { sendResendEmail, mailConfig, leadActionEmail };
