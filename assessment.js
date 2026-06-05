/* ============================================================
   Daniel Tiwari — assessment form behaviour
   Scoring + Authenticity Map render live in assessment-core.js
   (shared with the hosted result page). This file owns the live
   quiz: building the rows, submitting, and revealing the result.
   ============================================================ */

function collectAnswers(form) {
  return Object.fromEntries(new FormData(form).entries());
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

// Reveal a persistent, shareable link to the hosted map once we have its id.
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
    else if (data.emailResults?.some((item) => item?.skipped)) renderResult(result, "skipped");
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

renderFocusRows();
const form = document.getElementById("assessment-form");
if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    submitAssessment(form, form.querySelector('button[type="submit"]'));
  });
}
