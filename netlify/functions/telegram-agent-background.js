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

  // Stream "what it's doing now" so the chat doesn't go silent for minutes.
  let lastLine = "";
  const onProgress = (line) => {
    if (line === lastLine) return; // skip repeats (e.g. reading the same file twice)
    lastLine = line;
    return send(chatId, line).catch(() => {});
  };

  let result;
  try {
    result = await runAgent({ text, history, onProgress });
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

  // Email BOTH Dan and Reece the approve/discard links — approval is email-only.
  const { from } = mailConfig();
  const recipients = [
    process.env.DAN_NOTIFY_EMAIL || "email@danieltiwari.com",
    process.env.REECE_NOTIFY_EMAIL || "reece.j.rainer@gmail.com",
  ].filter(Boolean);
  const html = approvalEmail({ summary: result.reply, changes: result.changes, approve, discard, requestedBy: requestedBy || String(userId) });
  const mail = await sendResendEmail({
    from, to: recipients, subject: `Approve a change to danieltiwari.com (${result.changes.length} file${result.changes.length > 1 ? "s" : ""})`,
    html, tags: [{ name: "source", value: "agent_approval" }],
  }).catch((e) => ({ error: e.message }));

  // Telegram: show exactly what it'll change (the diff) + tell them to approve by email.
  const diff = describeChangeset(result.changes);
  const where = recipients.join(" and ");
  const tgText =
    `📝 Here's the change I'll make:\n${escapeHtml(result.reply)}\n\n` +
    `<b>Diff</b> (${result.changes.length} file${result.changes.length > 1 ? "s" : ""}):\n<pre>${escapeHtml(diff)}</pre>\n\n` +
    (mail && mail.error
      ? `⚠️ I couldn't send the approval email: ${escapeHtml(mail.error)}. Nothing will publish until that's fixed.`
      : `📧 I've emailed the approve/discard link to <b>${escapeHtml(where)}</b>. Approve there and it goes live in ~2 min. Nothing publishes until someone approves.`);
  await send(chatId, tgText);

  return { statusCode: 200, body: "staged" };
};
