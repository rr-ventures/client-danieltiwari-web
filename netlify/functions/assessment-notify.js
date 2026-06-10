const { getStore } = require("@netlify/blobs");
const { sendResendEmail, mailConfig } = require("../lib/send");

function notifyStore() {
  const siteID = process.env.BLOBS_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  return siteID && token
    ? getStore({ name: "assessment-notify", siteID, token })
    : getStore("assessment-notify");
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Valid email required" }) };
  }

  try {
    const store = notifyStore();
    await store.setJSON(email, { email, name, signedUpAt: new Date().toISOString() });
  } catch (e) {
    console.error("Blob store failed:", e);
  }

  const { from, replyTo } = mailConfig();
  const firstName = name ? name.split(/\s+/)[0] : "there";

  try {
    await sendResendEmail({
      from,
      to: email,
      replyTo,
      subject: "You're on the list.",
      html: `
        <div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;color:#1c1a14;line-height:1.75;font-size:1rem">
          <p>Hi ${firstName},</p>
          <p style="margin-top:1rem">I'm putting the finishing touches on the personal self-assessment. You'll get a direct link the moment it's ready.</p>
          <p style="margin-top:1rem">Daniel</p>
        </div>
      `,
    });
  } catch (e) {
    console.error("Confirmation email failed:", e);
  }

  try {
    await sendResendEmail({
      from,
      to: replyTo,
      subject: `Assessment notify signup: ${name || email}`,
      html: `<p><strong>${name || "(no name)"}</strong><br>${email}</p>`,
    });
  } catch (e) {
    console.error("Dan notify email failed:", e);
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true }),
  };
};
