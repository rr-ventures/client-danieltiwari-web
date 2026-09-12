const crypto = require("node:crypto");
const { buildBranch } = require("../lib/sequence");
const { resultsStore, dripStore } = require("../lib/blobs");
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
async function storeResult(id, answers) {
  const store = resultsStore();
  await store.setJSON(id, {
    answers,
    createdAt: new Date().toISOString(),
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

function authenticityStage(answers) {
  const path = numeric(answers.path_signal, 3);
  const decision = numeric(answers.decision_signal, 1);
  const stage = Math.max(path, decision);

  if (stage <= 1) return { stage: 1, label: "Conditioned", summary: "Part of you still expects the current path to deliver." };
  if (stage === 2) return { stage: 2, label: "Draining", summary: "The old path is starting to cost more than it gives back." };
  if (stage === 3) return { stage: 3, label: "Questioning", summary: "You can feel that something is off, even if the whole pattern is not yet named." };
  if (stage === 4) return { stage: 4, label: "Breaking Point", summary: "The false path has been named. This is often where relief and discomfort arrive together." };
  if (stage === 5) return { stage: 5, label: "Returning", summary: "You have started backing what is true, even if the new direction is still forming." };
  return { stage: 6, label: "Building", summary: "You are already constructing life around what feels more authentic." };
}

function buyerStage(answers) {
  const attempts = numeric(answers.previous_attempts, 1);
  const openness = numeric(answers.help_openness, 1);
  const urgency = numeric(answers.change_timeline, 1);
  const investment = numeric(answers.investment_readiness, 1);
  const score = Math.round((attempts + openness + urgency + investment) / 4);

  if (score <= 1) return { stage: 1, label: "Problem aware", score };
  if (score === 2) return { stage: 2, label: "Learning", score };
  if (score === 3) return { stage: 3, label: "Trying to solve it yourself", score };
  if (score === 4) return { stage: 4, label: "Considering help", score };
  return { stage: 5, label: "Ready to invest", score };
}

function rebelFactor(answers) {
  const vision = numeric(answers.vision_scale, 3);
  const truth = numeric(answers.truth_directness, 3);
  const conformity = numeric(answers.conformity_signal, 3);
  const ambition = numeric(answers.potential_signal, 3);
  const score = Math.round((vision + truth + conformity + ambition) / 4);

  if (score <= 2) return { label: "Low", score };
  if (score === 3) return { label: "Moderate", score };
  if (score === 4) return { label: "Strong", score };
  return { label: "Very strong", score };
}

function calculateResult(answers) {
  const focusAreas = topFocusAreas(answers);
  const authenticity = authenticityStage(answers);
  const buyer = buyerStage(answers);
  const rebel = rebelFactor(answers);
  // Loosened gate: any 2 of 3 high signals routes to the diagnostic conversation.
  const signals = [authenticity.stage >= 4, buyer.stage >= 4, rebel.score >= 4].filter(Boolean).length;
  const highFit = signals >= 2;

  return {
    focusAreas,
    authenticity,
    buyer,
    rebel,
    route: highFit ? "diagnostic" : "nurture",
    cta: highFit
      ? "The next step is a private diagnostic conversation, a continuation of this assessment rather than a sales call."
      : "You can keep moving on your own from here. If you'd like a clearer reflection from the outside, the door is open.",
  };
}

function notifyEmailHtml(answers, result) {
  const rows = Object.entries(answers)
    .filter(([key]) => !key.startsWith("fulfillment_") && !key.startsWith("urgency_") && key !== "qa_summary")
    .map(([key, value]) => `<tr><td style="padding: 6px 10px; border-bottom: 1px solid #ddd;"><strong>${escapeHtml(key)}</strong></td><td style="padding: 6px 10px; border-bottom: 1px solid #ddd;">${escapeHtml(value)}</td></tr>`)
    .join("");
  const focus = result.focusAreas
    .map((area) => `<li>${escapeHtml(area.label)}: fulfilment ${area.fulfillment}/5</li>`)
    .join("");

  return `
    <div style="font-family: Georgia, serif; color: #15140f; line-height: 1.6;">
      <h2>Assessment answers: ${escapeHtml(fullNameOf(answers) || "Unnamed")}</h2>
      <p><strong>Email:</strong> ${escapeHtml(answers.email)}</p>
      <p><strong>Route:</strong> ${escapeHtml(result.route)}</p>
      <p><strong>Authenticity:</strong> ${escapeHtml(result.authenticity.label)} (${result.authenticity.stage})</p>
      <p><strong>Buyer stage:</strong> ${escapeHtml(result.buyer.label)} (${result.buyer.stage})</p>
      <p><strong>Rebel factor:</strong> ${escapeHtml(result.rebel.label)} (${result.rebel.score})</p>
      <p><strong>Top focus areas:</strong></p>
      <ol>${focus}</ol>
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
      const parentNum = g.subNumbered ? (n += 1) : null;
      const items = (g.rows || [])
        .map(([q, rawA], i) => {
          const num = parentNum !== null ? `${parentNum}.${i + 1}` : (n += 1);
          const a = humanizePreferNot(rawA);
          const answerHtml = Array.isArray(a)
            ? `<ul style="margin:4px 0 0;padding-left:20px">${a.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
            : `<span style="color:#8a857a">Answer:</span> ${escapeHtml(a)}`;
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

// The confirmation the person gets on submit: it arrived, here are the two things
// their answers already point at, and the rest is written by hand.
// Deliberately short, and deliberately not written from the outside — it reads as
// his own note, with the first person used once rather than in every sentence
// (Reece 2026-09-12). The teaser is the two merge fields the assessment is most
// confident about — never a full reading, which is his job and his voice.
function confirmationEmail(fields) {
  const name = String(fields.first_name || "").trim();
  const teaser = [
    fields.top_focus_area ? ["What your answers point at most", fields.top_focus_area] : null,
    fields.authenticity_stage ? ["Where you're sitting right now", fields.authenticity_stage] : null,
  ].filter(Boolean);

  const teaserHtml = teaser.length
    ? `<table style="border-collapse:collapse;margin:1.4rem 0;font-size:.95rem">${teaser
        .map(([label, value]) =>
          `<tr><td style="padding:6px 14px 6px 0;color:#8a857a;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td>
           <td style="padding:6px 0;color:#15140f"><strong>${escapeHtml(value)}</strong></td></tr>`)
        .join("")}</table>`
    : "";

  return `<div style="font-family:Georgia,serif;color:#15140f;line-height:1.7;max-width:32rem">
    <p style="margin:0 0 1rem">${name ? `${escapeHtml(name)}, thank you` : "Thank you"}. Your assessment is in.</p>
    <p style="margin:0 0 1rem">These get read properly. Nothing automatic hands you a verdict here, so what comes back is written rather than assembled. This is what your answers already point at:</p>
    ${teaserHtml}
    <p style="margin:0 0 1rem">The rest takes a little longer. I'll send it the moment it's ready, with a link and a code to open it.</p>
    <p style="margin:0 0 1rem">Daniel</p>
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
  const id = shortId();
  const resultUrl = `${siteBaseUrl(event)}/r/${id}`;
  const adminUrl = `${siteBaseUrl(event)}/results`;
  let storeWarning;
  try {
    await storeResult(id, answers);
  } catch (error) {
    storeWarning = `result store failed: ${error.message}`;
  }

  // ---- recipients (TEST_MODE overrides the lead recipient to one inbox) ----
  const TEST_MODE = /^(1|true|yes)$/i.test(String(process.env.TEST_MODE || ""));
  // NURTURE_PAUSED: set true in Netlify env to stop the day-0 email + drip
  // enrollment while the sequence copy is being rewritten. The assessment
  // result itself (result page + Daniel's internal notification) still fires.
  const NURTURE_PAUSED = /^(1|true|yes)$/i.test(String(process.env.NURTURE_PAUSED || ""));
  // Daniel wants ONLY the day-0 email going out right now (2026-09-11) — the
  // rest of the multi-day follow-up sequence hasn't had his voice pass yet.
  // Day-0 still sends normally; nobody gets enrolled in the later drip, so
  // no day-1-onward email can ever fire for them. Flip to false (or remove)
  // once he's ready to turn the rest of the sequence back on.
  const ONLY_DAY_ZERO_FOR_NOW = true;
  const TEST_EMAIL = process.env.TEST_EMAIL || "reece.j.rainer@gmail.com";
  const { from, replyTo, bookUrl } = mailConfig();
  const notifyTo = TEST_MODE ? TEST_EMAIL : (process.env.NOTIFY_TO || process.env.DAN_NOTIFY_EMAIL || "email@danieltiwari.com");
  const leadTo = TEST_MODE ? TEST_EMAIL : answers.email;

  // ---- merge fields carried through the whole sequence ----
  const mergeFields = {
    first_name: firstNameOf(answers),
    top_focus_area: result.focusAreas[0]?.label || "",
    authenticity_stage: result.authenticity.label,
    map_url: resultUrl,
    book_url: bookUrl,
  };

  // ---- What the person gets the moment they submit ----
  // Reece 2026-09-12: a thank-you PLUS a short teaser, not the full automatic
  // result. Daniel reads their answers himself and writes their real assessment;
  // this email's whole job is to confirm it arrived and say what happens next.
  // The result link is deliberately NOT in here: the page is empty until he
  // publishes, and a link to an empty page reads as a broken promise.
  const sequence = buildBranch(result.route, mergeFields);
  const dayZero = sequence.find((e) => e.day === 0) || sequence[0];

  const confirmSend = NURTURE_PAUSED
    ? Promise.resolve({ skipped: true, reason: "nurture paused" })
    : sendResendEmail({
        from,
        to: [leadTo],
        reply_to: replyTo,
        subject: "Your assessment is in",
        html: confirmationEmail(mergeFields),
        tags: [{ name: "source", value: "assessment_confirmation" }],
      }).catch((err) => ({ error: err.message, subject: "Your assessment is in" }));

  // persist drip progress (day 0 marked sent). The drip store holds the lead's
  // real email so subsequent emails reach them; in TEST_MODE we store TEST_EMAIL.
  // While paused (or while ONLY_DAY_ZERO_FOR_NOW), skip enrollment entirely so
  // nobody is queued up for a rush of catch-up sends once the sequence resumes.
  let dripWarning;
  const writeDrip = (NURTURE_PAUSED || ONLY_DAY_ZERO_FOR_NOW)
    ? Promise.resolve()
    : (async () => {
        try {
          await dripStore().setJSON(id, {
            email: leadTo,
            branch: result.route,
            name: fullNameOf(answers),
            mergeFields,
            startedAt: new Date().toISOString(),
            sentDays: [dayZero.day],
            done: sequence.length === 1,
          });
        } catch (error) {
          dripWarning = `drip store failed: ${error.message}`;
        }
      })();

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
        ["Stage", escapeHtml(mergeFields.authenticity_stage || "not given")],
      ],
      extraHtml: `<p style="font-family:Georgia,serif;margin-top:1rem"><strong>Write their assessment:</strong> <a href="${escapeHtml(adminUrl)}">${escapeHtml(adminUrl)}</a><br><span style="font-size:.85rem;color:#8a857a">They cannot see anything until you publish it. Their page: ${escapeHtml(resultUrl)}</span></p>
        ${qaSummaryHtml(answers.qa_summary)}
        <details style="margin-top:1.4rem"><summary style="cursor:pointer;color:#8a857a;font-size:.85rem">Raw data (all fields)</summary>${notifyEmailHtml(answers, result)}</details>`,
    }),
    tags: [{ name: "source", value: "assessment_notify" }],
  }).catch((err) => ({ error: err.message }));

  const [confirmResult, notifyResult] = await Promise.all([confirmSend, notifyEmail, writeDrip]);

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
  const emailResults = [confirmResult, notifyResult];
  const emailWarning = emailResults.find((r) => r && r.error)?.error;
  const emailSkipped = emailResults.every((r) => r && r.skipped);
  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true, id, resultUrl, result, storeWarning, dripWarning,
      testMode: TEST_MODE, branch: result.route,
      enrolled: (NURTURE_PAUSED || ONLY_DAY_ZERO_FOR_NOW) ? 0 : sequence.length,
      emailWarning, emailSkipped,
    }),
  };
};
