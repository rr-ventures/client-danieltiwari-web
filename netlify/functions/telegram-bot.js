// Telegram webhook for @dant_agent_bot — "Claude Code over Telegram".
// Dan (or Reece) messages the bot in plain English; this returns 200 immediately
// and fires the background agent (telegram-agent-background.js), which proposes a
// repo change and asks for approval. This file ALSO handles approval — both the
// inline button taps (callback_query) and the email Approve/Discard links — and
// commits the staged changeset to main on approval (Netlify then deploys).
//
// Lock: only the numeric Telegram user ids in DAN_TELEGRAM_USER_ID (comma-sep)
// can do anything. Everyone else is refused. The bot can't be made un-messageable,
// so this allowlist IS the security boundary.
//
// Env: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, DAN_TELEGRAM_USER_ID,
//      OPENROUTER_API_KEY, GITHUB_RW_PAT, RESEND_API_KEY, RESEND_FROM_EMAIL,
//      DAN_NOTIFY_EMAIL, REECE_NOTIFY_EMAIL, BLOBS_SITE_ID, BLOBS_TOKEN.
const { commitChangeset } = require("../lib/repo-commit");
const { changesetStore } = require("../lib/blobs");
const { send, escapeHtml } = require("../lib/telegram");

const SITE = (process.env.URL || "https://danieltiwari.com").replace(/\/$/, "");

function allowed(userId) {
  const list = String(process.env.DAN_TELEGRAM_USER_ID || "").split(",").map((s) => s.trim()).filter(Boolean);
  return { locked: list.length > 0, ok: list.includes(String(userId)) };
}

const INTRO = [
  "I'm your site agent for danieltiwari.com. Tell me plainly what to change — the site or the email funnel — and I'll show you the exact change and email you a link to approve before anything goes live.",
  "",
  "For example:",
  "• <i>Make the welcome email warmer and shorter</i>",
  "• <i>Change my booking link everywhere to [new URL]</i>",
  "• <i>What does the day-3 email say right now?</i>",
].join("\n");

const page = (msg) =>
  `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:Georgia,serif;max-width:32rem;margin:16vh auto;padding:0 1.2rem;color:#15140f;line-height:1.6;text-align:center"><h1 style="font-weight:normal;font-size:1.4rem">Daniel Tiwari</h1><p>${msg}</p></div>`;

// Commit a staged changeset by token. Returns a short status string.
async function approveToken(token, who) {
  const store = changesetStore();
  const cs = await store.get(token, { type: "json" }).catch(() => null);
  if (!cs) return { ok: false, msg: "This change was already published, discarded, or expired." };
  const firstLine = String(cs.summary || "Telegram agent edit").split("\n")[0].slice(0, 120);
  const sha = await commitChangeset(cs.changes, `${firstLine}\n\nRequested by ${cs.requestedBy} via Telegram, approved by ${who}.`);
  await store.delete(token);
  if (cs.chatId) await send(cs.chatId, `✅ Published by <b>${escapeHtml(who)}</b>. Live in ~2 minutes.`).catch(() => {});
  return { ok: true, msg: "Approved and published. Live in a couple of minutes.", sha };
}
async function discardToken(token) {
  const store = changesetStore();
  const cs = await store.get(token, { type: "json" }).catch(() => null);
  if (cs) { await store.delete(token); if (cs.chatId) await send(cs.chatId, "✖ Change discarded. Nothing was published.").catch(() => {}); }
  return cs ? "Change discarded. Nothing was published." : "This change was already handled or expired.";
}

exports.handler = async (event) => {
  // ---- Email Approve/Discard links (GET) ----
  const qs = event.queryStringParameters || {};
  if (qs.approve || qs.discard) {
    try {
      if (qs.discard) return { statusCode: 200, headers: { "Content-Type": "text/html" }, body: page(await discardToken(qs.discard)) };
      const r = await approveToken(qs.approve, "email approval");
      return { statusCode: 200, headers: { "Content-Type": "text/html" }, body: page(r.msg) };
    } catch (err) {
      return { statusCode: 200, headers: { "Content-Type": "text/html" }, body: page(`Could not publish: ${escapeHtml(err.message)}`) };
    }
  }

  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && event.headers["x-telegram-bot-api-secret-token"] !== secret) {
    return { statusCode: 401, body: "bad secret" };
  }

  let update;
  try { update = JSON.parse(event.body || "{}"); } catch { return { statusCode: 200, body: "ok" }; }

  // ---- Messages ----
  // (Approval is email-only — there are no inline buttons / callback queries.)
  const msg = update.message || update.edited_message;
  const text = msg && msg.text;
  const chatId = msg && msg.chat && msg.chat.id;
  const from = (msg && msg.from) || {};
  if (!text || !chatId) return { statusCode: 200, body: "ok" };

  const gate = allowed(from.id);
  if (!gate.ok) {
    await send(chatId, gate.locked
      ? "Sorry, you're not authorised to edit Dan's site."
      : `Not yet authorised. Your Telegram id is <b>${escapeHtml(from.id)}</b> — send it to Reece to switch this on.`);
    return { statusCode: 200, body: "ok" };
  }

  if (/^\/(start|help)\b/i.test(text.trim())) {
    await send(chatId, INTRO);
    return { statusCode: 200, body: "ok" };
  }

  // Acknowledge instantly, then run the agent in the background (can take ~30-60s).
  await send(chatId, "🧠 On it — reading the site and working out the change…");
  const requestedBy = from.first_name || (String(from.id) === "1956924282" ? "Reece" : "Dan");
  try {
    await fetch(`${SITE}/.netlify/functions/telegram-agent-background`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, userId: from.id, text, requestedBy }),
    });
  } catch (err) {
    await send(chatId, `⚠️ Couldn't start: ${escapeHtml(err.message)}`);
  }
  return { statusCode: 200, body: "ok" };
};
