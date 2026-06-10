// Telegram bot — lets Dan edit his nurture emails by message, with an
// email-approval gate before anything reaches the repo / live funnel.
//
// Flow: Dan messages "/subject a3 | New line" -> bot stages the change in Blobs
// and emails Dan a plain-English diff + an Approve link -> Dan clicks Approve ->
// the change is committed to main via the GitHub edit engine -> Netlify deploys.
//
// Setup (env on the Netlify site):
//   TELEGRAM_BOT_TOKEN     full BotFather token (NOT the 9-char placeholder)
//   TELEGRAM_WEBHOOK_SECRET shared secret; set the same value when registering the webhook
//   DAN_TELEGRAM_USER_ID   Dan's numeric Telegram id (comma-sep for >1). Until set, the bot
//                          replies with the sender's id and refuses edits (safe bootstrap).
//   GITHUB_RW_PAT          repo write token (used by github-edit)
//   RESEND_API_KEY, RESEND_FROM_EMAIL, DAN_NOTIFY_EMAIL  (already set) for the approval email
const crypto = require("node:crypto");
const { applyEdit, getEmail, branchDir } = require("../lib/github-edit");
const { pendingEditsStore } = require("../lib/blobs");
const { sendResendEmail, mailConfig } = require("../lib/send");
const emails = require("../lib/emails.generated.json");

const SITE = (process.env.URL || "https://danieltiwari.com").replace(/\/$/, "");
const SELF = `${SITE}/.netlify/functions/telegram-bot`;

function allowed(userId) {
  const list = String(process.env.DAN_TELEGRAM_USER_ID || "").split(",").map((s) => s.trim()).filter(Boolean);
  return { locked: list.length > 0, ok: list.includes(String(userId)) };
}

async function tg(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { skipped: "TELEGRAM_BOT_TOKEN missing" };
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  return res.json().catch(() => ({}));
}
const reply = (chatId, text) => tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true });

function listText() {
  const line = (e, id) => `<b>${id}</b> (day ${e.day}) — ${e.subject}`;
  const a = emails.branchA.map((e, i) => line(e, `a${i + 1}`)).join("\n");
  const b = emails.branchB.map((e, i) => line(e, `b${i + 1}`)).join("\n");
  return `<b>Branch A — diagnostic</b>\n${a}\n\n<b>Branch B — nurture</b>\n${b}`;
}

const HELP = [
  "I edit Dan's nurture emails. Commands:",
  "<code>/list</code> — all emails + ids",
  "<code>/show a3</code> — see one email",
  "<code>/subject a3 | New subject line</code> — change a subject",
  "<code>/body a3 | New body text (blank line between paragraphs)</code> — change a body",
  "",
  "Every change is emailed to you to approve before it goes live.",
].join("\n");

