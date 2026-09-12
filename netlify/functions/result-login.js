// "Send me a code" / "here's my code" for viewing a finished assessment result.
//
// Step 1 (action=request): the visitor types the email they took the assessment
// with. If it matches the stored submission we email a 6-digit code. If it does
// NOT match we still answer exactly the same way — otherwise this endpoint tells
// a stranger which email addresses have taken the assessment.
// Step 2 (action=verify): correct code => a 30-day pass, set as a cookie AND
// returned so the page can hold it.
const { resultsStore, resultPagesStore, loginCodesStore } = require("../lib/blobs");
const { sendResendEmail, mailConfig } = require("../lib/send");
const {
  issueViewerPass, issueAuthorPass, newCode, codeRecord, checkCode,
  normEmail, passCookie, VIEWER_DAYS, AUTHOR_HOURS, CODE_TTL_MIN,
} = require("../lib/result-access");

const json = (statusCode, body, headers = {}) => ({
  statusCode,
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});

// Same words whether or not the email matched. Deliberate.
const SENT = { ok: true, sent: true, message: `If that email matches this assessment, a 6-digit code is on its way. It expires in ${CODE_TTL_MIN} minutes.` };

function codeEmail({ code, forAuthor }) {
  const why = forAuthor
    ? "to open your assessment results workspace"
    : "to open your assessment results";
  return `<div style="font-family:Georgia,serif;color:#15140f;line-height:1.6;max-width:30rem">
    <p style="margin:0 0 1rem">Here is your code ${why}:</p>
    <p style="font-family:monospace;font-size:2rem;letter-spacing:.35em;margin:0 0 1rem;color:#15140f">${code}</p>
    <p style="margin:0 0 1rem;font-size:.9rem;color:#6b6659">It works for the next ${CODE_TTL_MIN} minutes. If you did not ask for it, you can ignore this email.</p>
  </div>`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Bad request" }); }
  const { action, id, email, code } = body;
  const key = String(id || "").trim();
  if (!key) return json(400, { error: "Missing result id" });

  const codes = loginCodesStore();

  // ---------- author (Daniel) ----------
  // Same flow, but the code goes to his address and the pass lets him WRITE.
  const authorEmail = normEmail(process.env.DAN_NOTIFY_EMAIL || "email@danieltiwari.com");
  const wantsAuthor = key === "author";

  if (action === "request") {
    const given = normEmail(email);
    if (!given) return json(400, { error: "Enter your email address." });

    let target = null;
    if (wantsAuthor) {
      if (given === authorEmail) target = authorEmail;
    } else {
      const record = await resultsStore().get(key, { type: "json" }).catch(() => null);
      const stored = normEmail(record && record.answers && record.answers.email);
      if (stored && stored === given) target = stored;
    }

    // Anyone can ask for a code, so anyone could otherwise flood an inbox with
    // them. One code a minute per result. The reply is unchanged either way, so
    // this cannot be used to work out whether an address exists.
    const existing = await codes.get(key, { type: "json" }).catch(() => null);
    const tooSoon = existing && existing.issuedAt && Date.now() - existing.issuedAt < 60000;

    if (target && !tooSoon) {
      const code = newCode();
      await codes.setJSON(key, { ...codeRecord(code, key), issuedAt: Date.now() });
      const { from, replyTo } = mailConfig();
      await sendResendEmail({
        from,
        to: [target],
        reply_to: replyTo,
        subject: `${code} is your code`,
        html: codeEmail({ code, forAuthor: wantsAuthor }),
        tags: [{ name: "source", value: "result_login_code" }],
      }).catch(() => null);
    }
    return json(200, SENT);
  }

  if (action === "verify") {
    const record = await codes.get(key, { type: "json" }).catch(() => null);
    const verdict = checkCode(record, code, key);

    if (verdict !== "ok") {
      if (record && verdict === "wrong") {
        await codes.setJSON(key, { ...record, attempts: (record.attempts || 0) + 1 }).catch(() => null);
      }
      const message = {
        expired: "That code has expired. Ask for a new one.",
        locked: "Too many tries. Ask for a new code.",
        wrong: "That code is not right. Check the email and try again.",
      }[verdict];
      return json(401, { ok: false, error: message });
    }

    await codes.delete(key).catch(() => null);

    if (wantsAuthor) {
      const pass = issueAuthorPass();
      return json(200, { ok: true, pass, role: "author" },
        { "Set-Cookie": passCookie(pass, AUTHOR_HOURS / 24) });
    }

    // A viewer whose page Daniel has not published yet gets a pass anyway — the
    // result page then shows "not ready", which is the honest answer and stops
    // them having to re-do the code once he publishes.
    const page = await resultPagesStore().get(key, { type: "json" }).catch(() => null);
    const pass = issueViewerPass(key);
    return json(200, { ok: true, pass, role: "viewer", ready: Boolean(page && page.status === "published") },
      { "Set-Cookie": passCookie(pass, VIEWER_DAYS) });
  }

  return json(400, { error: "Unknown action" });
};
