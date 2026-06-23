// Background worker (up to 15 min): runs the Claude repo agent for one Dan/Reece
// message, stages the proposed changeset, and sends an approval request — Telegram
// inline buttons to the requester + an email with Approve/Discard links to BOTH
// Dan and Reece. Either of them approving commits it. The webhook
// (telegram-bot.js) returns 200 fast and fires this so Telegram doesn't time out.
const crypto = require("node:crypto");
const { runAgent, MODEL } = require("../lib/repo-agent");
const { lineDiff } = require("../lib/repo-commit");
const { changesetStore, threadStore } = require("../lib/blobs");
const { send, escapeHtml } = require("../lib/telegram");
const { sendResendEmail, mailConfig } = require("../lib/send");

const SITE = (process.env.URL || "https://danieltiwari.com").replace(/\/$/, "");
const SELF = `${SITE}/.netlify/functions/telegram-bot`;
const HISTORY_TURNS = 8;


// True when Dan's message is a done/publish signal (end of session).
function isDone(text) {
  const t = String(text || '').toLowerCase();
  return /(done|publish|ship it?|push it?|send it?|that'?s (it|all)|all done|finished|i'?m done|go live|looks good|send for (review|approval)|submit|that'll do)/.test(t);
}

// Merge new agent changes into an existing session array. Last write wins per
// path, but the original  is preserved so the full diff stays accurate.
function mergeChanges(session, incoming) {
  const map = new Map((session || []).map((c) => [c.path, { ...c }]));
  for (const c of incoming) {
    if (map.has(c.path)) map.get(c.path).after = c.after;
    else map.set(c.path, { ...c });
  }
  return [...map.values()];
}

async function loadSession(userId) {
  try { return (await sessionStore().get(String(userId), { type: 'json' })) || null; }
  catch { return null; }
}
async function saveSession(userId, data) {
  try { await sessionStore().setJSON(String(userId), data); } catch { /* best effort */ }
}
async function clearSession(userId) {
  try { await sessionStore().delete(String(userId)); } catch { /* best effort */ }
}

async function loadThread(userId) {
  try { return (await threadStore().get(String(userId), { type: "json" })) || []; }
  catch { return []; }
}
async function saveThread(userId, history) {
  try { await threadStore().setJSON(String(userId), history.slice(-HISTORY_TURNS * 2)); } catch { /* best effort */ }
}

// Friendly label for a prefixed path, e.g. "Homepage", "Welcome email", "Business plan".
function friendlyName(path) {
  const p = path.replace(/^web\//, "").replace(/^db\//, "");
  if (path.startsWith("web/")) {
    if (p === "index.html") return "Homepage";
    if (p.startsWith("content/emails/")) return `Funnel email (${p.split("/").pop()})`;
    if (p.endsWith(".html")) return `Page: ${p.replace(/\.html$/, "")}`;
    return `Website file: ${p}`;
  }
  if (p === "business_plan.md") return "Business plan";
  return `Coaching DB: ${p}`;
}

// One file's before/after as a coloured, email-safe diff table.
function emailDiffTable(change) {
  const rows = lineDiff(change.before, change.after, 120).split("\n").map((line) => {
    const add = line.startsWith("+ "), del = line.startsWith("- ");
    const text = escapeHtml(line.slice(2)) || "&nbsp;";
    const bg = add ? "#e6ffed" : del ? "#ffeef0" : "#fff";
    const col = add ? "#137333" : del ? "#b3261e" : "#444";
    const sign = add ? "+" : del ? "−" : " ";
    return `<tr><td style="width:14px;color:#bbb;font-family:monospace;font-size:13px;padding:1px 6px;background:${bg}">${sign}</td><td style="font-family:monospace;font-size:13px;padding:1px 8px;white-space:pre-wrap;color:${col};background:${bg}">${text}</td></tr>`;
  }).join("");
  return `<table style="border-collapse:collapse;width:100%;border:1px solid #eee;border-radius:6px;overflow:hidden">${rows}</table>`;
}

function approvalEmail({ summary, changes, approve, discard, requestedBy }) {
  const blocks = changes.map((c) => {
    const kind = c.before == null ? "Newly added" : c.after == null ? "Deleted" : "Edited";
    return `<p style="margin:22px 0 6px;font-size:15px"><b>${escapeHtml(friendlyName(c.path))}</b> <span style="color:#999;font-weight:normal">— ${kind} · <code style="font-size:12px">${escapeHtml(c.path)}</code></span></p>${emailDiffTable(c)}`;
  }).join("");
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#15140f;line-height:1.55;max-width:42rem">
    <h2 style="font-weight:600;font-size:19px;margin-bottom:4px">Approve this change?</h2>
    <p style="color:#666;margin-top:0">${escapeHtml(requestedBy)} asked the agent to make a change. Here's exactly what will change, in plain English and line-by-line:</p>
    <div style="background:#f6f8fa;border-left:3px solid #15140f;padding:12px 16px;border-radius:6px;font-size:15px">${escapeHtml(summary)}</div>
    <h3 style="font-size:14px;color:#444;margin:26px 0 0;text-transform:uppercase;letter-spacing:.05em">The exact changes</h3>
    ${blocks}
    <p style="margin:30px 0 6px">
      <a href="${approve}" style="background:#137333;color:#fff;padding:13px 26px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px">✓ Approve &amp; publish</a>
      &nbsp;&nbsp;&nbsp;<a href="${discard}" style="color:#888;font-size:14px">Discard</a>
    </p>
    <p style="color:#999;font-size:13px;margin-top:18px">Green = added, red = removed. Either Dan or Reece can approve. Website changes go live ~2 minutes after approval.</p>
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

  // Telegram: a friendly heads-up; the full before/after lives in the email.
  const n = result.changes.length;
  const what = n === 1 ? "1 thing" : `${n} things`;
  const tgText =
    `${escapeHtml(result.reply)}\n\n` +
    (mail && mail.error
      ? `⚠️ I couldn't send the approval email (${escapeHtml(mail.error)}), so nothing will go live yet. Want me to try again?`
      : `📧 I've emailed you the exact before/after (${what} changing). Tap Approve in that email and it's live in ~2 min. Nothing changes until you do 👍`);
  await send(chatId, tgText);

  return { statusCode: 200, body: "staged" };
};
