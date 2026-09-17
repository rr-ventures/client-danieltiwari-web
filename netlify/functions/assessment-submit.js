const crypto = require("node:crypto");
const { resultsStore } = require("../lib/blobs");
const { sendResendEmail, mailConfig, leadActionEmail } = require("../lib/send");

function firstNameOf(answers) {
  const n = String(answers.first_name || answers.name || "").trim();
  return n ? n.split(/\s+/)[0] : "";
}

function fullNameOf(answers) {
  const parts = [answers.first_name, answers.last_name].filter(Boolean).map((s) => String(s).trim()).filter(Boolean);
  return parts.length ? parts.join(" ") : String(answers.name || "").trim();
}

const AREAS = [
  ["career", "Career"],
  ["relationships", "Relationships"],
  ["friendships", "Friendships"],
  ["family", "Family"],
  ["health", "Health"],
  ["attractiveness", "Attractiveness"],
  ["money", "Money / Finances"],
  ["lifestyle", "Lifestyle"],
  ["environment", "Environment"],
  ["fun_adventure", "Fun & Adventure"],
];

// Short, URL-safe, unguessable id for the hosted result page.
function shortId() {
  return crypto.randomBytes(9).toString("base64url"); // 12 chars
}

function siteBaseUrl(event) {
  const fromEnv = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const host = event.headers["x-forwarded-host"] || event.headers.host;
  return host ? `https://${host}` : "https://danieltiwari.com";
}

// Persist the raw answers so the hosted result page can recompute the full
// Assessment result with the SAME core logic the live quiz uses.
// The id assessment-start handed this person when they typed their name and
// email, if it is safe to finish that record instead of opening a new one. Safe
// means: it looks like one of our ids, the record exists, it is still only a
// "started" row (never a finished submission or a written result), and it was
// opened by the same email address. Anything else falls back to a fresh id.
async function reusableStart(claimed, email) {
  const id = String(claimed || "").trim();
  if (!/^[A-Za-z0-9_-]{8,24}$/.test(id)) return null;
  try {
    const record = await resultsStore().get(id, { type: "json" });
    if (!record || record.started !== true) return null;
    if (record.result || record.draft || record.publishedAt) return null;
    const storedEmail = String(record.answers?.email || "").trim().toLowerCase();
    if (!storedEmail || storedEmail !== String(email || "").trim().toLowerCase()) return null;
    // Carry their original start time forward — this record is about to be
    // overwritten with the finished answers, and it's the only place that
    // start time lives.
    return { id, startedAt: record.startedAt || record.createdAt || null };
  } catch {
    return null;
  }
}

