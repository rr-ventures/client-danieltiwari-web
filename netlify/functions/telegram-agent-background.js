// Background worker (up to 15 min): runs the Claude repo agent for one Dan/Reece
// message, stages the proposed changeset, and sends an approval request — Telegram
// inline buttons to the requester + an email with Approve/Discard links to BOTH
// Dan and Reece. Either of them approving commits it. The webhook
// (telegram-bot.js) returns 200 fast and fires this so Telegram doesn't time out.
const crypto = require("node:crypto");
const { runAgent, MODEL } = require("../lib/repo-agent");
const { describeChangeset } = require("../lib/repo-commit");
const { changesetStore, threadStore } = require("../lib/blobs");
const { send, escapeHtml } = require("../lib/telegram");
const { sendResendEmail, mailConfig } = require("../lib/send");

const SITE = (process.env.URL || "https://danieltiwari.com").replace(/\/$/, "");
const SELF = `${SITE}/.netlify/functions/telegram-bot`;
const HISTORY_TURNS = 8;

async function loadThread(userId) {
  try { return (await threadStore().get(String(userId), { type: "json" })) || []; }
  catch { return []; }
}
async function saveThread(userId, history) {
  try { await threadStore().setJSON(String(userId), history.slice(-HISTORY_TURNS * 2)); } catch { /* best effort */ }
}

function approvalEmail({ summary, changes, approve, discard, requestedBy }) {
  const files = changes.map((c) => `<li><code>${escapeHtml(c.path)}</code> — ${c.before == null ? "new file" : c.after == null ? "deleted" : "edited"}</li>`).join("");
  return `
  <div style="font-family:Georgia,serif;color:#15140f;line-height:1.6;max-width:36rem">
    <h2 style="font-weight:normal">Approve a change to danieltiwari.com?</h2>
    <p><b>${escapeHtml(requestedBy)}</b> asked the site agent to make this change:</p>
    <blockquote style="border-left:3px solid #15140f;padding-left:12px">${escapeHtml(summary)}</blockquote>
    <p style="color:#777">Files affected:</p>
    <ul>${files}</ul>
    <p style="margin-top:24px">
      <a href="${approve}" style="background:#15140f;color:#fff;padding:12px 22px;text-decoration:none;border-radius:6px">Approve &amp; publish</a>
      &nbsp;&nbsp;<a href="${discard}" style="color:#777">Discard</a>
    </p>
    <p style="color:#999;font-size:13px">Either Dan or Reece can approve. It goes live a couple of minutes after approval.</p>
  </div>`;
}

exports.handler = async (event) => {
  let job;
  try { job = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad job" }; }
  const { chatId, userId, text, requestedBy } = job;
  if (!chatId || !text) return { statusCode: 200, body: "noop" };

  const history = await loadThread(userId);

  let result;
  try {
    result = await runAgent({ text, history });
  } catch (err) {
    await send(chatId, `⚠️ I hit an error trying that: ${escapeHtml(err.message)}`);
    return { statusCode: 200, body: "error-reported" };
  }

  // Update conversation memory (compact text only).
  history.push({ role: "user", content: text });
  history.push({ role: "assistant", content: result.reply });
  await saveThread(userId, history);

  // No file changes => it was a question/answer or it declined. Just reply.
  if (!result.changes.length) {
    await send(chatId, escapeHtml(result.reply));
    return { statusCode: 200, body: "answered" };
  }

  // Stage the changeset for approval.
  const token = crypto.randomBytes(18).toString("base64url");
  await changesetStore().setJSON(token, {
    changes: result.changes,
    summary: result.reply,
    requestedBy: requestedBy || String(userId),
    chatId,
    createdAt: new Date().toISOString(),
  });

  const approve = `${SELF}?approve=${token}`;
  const discard = `${SELF}?discard=${token}`;

  // Telegram: summary + diff + inline approve/discard buttons.
  const diff = describeChangeset(result.changes);
  const tgText =
    `📝 <b>Proposed change</b>\n${escapeHtml(result.reply)}\n\n` +
    `<b>Diff:</b>\n<pre>${escapeHtml(diff)}</pre>\n\n` +
    `Approve to publish (you or Dan can approve). It goes live ~2 min after.`;
  await send(chatId, tgText, {
    reply_markup: { inline_keyboard: [[
      { text: "✅ Approve & publish", callback_data: `ok:${token}` },
      { text: "✖ Discard", callback_data: `no:${token}` },
    ]]},
  });

  // Email both Dan and Reece with the same approve/discard links.
  const { from } = mailConfig();
  const recipients = [
    process.env.DAN_NOTIFY_EMAIL || "email@danieltiwari.com",
    process.env.REECE_NOTIFY_EMAIL || "reece.j.rainer@gmail.com",
  ].filter(Boolean);
  const html = approvalEmail({ summary: result.reply, changes: result.changes, approve, discard, requestedBy: requestedBy || String(userId) });
  await sendResendEmail({
    from, to: recipients, subject: `Approve a change to danieltiwari.com (${result.changes.length} file${result.changes.length > 1 ? "s" : ""})`,
    html, tags: [{ name: "source", value: "agent_approval" }],
  }).catch(() => {});

  return { statusCode: 200, body: "staged" };
};