function escapeHtml(s) {
  return String(s == null ? "" : s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function stageEdit({ id, field, value, chatId }) {
  // read current value for the diff
  const cur = await getEmail(id);
  const before = field === "body" ? cur.body : cur.fm[field];
  const token = crypto.randomBytes(18).toString("base64url");
  await pendingEditsStore().setJSON(token, { id, field, value, before, path: cur.path, chatId, createdAt: new Date().toISOString() });

  const { from } = mailConfig();
  const to = process.env.DAN_NOTIFY_EMAIL || "email@danieltiwari.com";
  const approve = `${SELF}?approve=${token}`;
  const discard = `${SELF}?discard=${token}`;
  const html = `
    <div style="font-family:Georgia,serif;color:#15140f;line-height:1.6;max-width:34rem">
      <h2 style="font-weight:normal">Approve a change to email <b>${escapeHtml(id)}</b>?</h2>
      <p>You asked to change the <b>${escapeHtml(field)}</b> of <code>${escapeHtml(cur.path)}</code>.</p>
      <p style="color:#777"><b>Before:</b></p>
      <blockquote style="border-left:3px solid #ddd;padding-left:12px;white-space:pre-wrap">${escapeHtml(before)}</blockquote>
      <p style="color:#777"><b>After:</b></p>
      <blockquote style="border-left:3px solid #15140f;padding-left:12px;white-space:pre-wrap">${escapeHtml(value)}</blockquote>
      <p style="margin-top:24px">
        <a href="${approve}" style="background:#15140f;color:#fff;padding:12px 22px;text-decoration:none;border-radius:6px">Approve &amp; publish</a>
        &nbsp;&nbsp;<a href="${discard}" style="color:#777">Discard</a>
      </p>
      <p style="color:#999;font-size:13px">It goes live a couple of minutes after you approve. Affects new + in-flight leads who haven't received this email yet.</p>
    </div>`;
  const r = await sendResendEmail({ from, to: [to], subject: `Approve change to email ${id} (${field})`, html,
    tags: [{ name: "source", value: "bot_approval" }] }).catch((e) => ({ error: e.message }));
  await reply(chatId, r && r.error
    ? `Couldn't email the approval: ${escapeHtml(r.error)}`
    : `Staged. I've emailed <b>${escapeHtml(to)}</b> — approve there and it goes live.`);
}

async function handleCommand(text, chatId) {
  const t = text.trim();
  if (/^\/(start|help)/i.test(t)) return reply(chatId, HELP);
  if (/^\/list/i.test(t)) return reply(chatId, listText());

  const show = t.match(/^\/show\s+([ab]\d+)/i);
  if (show) {
    try {
      const e = await getEmail(show[1]);
      return reply(chatId, `<b>${escapeHtml(show[1])}</b> (day ${e.fm.day})\n<b>Subject:</b> ${escapeHtml(e.fm.subject)}\n<b>Preview:</b> ${escapeHtml(e.fm.preview)}\n\n${escapeHtml(e.body)}`);
    } catch (err) { return reply(chatId, `⚠️ ${escapeHtml(err.message)}`); }
  }

  const edit = t.match(/^\/(subject|preview|body)\s+([ab]\d+)\s*\|\s*([\s\S]+)$/i);
  if (edit) {
    const [, field, id, value] = edit;
    try { branchDir(id); } catch (err) { return reply(chatId, `⚠️ ${escapeHtml(err.message)}`); }
    try { await stageEdit({ id: id.toLowerCase(), field: field.toLowerCase(), value: value.trim(), chatId }); }
    catch (err) { await reply(chatId, `⚠️ ${escapeHtml(err.message)}`); }
    return;
  }
  return reply(chatId, "Didn't catch that. Send <code>/help</code> for the commands.");
}

exports.handler = async (event) => {
  // ---- approval / discard links (GET) ----
  const qs = event.queryStringParameters || {};
  if (qs.approve || qs.discard) {
    const token = qs.approve || qs.discard;
    const store = pendingEditsStore();
    const pending = await store.get(token, { type: "json" }).catch(() => null);
    if (!pending) return { statusCode: 200, headers: { "Content-Type": "text/html" }, body: page("This link has already been used or expired.") };
    if (qs.discard) {
      await store.delete(token);
      return { statusCode: 200, headers: { "Content-Type": "text/html" }, body: page("Change discarded. Nothing was published.") };
    }
    try {
      const r = await applyEdit(pending.id, pending.field, pending.value, { branch: "main", message: `Edit ${pending.id} ${pending.field} via Telegram (approved by Dan)` });
      await store.delete(token);
      if (pending.chatId) await reply(pending.chatId, `✅ Published <b>${escapeHtml(pending.id)}</b> ${escapeHtml(pending.field)}. Live in ~2 minutes.`);
      return { statusCode: 200, headers: { "Content-Type": "text/html" }, body: page(r.unchanged ? "No change — the text was already that." : "Approved and published. It will be live in a couple of minutes.") };
    } catch (err) {
      return { statusCode: 200, headers: { "Content-Type": "text/html" }, body: page(`Could not publish: ${escapeHtml(err.message)}`) };
    }
  }

  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  // ---- Telegram webhook (POST) ----
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && event.headers["x-telegram-bot-api-secret-token"] !== secret) {
    return { statusCode: 401, body: "bad secret" };
  }

  let update;
  try { update = JSON.parse(event.body || "{}"); } catch { return { statusCode: 200, body: "ok" }; }
  const msg = update.message || update.edited_message;
  const text = msg && msg.text;
  const chatId = msg && msg.chat && msg.chat.id;
  const userId = msg && msg.from && msg.from.id;
  if (!text || !chatId) return { statusCode: 200, body: "ok" };

  const gate = allowed(userId);
  if (!gate.ok) {
    await reply(chatId, gate.locked
      ? "Sorry, you're not authorised to edit Dan's funnel."
      : `Not yet authorised. Your Telegram id is <b>${escapeHtml(userId)}</b> — send it to Reece to switch this on.`);
    return { statusCode: 200, body: "ok" };
  }

  await handleCommand(text, chatId).catch(() => {});
  return { statusCode: 200, body: "ok" };
};

function page(msg) {
  return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:Georgia,serif;max-width:30rem;margin:18vh auto;padding:0 1.2rem;color:#15140f;line-height:1.6;text-align:center"><h1 style="font-weight:normal;font-size:1.4rem">Daniel Tiwari</h1><p>${msg}</p></div>`;
}
