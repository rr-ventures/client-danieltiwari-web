const AREAS = [
  ["career", "Career"],
  ["relationships", "Relationships"],
  ["friendships", "Friendships"],
  ["family", "Family"],
  ["health", "Health"],
  ["fitness", "Vitality"],
  ["attractiveness", "Attractiveness"],
  ["money", "Money"],
  ["adventure", "Adventure"],
  ["spirituality", "Meaning"],
  ["lifestyle", "Lifestyle"],
];

const CALENDLY = "https://calendly.com/reece-localleader/30min";

const AUTH_INSIGHT = {
  1: { label: "Conditioned", summary: "Part of you still expects the current path to deliver.",
       means: "You're still largely inside the story you were handed — which is the most common place to begin. The work ahead isn't fixing you; it's noticing where that story quietly stops fitting." },
  2: { label: "Draining", summary: "The old path is starting to cost more than it gives back.",
       means: "The fatigue isn't weakness — it's information. Something you've been carrying is heavier than it's worth, even if you can't yet name what it is." },
  3: { label: "Questioning", summary: "You can feel something is off, even if the whole pattern isn't named yet.",
       means: "You're at the threshold most people never cross: admitting the doubt. The next move isn't a bigger push — it's getting honest about what, specifically, isn't yours." },
  4: { label: "Breaking Point", summary: "The false path has been named. Relief and discomfort often arrive together here.",
       means: "You've said the quiet thing out loud to yourself. It's uncomfortable, and it's also the real beginning — most lasting change starts at exactly this point." },
  5: { label: "Returning", summary: "You've started backing what is true, even if the direction is still forming.",
       means: "You've made the decision; now it's about building the structure that holds it. This is where good guidance compounds the fastest." },
  6: { label: "Building", summary: "You're constructing a life around what feels more authentic.",
       means: "You're past the hardest part. The work now is refinement and momentum — making sure the life you're building matches the force of what's actually in you." },
};

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function collectAnswers(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function wheelData(answers) {
  return AREAS.map(([key, label]) => ({
    key, label,
    fulfillment: numeric(answers[`fulfillment_${key}`], 5),
    importance: numeric(answers[`importance_${key}`], 5),
    urgency: numeric(answers[`urgency_${key}`], 5),
  }));
}

function topFocusAreas(wheel) {
  return wheel
    .map((a) => ({ ...a, gap: a.importance - a.fulfillment, score: (11 - a.fulfillment) + a.importance + a.urgency }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function authenticityStage(answers) {
  const stage = Math.max(numeric(answers.path_signal, 3), numeric(answers.decision_signal, 1));
  return { stage: Math.min(stage, 6), ...(AUTH_INSIGHT[Math.min(stage, 6)] || AUTH_INSIGHT[3]) };
}

function buyerStage(answers) {
  const score = Math.round((numeric(answers.previous_attempts, 1) + numeric(answers.help_openness, 1)
    + numeric(answers.change_timeline, 1) + numeric(answers.investment_readiness, 1)) / 4);
  const labels = { 1: "Problem aware", 2: "Learning", 3: "Trying to solve it yourself", 4: "Considering help", 5: "Ready to invest" };
  return { stage: Math.min(Math.max(score, 1), 5), label: labels[Math.min(Math.max(score, 1), 5)], score };
}

function rebelFactor(answers) {
  const score = Math.round((numeric(answers.vision_scale, 3) + numeric(answers.truth_directness, 3)
    + numeric(answers.conformity_signal, 3) + numeric(answers.potential_signal, 3)) / 4);
  const label = score <= 2 ? "Low" : score === 3 ? "Moderate" : score === 4 ? "Strong" : "Very strong";
  return { label, score };
}

function fulfilmentScore(wheel) {
  const avg = wheel.reduce((s, a) => s + a.fulfillment, 0) / wheel.length; // 1..10
  const pct = Math.round(avg * 10);
  const tier = pct < 35 ? "Quietly depleted" : pct < 55 ? "Holding it together"
    : pct < 70 ? "Capable but unfulfilled" : pct < 85 ? "Coming into alignment" : "Largely aligned";
  return { pct, tier };
}

function focusLine(area) {
  if (area.gap >= 4 && area.urgency >= 7) return "The widest, most urgent gap in your wheel — it matters deeply to you and currently gives back the least.";
  if (area.gap >= 4) return "One of the widest gaps between how much this matters to you and how fulfilled it feels right now.";
  if (area.urgency >= 8) return "Not your lowest score, but the one you flagged as most urgent to address.";
  return "A meaningful gap between its importance to you and where it currently sits.";
}

function calculateResult(answers) {
  const wheel = wheelData(answers);
  const focusAreas = topFocusAreas(wheel);
  const authenticity = authenticityStage(answers);
  const buyer = buyerStage(answers);
  const rebel = rebelFactor(answers);
  const score = fulfilmentScore(wheel);

  // Loosened gate: any 2 of 3 high signals routes to the diagnostic conversation.
  const signals = [authenticity.stage >= 4, buyer.stage >= 4, rebel.score >= 4].filter(Boolean).length;
  const highFit = signals >= 2;

  return {
    wheel, focusAreas, authenticity, buyer, rebel, score,
    route: highFit ? "diagnostic" : "nurture",
  };
}

/* ---------- Wheel of Life radar (inline SVG) ---------- */
function renderWheel(wheel) {
  const size = 320, c = size / 2, R = 120, n = wheel.length;
  const ang = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i, r) => [c + Math.cos(ang(i)) * r, c + Math.sin(ang(i)) * r];

  let rings = "";
  [0.25, 0.5, 0.75, 1].forEach((f) => {
    const d = wheel.map((_, i) => pt(i, R * f).map((v) => v.toFixed(1)).join(",")).join(" ");
    rings += `<polygon points="${d}" fill="none" stroke="var(--hair)" stroke-width="1"/>`;
  });
  let axes = "", labels = "";
  wheel.forEach((a, i) => {
    const [x, y] = pt(i, R);
    axes += `<line x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--hair)" stroke-width="1"/>`;
    const [lx, ly] = pt(i, R + 22);
    const anchor = Math.abs(lx - c) < 8 ? "middle" : lx < c ? "end" : "start";
    labels += `<text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" text-anchor="${anchor}" font-size="10" fill="var(--muted)" font-family="Alegreya SC, serif" letter-spacing="0.04em">${a.label}</text>`;
  });
  const poly = wheel.map((a, i) => pt(i, R * (a.fulfillment / 10)).map((v) => v.toFixed(1)).join(",")).join(" ");
  const dots = wheel.map((a, i) => { const [x, y] = pt(i, R * (a.fulfillment / 10)); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="var(--ink)"/>`; }).join("");

  return `<svg viewBox="-72 -4 ${size + 144} ${size + 8}" class="wheel-svg" role="img" aria-label="Your Wheel of Life">
    ${rings}${axes}
    <polygon points="${poly}" fill="rgba(28,26,20,.12)" stroke="var(--ink)" stroke-width="1.5"/>
    ${dots}${labels}
  </svg>`;
}

function renderResult(result, emailState = "pending") {
  const el = document.getElementById("assessment-result");
  if (!el) return;
  const a = result.authenticity;

  const focusList = result.focusAreas.map((f) => `
    <li>
      <strong>${f.label}</strong>
      <span class="nums">fulfilment ${f.fulfillment}/10 · importance ${f.importance}/10 · urgency ${f.urgency}/10</span>
      <span>${focusLine(f)}</span>
    </li>`).join("");

  const emailCopy = {
    pending: "Sending your full snapshot…",
    sent: "A copy of your snapshot is on its way to your inbox.",
    skipped: "Your result is ready here. (Email delivery isn't configured in this preview.)",
    warning: "Your result is ready here. We couldn't confirm the email — check back shortly.",
  }[emailState] || "";

  const nextStep = result.route === "diagnostic"
    ? `<p>Your answers suggest you're at a point where an outside perspective tends to help most. The next step is a private diagnostic conversation — a continuation of this assessment, not a sales call. In 30 minutes we'd look at your widest gap (${result.focusAreas[0]?.label}), the pattern underneath it, and whether working together makes sense — or whether you're better placed to do this on your own right now.</p>`
    : `<p>You can absolutely keep moving on your own from here — start with your most urgent area (${result.focusAreas[0]?.label}) and the one honest change it's asking for. If at some point you'd like a clearer reflection from the outside, the door is open. No pressure, no pitch.</p>`;

  el.hidden = false;
  el.innerHTML = `
    <div class="result-panel">
      <span class="eyebrow"><span class="dot"></span>Your snapshot</span>
      <h2>${a.label}</h2>
      <p class="lede">${a.summary}</p>

      <div class="result-score">
        <div class="score-num">${result.score.pct}<span>/100</span></div>
        <div class="score-meta"><strong>${result.score.tier}</strong><span>Overall life fulfilment, across the eleven areas you rated.</span></div>
      </div>

      <div class="result-block">
        <span class="label">Your Wheel of Life</span>
        <div class="wheel-wrap">${renderWheel(result.wheel)}</div>
      </div>

      <div class="result-block">
        <span class="label">Where life is asking for attention</span>
        <ol class="result-list">${focusList}</ol>
      </div>

      <div class="result-block">
        <span class="label">What this means for you</span>
        <p>${a.means}</p>
      </div>

      <div class="result-block next">
        <span class="label">Your next step</span>
        ${nextStep}
        ${result.route === "diagnostic"
          ? `<a class="btn" href="${CALENDLY}"><span>Book your private conversation</span><span class="arrow" aria-hidden="true">→</span></a>`
          : `<a class="btn secondary-btn" href="${CALENDLY}"><span>Book a conversation when you're ready</span><span class="arrow" aria-hidden="true">→</span></a>`}
      </div>

      <p class="form-note"><span class="dot"></span>${emailCopy}</p>
    </div>`;
}

function updateRangeOutput(input) {
  const output = input.closest(".scale-control")?.querySelector("output");
  if (output) output.value = input.value;
}

function renderFocusRows() {
  const mount = document.getElementById("wheel-rows");
  if (!mount) return;
  mount.innerHTML = AREAS.map(([key, label], index) => `
    <div class="scale-row">
      <div class="scale-area">
        <span class="num">${String(index + 1).padStart(2, "0")}</span>
        <strong>${label}</strong>
      </div>
      ${["fulfillment", "importance", "urgency"].map((type) => `
        <label class="scale-control">
          <span>${type === "fulfillment" ? "fulfilment" : type}</span>
          <input type="range" min="1" max="10" value="${type === "fulfillment" ? "5" : "7"}" name="${type}_${key}" aria-label="${label} ${type}" required>
          <output>${type === "fulfillment" ? "5" : "7"}</output>
        </label>`).join("")}
    </div>`).join("");
  mount.querySelectorAll('input[type="range"]').forEach((input) => {
    updateRangeOutput(input);
    input.addEventListener("input", () => updateRangeOutput(input));
  });
}

async function submitAssessment(form, submitButton) {
  const answers = collectAnswers(form);
  const result = calculateResult(answers);
  renderResult(result, "pending");
  document.getElementById("assessment-result")?.scrollIntoView({ behavior: "smooth", block: "start" });

  submitButton.disabled = true;
  submitButton.classList.add("is-loading");
  try {
    const response = await fetch("/api/assessment-submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(answers),
    });
    const data = await response.json().catch(() => ({}));
    if (data.emailWarning) renderResult(result, "warning");
    else if (data.emailResults?.some((item) => item?.skipped)) renderResult(result, "skipped");
    else if (response.ok) renderResult(result, "sent");
    else renderResult(result, "warning");
  } catch {
    renderResult(result, "warning");
  } finally {
    submitButton.disabled = false;
    submitButton.classList.remove("is-loading");
  }
}

renderFocusRows();
const form = document.getElementById("assessment-form");
if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    submitAssessment(form, form.querySelector('button[type="submit"]'));
  });
}
