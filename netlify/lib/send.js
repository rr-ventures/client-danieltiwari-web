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

module.exports = { sendResendEmail, mailConfig };
