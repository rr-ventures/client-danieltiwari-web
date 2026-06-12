// Newsletter signup ("Words Worth Writing" homepage form).
// Replaces the old Netlify Forms POST (which 404'd on submit). Stores a pending
// subscriber in Blobs, sends a confirmation email, then marks them confirmed and
// notifies Dan when they click the confirmation link.
const crypto = require("node:crypto");
const { subscribersStore } = require("../lib/blobs");
const { sendResendEmail, mailConfig } = require("../lib/send");

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function keyFor(email) {
  // Blob keys must be filesystem-safe; lower-case the email and encode it.
  return encodeURIComponent(String(email).trim().toLowerCase());
}

function siteUrl(event) {
  const headers = event.headers || {};
  const host = headers.host || headers.Host;
  const proto = headers["x-forwarded-proto"] || headers["X-Forwarded-Proto"] || "https";
  return String(process.env.URL || (host ? `${proto}://${host}` : "https://danieltiwari.com")).replace(/\/$/, "");
}

function page(message) {
  return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:Georgia,serif;max-width:34rem;margin:16vh auto;padding:0 1.2rem;color:#15140f;line-height:1.7;text-align:center"><h1 style="font-weight:normal;font-size:1.35rem">Daniel Tiwari</h1><p>${message}</p></div>`;
}

function confirmationHtml(firstName, confirmUrl) {
  const hi = firstName ? `Hey ${escapeHtml(firstName)},` : "Hey,";
  return `
  <div style="font-family: Georgia, serif; color: #15140f; line-height: 1.7; max-width: 34rem;">
    <p>${hi}</p>
    <p>Welcome to my newsletter.</p>
    <p>All you need to do is confirm your e-mail address with the link below and you're all set.</p>
    <p style="margin:1.4rem 0;"><a href="${escapeHtml(confirmUrl)}" style="color:#15140f;border-bottom:1px solid #15140f;text-decoration:none;">Confirm your e-mail address</a></p>
    <p>Happy to have you on board.</p>
    <p style="margin-top: 1.6rem;">Sincerely,<br>Daniel</p>
    <p style="font-size: 0.8rem; color: #8a857a; margin-top: 2rem;">
      You're receiving this because you subscribed at danieltiwari.com.
    </p>
  </div>`;
}

async function sendSubscriberNotify({ email, firstName, lastName, from, replyTo, testMode, testEmail }) {
  const notifyTo = testMode ? testEmail : (process.env.NOTIFY_TO || process.env.DAN_NOTIFY_EMAIL || "email@danieltiwari.com");
  return sendResendEmail({
    from,
    to: [notifyTo],
    reply_to: testMode ? replyTo : email,
    subject: `New newsletter subscriber: ${firstName || email}`,
    html: `<div style="font-family: Georgia, serif; color:#15140f;">
      <p><strong>Name:</strong> ${escapeHtml([firstName, lastName].filter(Boolean).join(" ")) || "(not given)"}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
    </div>`,
    tags: [{ name: "source", value: "newsletter_notify" }],
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" } };
  }

  if (event.httpMethod === "GET") {
    const token = String((event.queryStringParameters || {}).confirm || "").trim();
    if (!token) {
      return { statusCode: 404, headers: { "Content-Type": "text/html" }, body: page("This confirmation link is missing its token.") };
    }
    const store = subscribersStore();
    const pending = await store.get(`confirm:${token}`, { type: "json" }).catch(() => null);
    if (!pending || !pending.email) {
      return { statusCode: 200, headers: { "Content-Type": "text/html" }, body: page("This confirmation link has already been used or has expired.") };
    }

    const emailKey = keyFor(pending.email);
    const existing = await store.get(emailKey, { type: "json" }).catch(() => null);
    const confirmedAt = existing && existing.confirmedAt ? existing.confirmedAt : new Date().toISOString();
    const subscriber = {
      email: pending.email,
      firstName: pending.firstName || "",
      lastName: pending.lastName || "",
      status: "confirmed",
      createdAt: (existing && existing.createdAt) || pending.createdAt || confirmedAt,
      confirmedAt,
      notifiedAt: (existing && existing.notifiedAt) || null,
    };

    const TEST_MODE = /^(1|true|yes)$/i.test(String(process.env.TEST_MODE || ""));
    const TEST_EMAIL = process.env.TEST_EMAIL || "reece.j.rainer@gmail.com";
    const { from, replyTo } = mailConfig();
    if (!subscriber.notifiedAt) {
      await sendSubscriberNotify({
        email: subscriber.email,
        firstName: subscriber.firstName,
        lastName: subscriber.lastName,
        from,
        replyTo,
        testMode: TEST_MODE,
        testEmail: TEST_EMAIL,
      }).then(() => { subscriber.notifiedAt = new Date().toISOString(); }).catch(() => {});
    }

    await store.setJSON(emailKey, subscriber);
    await store.delete(`confirm:${token}`).catch(() => {});
    return { statusCode: 200, headers: { "Content-Type": "text/html" }, body: page("You're confirmed. The next note from Daniel will arrive when there is something worth sending.") };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  // Honeypot — silently accept bots so they don't retry, but do nothing.
  if (body["bot-field"]) {
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  const email = String(body.email || "").trim();
  const firstName = String(body.first_name || body["first-name"] || "").trim();
  const lastName = String(body.last_name || body["last-name"] || "").trim();

  if (!email || !email.includes("@")) {
    return { statusCode: 400, body: JSON.stringify({ error: "A valid email is required." }) };
  }

  // ---- persist the pending subscriber (idempotent by email) ----
  const store = subscribersStore();
  const createdAt = new Date().toISOString();
  const token = crypto.randomBytes(18).toString("base64url");
  const confirmUrl = `${siteUrl(event)}/api/newsletter-submit?confirm=${encodeURIComponent(token)}`;
  try {
    await store.setJSON(keyFor(email), {
      email,
      firstName,
      lastName,
      status: "pending",
      createdAt,
      confirmedAt: null,
    });
    await store.setJSON(`confirm:${token}`, { email, firstName, lastName, createdAt });
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: "Could not save your subscription. Please try again." }) };
  }

  // ---- confirmation email (TEST_MODE routes to one inbox) ----
  const TEST_MODE = /^(1|true|yes)$/i.test(String(process.env.TEST_MODE || ""));
  const TEST_EMAIL = process.env.TEST_EMAIL || "reece.j.rainer@gmail.com";
  const { from, replyTo } = mailConfig();
  const subscriberTo = TEST_MODE ? TEST_EMAIL : email;

  const result = await sendResendEmail({
    from,
    to: [subscriberTo],
    reply_to: replyTo,
    subject: "Confirm your e-mail.",
    html: confirmationHtml(firstName, confirmUrl),
    tags: [{ name: "source", value: "newsletter_confirm" }],
  }).catch((err) => ({ error: err.message }));

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, needsConfirmation: true, emailWarning: result && result.error, emailSkipped: result && result.skipped, testMode: TEST_MODE }),
  };
};