async function storeResult(id, answers, startedAt) {
  const store = resultsStore();
  const now = new Date().toISOString();
  await store.setJSON(id, {
    answers,
    // createdAt kept for older code/records that read it as "submitted at".
    createdAt: now,
    submittedAt: now,
    // null when we never saw them start (no assessment-start call reached us,
    // or the browser didn't carry the id forward) — honestly means "unknown",
    // not "instant".
    startedAt: startedAt || null,
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function topFocusAreas(answers) {
  return AREAS.map(([key, label]) => {
    const fulfillment = numeric(answers[`fulfillment_${key}`], 5);
    const urgent = !!answers[`urgency_${key}`];
    const score = (6 - fulfillment) * 2 + (urgent ? 8 : 0);
    return { key, label, fulfillment, score };
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
}

function calculateResult(answers) {
  const focusAreas = topFocusAreas(answers);
  return { focusAreas };
}

function notifyEmailHtml(answers) {
  const rows = Object.entries(answers)
    .filter(([key]) => !key.startsWith("fulfillment_") && !key.startsWith("urgency_") && key !== "qa_summary")
    .map(([key, value]) => `<tr><td style="padding: 6px 10px; border-bottom: 1px solid #ddd;"><strong>${escapeHtml(key)}</strong></td><td style="padding: 6px 10px; border-bottom: 1px solid #ddd;">${escapeHtml(value)}</td></tr>`)
    .join("");

  return `
    <div style="font-family: Georgia, serif; color: #15140f; line-height: 1.6;">
      <h2>Assessment answers: ${escapeHtml(fullNameOf(answers) || "Unnamed")}</h2>
      <p><strong>Email:</strong> ${escapeHtml(answers.email)}</p>
      <h3>Answers</h3>
      <table style="border-collapse: collapse; width: 100%;">${rows}</table>
    </div>
  `;
}

// The browser stores a skipped question as the raw sentinel "prefer_not_to_answer"
// (in a standalone field, or embedded inside a composed string like a hidden-values
// chain) — swap it for readable text before it reaches Daniel's inbox. Substring
// replace on purpose so an embedded occurrence gets caught too, not just an exact match.
function humanizePreferNot(val) {
  if (Array.isArray(val)) return val.map(humanizePreferNot);
  return typeof val === "string" ? val.replaceAll("prefer_not_to_answer", "(prefer not to answer)") : val;
}

// Dead-simple, human-readable "Question / Answer" list. Every question is numbered,
// shown in full, with the person's answer clearly labelled right beneath it. `qa` is
// the answers.qa_summary array the browser sends; empty/absent falls back to raw.
function qaSummaryHtml(qa) {
  if (!Array.isArray(qa) || !qa.length) return "";
  let n = 0;
  const blocks = qa
    .map((g) => {
      const rows = g.rows || [];
      // firstRowIsParent: the "how are you contributing" question (row 0) keeps
      // its own number, and the "why does that matter" follow-up it produced
      // per item (row 1+) numbers as N.1, N.2 under it instead of getting its
      // own top-level numbers — they read as one question, not two unrelated
      // ones (Daniel, 2026-09-17).
      const useParentChild = g.firstRowIsParent && rows.length > 1;
      const parentNum = (g.subNumbered || useParentChild) ? (n += 1) : null;
      const items = rows
        .map(([q, rawA], i) => {
          const num = g.subNumbered ? `${parentNum}.${i + 1}`
            : useParentChild ? (i === 0 ? String(parentNum) : `${parentNum}.${i}`)
            : (n += 1);
          const a = humanizePreferNot(rawA);
          const answerHtml = Array.isArray(a)
            ? `<ul style="margin:4px 0 0;padding-left:20px">${a.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
            : escapeHtml(a);
          return `<div style="margin:0 0 20px;padding:0 0 18px;border-bottom:1px solid #eee">
              <div style="font-size:16px;font-weight:700;color:#15140f;line-height:1.4">${num}. ${escapeHtml(q)}</div>
              <div style="font-size:16px;color:#0E4182;margin-top:7px">${answerHtml}</div>
            </div>`;
        })
        .join("");
      const heading = g.title
        ? `<div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#8a857a;margin:26px 0 12px">${escapeHtml(g.title)}</div>`
        : "";
      return heading + items;
    })
    .join("");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin-top:1.4rem">
      <div style="font-size:18px;font-weight:700;color:#15140f;margin-bottom:6px">Every question &amp; their answer</div>
      ${blocks}
    </div>`;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" } };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let answers;
  try {
    answers = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  if (!answers.email || !String(answers.email).includes("@")) {
    return { statusCode: 400, body: JSON.stringify({ error: "A valid email is required" }) };
  }

  const result = calculateResult(answers);

  // Persist the result and mint its shareable link (the email carries this).
  //
  // If this person was already written down when they started, finish THAT
  // record rather than opening a second one. Without this they show up twice
  // in Daniel's workspace, once as a real submission and once as a ghost still
  // marked "didn't finish" (found live 2026-09-13). The claimed id is only
  // honoured when the stored record is genuinely an unfinished start for the
  // same email, so nobody can overwrite someone else's submission with it.
  const reused = await reusableStart(answers.startId, answers.email);
  const id = reused?.id || shortId();
  delete answers.startId;
  const resultUrl = `${siteBaseUrl(event)}/r/${id}`;
  const adminUrl = `${siteBaseUrl(event)}/results`;
  let storeWarning;
  try {
    await storeResult(id, answers, reused?.startedAt || null);
  } catch (error) {
    storeWarning = `result store failed: ${error.message}`;
  }

  // ---- recipients (TEST_MODE overrides the lead recipient to one inbox) ----
  const TEST_MODE = /^(1|true|yes)$/i.test(String(process.env.TEST_MODE || ""));
  const TEST_EMAIL = process.env.TEST_EMAIL || "reece.j.rainer@gmail.com";
  const { from, replyTo } = mailConfig();
  const notifyTo = TEST_MODE ? TEST_EMAIL : (process.env.NOTIFY_TO || process.env.DAN_NOTIFY_EMAIL || "email@danieltiwari.com");

  // ---- merge fields used in Daniel's own notification below ----
  const mergeFields = {
    first_name: firstNameOf(answers),
    top_focus_area: result.focusAreas[0]?.label || "",
  };

  // ---- What the person gets the moment they submit ----
  // Daniel's call (2026-09-13): nothing. No confirmation, no teaser — the person
  // hears from him for the first time when he actually publishes their result.
  // Only his own internal notification below fires on submit.
  //
  // The automatic follow-up sequence is off entirely (Daniel, 2026-09-17) —
  // content/emails/* was cleared out and nurture-drip.js is disabled while he
  // rebuilds it from scratch. The only email a lead gets right now is the
  // "your results are ready" email result-admin.js sends when Daniel publishes.

  const notifyEmail = sendResendEmail({
    from,
    to: String(notifyTo).split(",").map((s) => s.trim()).filter(Boolean),
    reply_to: TEST_MODE ? replyTo : answers.email,
    subject: `New assessment submission: ${fullNameOf(answers) || answers.email}`,
    html: leadActionEmail({
      kind: "Assessment submission",
      rows: [
        ["Name", escapeHtml(fullNameOf(answers) || "(not given)")],
        ["Email", escapeHtml(answers.email)],
        ["Top focus", escapeHtml(mergeFields.top_focus_area || "not given")],
      ],
      extraHtml: `<p style="font-family:Georgia,serif;margin-top:1rem"><strong>Write their assessment:</strong> <a href="${escapeHtml(adminUrl)}">${escapeHtml(adminUrl)}</a><br><span style="font-size:.85rem;color:#8a857a">They cannot see anything until you publish it. Their page: ${escapeHtml(resultUrl)}</span></p>
        ${qaSummaryHtml(answers.qa_summary)}
        <details style="margin-top:1.4rem"><summary style="cursor:pointer;color:#8a857a;font-size:.85rem">Raw data (all fields)</summary>${notifyEmailHtml(answers)}</details>`,
    }),
    tags: [{ name: "source", value: "assessment_notify" }],
  }).catch((err) => ({ error: err.message }));

  const notifyResult = await notifyEmail;

  // If Daniel's copy of the submission failed to send, the whole point of the
  // form has silently died: the answers are stored and nobody knows they arrived.
  // So record it on the submission (his workspace shows it) and tell Reece the id
  // ONLY. Never their answers or their address: those are the lead's private
  // information and were never Reece's to see (Daniel, 2026-09-12).
  if (notifyResult && notifyResult.error) {
    try {
      const store = resultsStore();
      const rec = await store.get(id, { type: "json" });
      if (rec) await store.setJSON(id, { ...rec, notifyFailed: notifyResult.error, notifyFailedAt: new Date().toISOString() });
    } catch (_e) { /* the alert below still goes */ }

    const alertTo = process.env.REECE_NOTIFY_EMAIL;
    if (alertTo) {
      await sendResendEmail({
        from,
        to: [alertTo],
        subject: "Assessment notification failed to send",
        html: `<div style="font-family:Georgia,serif;line-height:1.6">
          <p>A submission came in on danieltiwari.com and the email telling Daniel about it did not send.</p>
          <p>The answers are stored safely. Submission id: <code>${escapeHtml(id)}</code></p>
          <p>Reason given: ${escapeHtml(notifyResult.error)}</p>
          <p style="color:#8a857a;font-size:.85rem">No personal details are included here on purpose.</p>
        </div>`,
        tags: [{ name: "source", value: "notify_failure_alert" }],
      }).catch(() => null);
    }
  }
  const emailWarning = notifyResult && notifyResult.error;
  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true, id, resultUrl, result, storeWarning,
      testMode: TEST_MODE, emailWarning,
    }),
  };
};
