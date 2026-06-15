/* ============================================================
   Daniel Tiwari — assessment form behaviour
   Scoring + result render live in assessment-core.js (shared with
   the hosted result page). This file owns the live quiz: step
   initialization, one-at-a-time fulfillment, and submission.
   ============================================================ */

function collectAnswers(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function updateRangeOutput(input) {
  const output = input.closest(".scale-control")?.querySelector("output");
  if (output) output.value = input.value;
}

function getWheelValues() {
  return AREAS.map(([key, label]) => ({
    key, label,
    fulfillment: parseInt(document.querySelector(`input[name="fulfillment_${key}"]`)?.value || 5),
    importance: parseInt(document.querySelector(`input[name="importance_${key}"]`)?.value || 7),
    urgency: parseInt(document.querySelector(`input[name="urgency_${key}"]`)?.value || 7),
  }));
}

function buildScaleRows(containerId, type, defaultVal) {
  document.getElementById(containerId).innerHTML = AREAS.map(([key, label], i) => `
    <div class="scale-row">
      <div class="scale-area">
        <span class="num">${String(i + 1).padStart(2, "0")}</span>
        <strong>${label}</strong>
      </div>
      <label class="scale-control">
        <span>${type}</span>
        <input type="range" min="1" max="10" value="${defaultVal}" name="${type}_${key}" aria-label="${label} ${type}">
        <output>${defaultVal}</output>
      </label>
    </div>
  `).join("");
  document.getElementById(containerId).querySelectorAll('input[type="range"]').forEach((input) => {
    input.addEventListener("input", () => updateRangeOutput(input));
  });
}

/* ---- Step 0: Fulfillment (one at a time) ---- */
function renderFulfillmentCard(index) {
  const [key, label] = AREAS[index];
  const isLast = index === AREAS.length - 1;
  const card = document.getElementById("fulfillment-card");
  card.innerHTML = `
    <p class="area-counter sc">${index + 1} / ${AREAS.length}</p>
    <h3 class="fulfillment-area-label">${label}</h3>
    <div class="number-scale">
      ${[1,2,3,4,5,6,7,8,9,10].map(n => `<button type="button" class="number-btn" data-val="${n}">${n}</button>`).join("")}
    </div>
    <div class="scale-legend-card"><span>not fulfilled</span><span>fully fulfilled</span></div>
    <button type="button" class="btn btn-primary fulfillment-next-btn" disabled>${isLast ? "Continue →" : "Next →"}</button>
  `;
  let selected = null;
  card.querySelectorAll(".number-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      card.querySelectorAll(".number-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      selected = btn.dataset.val;
      card.querySelector(".fulfillment-next-btn").disabled = false;
    });
  });
  card.querySelector(".fulfillment-next-btn").addEventListener("click", () => {
    if (!selected) return;
    const hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.name = `fulfillment_${key}`;
    hidden.value = selected;
    document.getElementById("fulfillment-inputs").appendChild(hidden);
    if (!isLast) {
      renderFulfillmentCard(index + 1);
    } else {
      window.advanceMainStep();
    }
  });
}

function initFulfillmentStep() {
  document.getElementById("fulfillment-inputs").innerHTML = "";
  document.getElementById("fulfillment-intro").hidden = false;
  document.getElementById("fulfillment-areas").hidden = true;
  document.getElementById("btn-get-started").addEventListener("click", () => {
    document.getElementById("fulfillment-intro").hidden = true;
    document.getElementById("fulfillment-areas").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
    renderFulfillmentCard(0);
  }, { once: true });
}

/* ---- Step 1: Importance ---- */
function initImportanceStep() {
  document.getElementById("importance-pie").innerHTML = renderPieChart(getWheelValues());
  buildScaleRows("importance-rows", "importance", 7);
}

/* ---- Step 2: Urgency ---- */
function initUrgencyStep() {
  document.getElementById("urgency-pie").innerHTML = renderPieChart(getWheelValues());
  buildScaleRows("urgency-rows", "urgency", 7);
}

/* ---- Step 3: Focus selection ---- */
function initFocusStep() {
  const wheel = getWheelValues();
  const ranked = rankAllAreas(wheel);
  document.getElementById("focus-pie").innerHTML = renderPieChart(wheel);
  document.getElementById("ranked-areas").innerHTML = ranked.map((area, i) => `
    <label class="focus-option">
      <input type="checkbox" name="focus_area" value="${area.key}">
      <span class="focus-rank sc">${String(i + 1).padStart(2, "0")}</span>
      <span class="focus-label">${area.label}</span>
      <span class="focus-scores">${area.fulfillment}/10 fulfilment</span>
    </label>
  `).join("");
  document.getElementById("ranked-areas").querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", () => {
      const checked = document.querySelectorAll('input[name="focus_area"]:checked');
      if (checked.length > 3) cb.checked = false;
    });
  });
}

/* ---- Step change hook ---- */
window.onStepChange = function(step) {
  if (step === 0) initFulfillmentStep();
  if (step === 1) initImportanceStep();
  if (step === 2) initUrgencyStep();
  if (step === 3) initFocusStep();
};

// Initialize step 0 — showStep(0) ran before this script loaded
initFulfillmentStep();

/* ---- Submission ---- */
function revealShareLink(resultUrl) {
  if (!resultUrl) return;
  const actions = document.querySelector("#authenticity-map .result-actions");
  if (!actions || actions.querySelector(".share-link")) return;
  const wrap = document.createElement("p");
  wrap.className = "share-link form-note";
  wrap.innerHTML = `<span class="dot"></span>Your map has a private home you can return to or share: <a href="${resultUrl}">${resultUrl.replace(/^https?:\/\//, "")}</a>`;
  actions.appendChild(wrap);
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
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(answers),
    });
    const data = await response.json().catch(() => ({}));
    if (data.emailWarning) renderResult(result, "warning");
    else if (data.emailSkipped) renderResult(result, "skipped");
    else if (response.ok) renderResult(result, "sent");
    else renderResult(result, "warning");
    revealShareLink(data.resultUrl);
  } catch {
    renderResult(result, "warning");
  } finally {
    submitButton.disabled = false;
    submitButton.classList.remove("is-loading");
  }
}

const form = document.getElementById("assessment-form");
if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
  });
}
