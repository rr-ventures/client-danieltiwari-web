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

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function collectAnswers(form) {
  const formData = new FormData(form);
  return Object.fromEntries(formData.entries());
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
          <span>${type}</span>
          <input type="range" min="1" max="10" value="${type === "fulfillment" ? "5" : "7"}" name="${type}_${key}" aria-label="${label} ${type}" required>
          <output>${type === "fulfillment" ? "5" : "7"}</output>
        </label>
      `).join("")}
    </div>
  `).join("");

  mount.querySelectorAll('input[type="range"]').forEach((input) => {
    updateRangeOutput(input);
    input.addEventListener("input", () => updateRangeOutput(input));
  });
}

function renderResult(result, emailState = "pending") {
  const resultEl = document.getElementById("assessment-result");
  if (!resultEl) return;

  const focusList = result.focusAreas.map((area) => `
    <li>
      <strong>${area.label}</strong>
      <span>Low fulfilment, high importance, and high urgency make this one of the strongest signals in your result.</span>
    </li>
  `).join("");

  const emailCopy = {
    pending: "Sending your snapshot...",
    sent: "Your snapshot has been sent by email.",
    skipped: "Your result is ready here. Email delivery is not configured in this preview.",
    warning: "Your result is ready here. Email delivery could not be confirmed.",
  }[emailState] || "";

  resultEl.hidden = false;
  resultEl.innerHTML = `
    <div class="result-panel">
      <span class="eyebrow"><span class="dot"></span>Your snapshot</span>
      <h2>${result.authenticity.label}</h2>
      <p class="lede">${result.authenticity.summary}</p>
      <div class="result-grid">
        <div>
          <span class="label">Current focus</span>
          <ol class="result-list">${focusList}</ol>
        </div>
        <aside class="pull">
          <p class="quote">${result.cta}</p>
          <span class="quote-attr">${result.route === "diagnostic" ? "Private diagnostic recommended" : "Nurture path recommended"}</span>
        </aside>
      </div>
      <p class="form-note"><span class="dot"></span>${emailCopy}</p>
      <p>
        <a class="btn btn-primary" href="/apply.html">
          <span>Apply for intro call</span>
          <span class="arrow" aria-hidden="true">→</span>
        </a>
      </p>
    </div>
  `;
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

document.querySelectorAll('input[type="range"]').forEach((input) => {
  updateRangeOutput(input);
  input.addEventListener("input", () => updateRangeOutput(input));
});

const form = document.getElementById("assessment-form");
if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    submitAssessment(form, form.querySelector('button[type="submit"]'));
  });
}
