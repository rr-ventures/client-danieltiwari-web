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
  const highFit = authenticity.stage >= 4 && buyer.stage >= 4 && rebel.score >= 4;

  return {
    focusAreas,
    authenticity,
    buyer,
    rebel,
    route: highFit ? "diagnostic" : "nurture",
    cta: highFit
      ? "The next step is a private diagnostic conversation."
      : "The next step is to sit with the pattern and keep following the thread.",
  };
}

function resultEmailHtml(name, result) {
  const focus = result.focusAreas.map((area) => `<li>${escapeHtml(area.label)}</li>`).join("");
  return `
    <div style="font-family: Georgia, serif; color: #15140f; line-height: 1.6;">
      <p>Hi ${escapeHtml(name || "there")},</p>
      <p>Your assessment snapshot is ready.</p>
      <h2 style="font-family: Georgia, serif;">${escapeHtml(result.authenticity.label)}</h2>
      <p>${escapeHtml(result.authenticity.summary)}</p>
      <p><strong>Your current focus areas:</strong></p>
      <ol>${focus}</ol>
      <p>${escapeHtml(result.cta)}</p>
      <p>If this surfaced something important, you can book a private introductory call here:<br>
      <a href="https://calendly.com/reece-localleader/30min">https://calendly.com/reece-localleader/30min</a></p>
      <p>Daniel Tiwari</p>
    </div>
  `;
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

async function sendResendEmail(payload) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { skipped: true, reason: "RESEND_API_KEY missing" };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || body.error?.message || `Resend failed with ${response.status}`);
  }
  return body;
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
  const from = process.env.RESEND_FROM_EMAIL || "Daniel Tiwari <onboarding@resend.dev>";
  const notifyTo = process.env.DAN_NOTIFY_EMAIL || process.env.NOTIFY_EMAIL || "email@danieltiwari.com";
  const replyTo = process.env.DAN_REPLY_TO_EMAIL || notifyTo;

  try {
    const leadEmail = sendResendEmail({
      from,
      to: [answers.email],
      reply_to: replyTo,
      subject: "Your assessment snapshot",
      html: resultEmailHtml(answers.name, result),
      tags: [{ name: "source", value: "assessment" }],
    });

    const notifyEmail = sendResendEmail({
      from,
      to: [notifyTo],
      reply_to: answers.email,
      subject: `New assessment lead: ${answers.name || answers.email}`,
      html: notifyEmailHtml(answers, result),
      tags: [{ name: "source", value: "assessment_notify" }],
    });

    const emailResults = await Promise.all([leadEmail, notifyEmail]);
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, result, emailResults }),
    };
  } catch (error) {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, result, emailWarning: error.message }),
    };
  }
};
