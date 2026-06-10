const crypto = require("node:crypto");
const { buildBranch } = require("../lib/sequence");
const { resultsStore, dripStore } = require("../lib/blobs");
const { sendResendEmail, mailConfig } = require("../lib/send");

function firstNameOf(answers) {
  const n = String(answers.first_name || answers.name || "").trim();
  return n ? n.split(/\s+/)[0] : "";
}

const AREAS = [
  ["career", "Career"],
  ["relationships", "Relationships"],
  ["friendships", "Friendships"],
  ["family", "Family"],
  ["health", "Health"],
  ["fitness", "Vitality / Fitness"],
  ["attractiveness", "Attractiveness"],
  ["money", "Money / Finances"],
  ["adventure", "Adventure / Fun"],
  ["spirituality", "Spirituality / Meaning"],
  ["lifestyle", "Lifestyle / Surroundings"],
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
// Authenticity Map with the SAME core logic the live quiz uses.
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
    const importance = numeric(answers[`importance_${key}`], 5);
    const urgency = numeric(answers[`urgency_${key}`], 5);
    const score = (11 - fulfillment) + importance + urgency;
    return { key, label, fulfillment, importance, urgency, score };
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
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
      ? "The next step is a private diagnostic conversation — a continuation of this assessment, not a sales call."
      : "You can keep moving on your own from here. If you'd like a clearer reflection from the outside, the door is open.",
  };
}

function notifyEmailHtml(answers, result) {
  const rows = Object.entries(answers)
    .filter(([key]) => !key.startsWith("fulfillment_") && !key.startsWith("importance_") && !key.startsWith("urgency_"))
    .map(([key, value]) => `<tr><td style="padding: 6px 10px; border-bottom: 1px solid #ddd;"><strong>${escapeHtml(key)}</strong></td><td style="padding: 6px 10px; border-bottom: 1px solid #ddd;">${escapeHtml(value)}</td></tr>`)
    .join("");
  const focus = result.focusAreas
    .map((area) => `<li>${escapeHtml(area.label)}: fulfilment ${area.fulfillment}/10, importance ${area.importance}/10, urgency ${area.urgency}/10</li>`)
    .join("");

  return `
    <div style="font-family: Georgia, serif; color: #15140f; line-height: 1.6;">
      <h2>New assessment lead: ${escapeHtml(answers.name || "Unnamed")}</h2>
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
  let storeWarning;
  try {
    await storeResult(id, answers);
  } catch (error) {
    storeWarning = `result store failed: ${error.message}`;
  }

  // ---- recipients (TEST_MODE overrides the lead recipient to one inbox) ----
  const TEST_MODE = /^(1|true|yes)$/i.test(String(process.env.TEST_MODE || ""));
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

  // ---- Model B: send ONLY the day-0 email now; record the lead so the daily
  // nurture-drip function can send each later email from the CURRENT repo copy.
  const sequence = buildBranch(result.route, mergeFields);
  const dayZero = sequence.find((e) => e.day === 0) || sequence[0];

  const dayZeroSend = sendResendEmail({
    from,
    to: [leadTo],
    reply_to: replyTo,
    subject: dayZero.subject,
    html: dayZero.html,
    tags: [{ name: "source", value: "assessment_sequence" }],
  }).catch((err) => ({ error: err.message, subject: dayZero.subject }));

  // persist drip progress (day 0 marked sent). The drip store holds the lead's
  // real email so subsequent emails reach them; in TEST_MODE we store TEST_EMAIL.
  let dripWarning;
  const writeDrip = (async () => {
    try {
      await dripStore().setJSON(id, {
        email: leadTo,
        branch: result.route,
        name: answers.name || "",
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
    to: [notifyTo],
    reply_to: TEST_MODE ? replyTo : answers.email,
    subject: `New assessment lead: ${answers.name || answers.email}`,
    html: `${notifyEmailHtml(answers, result)}<p style="font-family:Georgia,serif"><strong>Result page:</strong> <a href="${escapeHtml(resultUrl)}">${escapeHtml(resultUrl)}</a></p>`,
    tags: [{ name: "source", value: "assessment_notify" }],
  }).catch((err) => ({ error: err.message }));

  const [dayZeroResult, notifyResult] = await Promise.all([dayZeroSend, notifyEmail, writeDrip]);
  const emailResults = [dayZeroResult, notifyResult];
  const emailWarning = emailResults.find((r) => r && r.error)?.error;
  const emailSkipped = emailResults.every((r) => r && r.skipped);
  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true, id, resultUrl, result, storeWarning, dripWarning,
      testMode: TEST_MODE, branch: result.route, enrolled: sequence.length,
      emailWarning, emailSkipped,
    }),
  };
};
