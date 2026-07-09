/* ============================================================
   Daniel Tiwari — assessment form behaviour
   Scoring + result render live in assessment-core.js (shared with
   the hosted result page). This file owns the live quiz: step
   initialization, one-at-a-time fulfillment, and submission.
   ============================================================ */

const CAUSE_LIST_HINT = 'One reason per line — press "+ Add another" for the next.';
const VALUE_LIST_HINT = 'One value per line — press "+ Add another" for the next value.';
const VISION_LIST_HINT = 'One part of your vision per line — press "+ Add another" for the next.';
const CONTROL_LIST_HINT = 'One thing outside your control per line — press "+ Add another" for the next.';
const FEELING_LIST_HINT = 'One feeling per line — press "+ Add another" for the next.';
const GENERIC_LIST_HINT = 'One thing per line — press "+ Add another" for the next.';
const ATTEMPT_LIST_HINT = 'One undertaking per line — press "+ Add another" for the next.';

// Wraps an element with an invisible bullet spacer so it lines up with the
// input field of a bullet+input list, not the bullet, regardless of what
// row class is used for the outer layout.
function indentPastBullet(el, rowClassName) {
  const wrap = document.createElement('div');
  wrap.className = rowClassName;
  const spacer = document.createElement('span');
  spacer.className = 'cause-bullet';
  spacer.style.visibility = 'hidden';
  spacer.textContent = '•';
  wrap.appendChild(spacer);
  wrap.appendChild(el);
  return wrap;
}

// Hint line above a bullet+input list.
function createListHint(text) {
  const p = document.createElement('p');
  p.className = 'list-hint';
  p.textContent = text;
  return indentPastBullet(p, 'list-hint-row');
}

// "+ Add another" button below a bullet+input list.
function wrapListAddBtn(btn) {
  return indentPastBullet(btn, 'list-addbtn-row');
}

// Wraps "&" so CSS can render it in a plainer font — several of the display/small-caps
// fonts on this page draw an ornate, script-style ampersand that clashes with the rest
// of the text. Only safe to use where the result is inserted as HTML (innerHTML), never
// in a data-attribute or in text sent to the notification email.
function ampSafe(text) {
  return String(text).replace(/&/g, '<span class="amp">&</span>');
}
const _scaleState = {};       // "urgency_career": "2"
const _fulfillmentState = {}; // "career": "7"
const _deeperState = {};      // "career_cause": "...", "career_vision": "..."
const _fsState = {};          // fit signals answers
let _fulfillmentKeyHandler = null;
let _spilloverState = null;

// Scrolls so `el` (the first unanswered field) sits just below the sticky header.
function scrollToVisible(el) {
  const offset = (document.getElementById('bar')?.offsetHeight || 0) + 24;
  window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - offset, behavior: 'smooth' });
}
// `field`, if given, is the actual unanswered field to jump to — otherwise falls
// back to the nav bar (e.g. for page-level errors with no single field to point to).
function setFormErr(msg, field) {
  const el = document.getElementById('form-step-error');
  if (el) { el.textContent = msg; el.classList.add('visible'); }
  if (field) { scrollToVisible(field); }
  else { document.getElementById('form-nav').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
}
function clearFormErr() {
  const el = document.getElementById('form-step-error');
  if (el) el.classList.remove('visible');
}

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
    importance: parseInt(document.querySelector(`input[name="importance_${key}"]`)?.value || 2),
    urgency: document.querySelector(`input[name="urgency_${key}"]`) ? 1 : 0,
  }));
}

function buildScaleRows(containerId, type) {
  const container = document.getElementById(containerId);
  container.innerHTML = AREAS.map(([key, label], i) => `
    <div class="scale-row">
      <div class="scale-area">
        <span class="num">${String(i + 1).padStart(2, "0")}</span>
        <strong>${label}</strong>
      </div>
      <div class="scale-btns" data-key="${key}" data-type="${type}">
        <button type="button" class="scale-btn" data-val="1">1</button>
        <button type="button" class="scale-btn" data-val="2">2</button>
        <button type="button" class="scale-btn" data-val="3">3</button>
      </div>
      <input type="hidden" name="${type}_${key}" value="2">
    </div>
  `).join("");
  container.querySelectorAll(".scale-btns").forEach(group => {
    const key = group.dataset.key;
    const type = group.dataset.type;
    const stateKey = `${type}_${key}`;
    const savedVal = _scaleState[stateKey];
    if (savedVal) {
      const btn = group.querySelector(`[data-val="${savedVal}"]`);
      if (btn) { btn.classList.add("selected"); container.querySelector(`input[name="${type}_${key}"]`).value = savedVal; }
    }
    group.querySelectorAll(".scale-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        group.querySelectorAll(".scale-btn").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        _scaleState[stateKey] = btn.dataset.val;
        container.querySelector(`input[name="${type}_${key}"]`).value = btn.dataset.val;
      });
    });
  });
}

/* ---- Step 0: Fulfillment (one at a time) ---- */
function renderFulfillmentCard(index, savedVal = null) {
  const [key, label, desc] = AREAS[index];
  const isFirst = index === 0;
  const isLast = index === AREAS.length - 1;
  if (!savedVal) savedVal = _fulfillmentState[key] || null;
  window._fulfillmentCardIndex = index;
  if (window.updateAssessmentProgress) window.updateAssessmentProgress();
  const card = document.getElementById("fulfillment-card");
  card.innerHTML = `
    <h3 class="deeper-area-name">${label}</h3>
    <div class="number-scale">
      ${[1,2,3,4,5].map(n => `<button type="button" class="number-btn" data-val="${n}">${n}</button>`).join("")}
    </div>
    <div class="scale-legend-card"><span>Terrible</span><span>Bad</span><span>Ok</span><span>Good</span><span>Awesome</span></div>
    <p class="area-counter sc">${index + 1} / ${AREAS.length}</p>
    <div class="fulfillment-nav">
      <p class="fulfillment-error">Please select a number first.</p>
      <div class="fulfillment-nav-buttons">
        ${!isFirst ? `<button type="button" class="btn btn-ghost fulfillment-back-btn">← Back</button>` : ""}
        <button type="button" class="btn btn-primary fulfillment-next-btn">Next →</button>
      </div>
    </div>
  `;
  let selected = savedVal;
  if (savedVal) {
    card.querySelector(`.number-btn[data-val="${savedVal}"]`)?.classList.add("selected");
  }
  card.querySelectorAll(".number-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      card.querySelectorAll(".number-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      selected = btn.dataset.val;
      _fulfillmentState[key] = selected;
      card.querySelector(".fulfillment-error").classList.remove("visible");
    });
  });

  if (_fulfillmentKeyHandler) document.removeEventListener("keydown", _fulfillmentKeyHandler);
  _fulfillmentKeyHandler = (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === "Enter") { card.querySelector(".fulfillment-next-btn")?.click(); return; }
    const n = parseInt(e.key) >= 1 && parseInt(e.key) <= 5 ? parseInt(e.key) : null;
    if (!n) return;
    card.querySelector(`.number-btn[data-val="${n}"]`)?.click();
  };
  document.addEventListener("keydown", _fulfillmentKeyHandler);
  if (!isFirst) {
    card.querySelector(".fulfillment-back-btn").addEventListener("click", () => {
      if (selected) _fulfillmentState[key] = selected;
      history.back();
    });
  }
  card.querySelector(".fulfillment-next-btn").addEventListener("click", () => {
    if (!selected) {
      card.querySelector(".fulfillment-error").classList.add("visible");
      return;
    }
    let hidden = document.querySelector(`#fulfillment-inputs input[name="fulfillment_${key}"]`);
    if (!hidden) {
      hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.name = `fulfillment_${key}`;
      document.getElementById("fulfillment-inputs").appendChild(hidden);
    }
    hidden.value = selected;
    if (!isLast) {
      if (!window._historyNav) history.pushState({ step: 0, sub: index + 1 }, '');
      renderFulfillmentCard(index + 1);
    } else {
      window.advanceMainStep();
    }
  });
}

function initFulfillmentStep() {
  const hasData = !!document.querySelector("#fulfillment-inputs input");
  if (hasData) {
    document.getElementById("fulfillment-intro").hidden = true;
    document.getElementById("fulfillment-areas").hidden = false;
    renderFulfillmentCard(AREAS.length - 1);
  } else {
    document.getElementById("fulfillment-intro").hidden = false;
    document.getElementById("fulfillment-areas").hidden = true;
    document.getElementById("btn-get-started").addEventListener("click", () => {
      document.getElementById("fulfillment-intro").hidden = true;
      document.getElementById("fulfillment-areas").hidden = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (!window._historyNav) history.pushState({ step: 0, sub: 0 }, '');
      if (window.startStopwatch) window.startStopwatch();
      renderFulfillmentCard(0);
    }, { once: true });
  }
}

function buildRankingRows(containerId, hiddenContainerId, type) {
  const n = AREAS.length;
  const container = document.getElementById(containerId);

  const savedInputs = document.querySelectorAll(`#${hiddenContainerId} input`);
  let orderedAreas = [...AREAS];
  let hasMoved = false;
  if (savedInputs.length) {
    const valMap = {};
    savedInputs.forEach(inp => { valMap[inp.name.replace(`${type}_`, "")] = parseInt(inp.value); });
    orderedAreas = [...AREAS].sort((a, b) => (valMap[b[0]] || 0) - (valMap[a[0]] || 0));
    hasMoved = orderedAreas.some(([key], i) => key !== AREAS[i][0]);
  }
  container.innerHTML = orderedAreas.map(([key, label, desc], i) => `
    <div class="drag-item" data-key="${key}">
      <span class="drag-rank">${String(i + 1).padStart(2, "0")}</span>
      <div class="drag-label-wrap">
        <span class="drag-label">${label.replace(/&/g, '<span class="amp">&</span>')}</span>
        ${desc ? `<span class="drag-desc">${desc}</span>` : ""}
      </div>
      <div class="move-btns">
        <button type="button" class="move-btn move-up" aria-label="Move up">↑</button>
        <button type="button" class="move-btn move-down" aria-label="Move down">↓</button>
      </div>
    </div>
  `).join("");

  let warning = container.nextElementSibling;
  if (!warning || !warning.classList.contains("rank-warning")) {
    warning = document.createElement("p");
    warning.className = "rank-warning";
    warning.textContent = "Please rank these by moving them up or down before continuing.";
    container.insertAdjacentElement("afterend", warning);
  } else {
    warning.classList.remove("visible");
  }

  function refresh() {
    const items = [...container.querySelectorAll(".drag-item")];
    items.forEach((item, i) => {
      item.querySelector(".drag-rank").textContent = String(i + 1).padStart(2, "0");
      item.querySelector(".move-up").disabled = i === 0;
      item.querySelector(".move-down").disabled = i === items.length - 1;
    });
    document.getElementById(hiddenContainerId).innerHTML = items.map((item, i) =>
      `<input type="hidden" name="${type}_${item.dataset.key}" value="${n - i}">`
    ).join("");
  }

  container.addEventListener("click", e => {
    const btn = e.target.closest(".move-btn");
    if (!btn) return;
    const item = btn.closest(".drag-item");
    const before = btn.getBoundingClientRect().top;
    if (btn.classList.contains("move-up") && item.previousElementSibling) {
      container.insertBefore(item, item.previousElementSibling);
    } else if (btn.classList.contains("move-down") && item.nextElementSibling) {
      container.insertBefore(item.nextElementSibling, item);
    }
    hasMoved = true;
    warning.classList.remove("visible");
    refresh();
    const after = btn.getBoundingClientRect().top;
    window.scrollBy({ top: after - before, behavior: "instant" });
    btn.blur();
  });

  window._validateRanking = window._validateRanking || {};
  window._validateRanking[containerId] = function() {
    if (!hasMoved) { return false; }
    return true;
  };

  refresh();
}

/* ---- Step 1: Importance ---- */
function initImportanceStep() {
  buildRankingRows("importance-rows", "importance-hidden-inputs", "importance");
}

/* ---- Step 3: Spillover ---- */
function initSpilloverStep() {
  const container = document.getElementById('spillover-rows');
  const warning = document.getElementById('spillover-warning');

  const existing = document.querySelector('#spillover-hidden-input input');
  if (existing && !_spilloverState) _spilloverState = existing.value;

  function updateInput() {
    document.getElementById('spillover-hidden-input').innerHTML =
      _spilloverState ? `<input type="hidden" name="spillover_area" value="${_spilloverState}">` : '';
  }

  function render() {
    container.innerHTML = AREAS.map(([key, label, desc], i) => `
      <div class="rec-item${_spilloverState === key ? ' selected' : ''}" data-key="${key}">
        <span class="rec-num">${String(i + 1).padStart(2, '0')}</span>
        <div class="rec-info">
          <strong class="rec-label">${label}</strong>
          ${desc ? `<span class="rec-reason">${desc}</span>` : ''}
        </div>
        <span class="rec-check">${_spilloverState === key ? '✓' : ''}</span>
      </div>
    `).join('');

    container.querySelectorAll('.rec-item').forEach(item => {
      item.addEventListener('click', () => {
        _spilloverState = item.dataset.key;
        warning.classList.remove('visible');
        if (window.clearFormError) window.clearFormError();
        updateInput();
        render();
      });
    });

    updateInput();
  }

  render();
}

/* ---- Step 2: Urgency flag ---- */
function initUrgencyFlagStep() {
  const MAX_URGENT = 3;

  const urgent = new Set(
    [...document.querySelectorAll('#urgent-hidden-inputs input[name^="urgency_"]')]
      .map(i => i.name.replace(/^urgency_/, ''))
      .filter(k => k !== 'none')
  );
  let noneFlag = !!document.querySelector('#urgent-hidden-inputs input[name="urgency_none"]');

  function updateUrgentInputs() {
    const inputs = [...urgent].map(key => `<input type="hidden" name="urgency_${key}" value="1">`);
    if (noneFlag) inputs.push('<input type="hidden" name="urgency_none" value="1">');
    document.getElementById('urgent-hidden-inputs').innerHTML = inputs.join('');
    if (window.clearFormError) window.clearFormError();
  }

  function renderUrgent() {
    const atCap = urgent.size >= MAX_URGENT;
    const container = document.getElementById('urgent-rows');
    const areaRows = AREAS.map(([key, label], i) => {
      const isUrgent = urgent.has(key);
      const disabled = atCap && !isUrgent;
      return `
      <div class="rec-item${isUrgent ? " selected" : ""}" data-key="${key}"${disabled ? ' style="opacity:.45;pointer-events:none"' : ""}>
        <span class="rec-num">${String(i + 1).padStart(2, "0")}</span>
        <div class="rec-info">
          <strong class="rec-label">${label}</strong>
        </div>
        <span class="rec-check">${isUrgent ? "✓" : ""}</span>
      </div>`;
    }).join("");
    const noneRow = `
      <div class="rec-item${noneFlag ? " selected" : ""}" data-key="__none__" style="border-top:1px solid var(--hair);margin-top:.4rem;padding-top:1.3rem">
        <span class="rec-num">—</span>
        <div class="rec-info">
          <strong class="rec-label">Nothing's pressing right now</strong>
        </div>
        <span class="rec-check">${noneFlag ? "✓" : ""}</span>
      </div>`;
    container.innerHTML = areaRows + noneRow;

    container.querySelectorAll(".rec-item").forEach(item => {
      item.addEventListener("click", () => {
        const key = item.dataset.key;
        if (key === '__none__') {
          noneFlag = !noneFlag;
          if (noneFlag) urgent.clear();
        } else {
          if (urgent.has(key)) {
            urgent.delete(key);
          } else if (urgent.size < MAX_URGENT) {
            urgent.add(key);
            noneFlag = false;
          }
        }
        updateUrgentInputs();
        renderUrgent();
      });
    });

    updateUrgentInputs();
  }

  renderUrgent();
}

/* ---- Step 3: Focus recommendation ---- */
function initFocusStep() {
  const n = AREAS.length;

  const existingFocusKeys = new Set(
    [...document.querySelectorAll('#focus-hidden-inputs input')].map(i => i.value)
  );
  let selected = existingFocusKeys;

  function getReason(area) {
    const importanceRank = n + 1 - area.importance;
    if (area.urgency) return `flagged as urgent · ${area.fulfillment}/5 fulfilled`;
    if (area.fulfillment <= 2) return `${area.fulfillment}/5 fulfilled · #${importanceRank} in importance`;
    return `#${importanceRank} in importance · ${area.fulfillment}/5 fulfilled`;
  }

  function updateFocusInputs() {
    document.getElementById("focus-hidden-inputs").innerHTML =
      [...selected].map(key => `<input type="hidden" name="focus_area" value="${key}">`).join("");
  }

  function renderFocus() {
    const ranked = rankAllAreas(getWheelValues());
    if (!selected.size) selected = new Set(ranked.slice(0, 1).map(a => a.key));

    const list = document.getElementById("rec-list");
    list.innerHTML = ranked.map((area, i) => `
      <div class="rec-item${selected.has(area.key) ? " selected" : ""}" data-key="${area.key}">
        <span class="rec-num">${String(i + 1).padStart(2, "0")}</span>
        <div class="rec-info">
          <strong class="rec-label">${area.label}</strong>
          <span class="rec-reason">${getReason(area)}</span>
        </div>
        <span class="rec-check">${selected.has(area.key) ? "✓" : ""}</span>
      </div>
    `).join("");

    list.querySelectorAll(".rec-item").forEach(item => {
      item.addEventListener("click", () => {
        const key = item.dataset.key;
        if (selected.has(key)) {
          selected.delete(key);
          if (selected.size === 0) selected.add(key);
        } else {
          selected.clear();
          selected.add(key);
        }
        updateFocusInputs();
        renderFocus();
      });
    });

    updateFocusInputs();
  }

  renderFocus();
}

/* ---- Bullet cause list ---- */
function renderCauseList(key) {
  const container = document.getElementById('cause-list-' + key);
  if (!container) return;
  if (!Array.isArray(_deeperState['deeper_' + key + '_causes'])) {
    _deeperState['deeper_' + key + '_causes'] = [''];
  }
  const causes = _deeperState['deeper_' + key + '_causes'];

  function syncAndUpdate() {
    const hidden = container.querySelector('input[type="hidden"]');
    if (hidden) hidden.value = JSON.stringify(causes);
    renderActsGroups(key);
  }

  function build() {
    container.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'cause-list';
    causes.forEach((val, i) => {
      const row = document.createElement('div');
      row.className = 'cause-item';
      const bullet = document.createElement('span');
      bullet.className = 'cause-bullet';
      bullet.textContent = '•';
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'cause-input';
      inp.value = val;
      inp.placeholder = 'Add a reason…';
      inp.addEventListener('input', () => {
        causes[i] = inp.value;
        _deeperState['deeper_' + key + '_causes'] = causes;
        syncAndUpdate();
        container.querySelectorAll('.cause-remove').forEach(b => { b.hidden = causes.length === 1; });
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          causes.push('');
          _deeperState['deeper_' + key + '_causes'] = causes;
          build();
          const inputs = container.querySelectorAll('.cause-input');
          if (inputs.length) inputs[inputs.length - 1].focus();
        }
      });
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'cause-remove';
      rm.textContent = '×';
      rm.hidden = causes.length === 1;
      rm.addEventListener('click', () => {
        causes.splice(i, 1);
        _deeperState['deeper_' + key + '_causes'] = causes;
        build();
        syncAndUpdate();
      });
      row.appendChild(bullet); row.appendChild(inp); row.appendChild(rm);
      list.appendChild(row);
    });
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'list-add-btn';
    addBtn.textContent = '+ Add another';
    addBtn.addEventListener('click', () => {
      causes.push('');
      _deeperState['deeper_' + key + '_causes'] = causes;
      build();
      const inputs = container.querySelectorAll('.cause-input');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = 'deeper_' + key + '_causes';
    hidden.value = JSON.stringify(causes);
    container.appendChild(createListHint(CAUSE_LIST_HINT));
    container.appendChild(list);
    container.appendChild(wrapListAddBtn(addBtn));
    container.appendChild(hidden);
    const listErr = document.createElement('p');
    listErr.className = 'yn-error list-error';
    container.appendChild(listErr);
  }
  build();
}

/* ---- Values attributed to each action/inaction, one bullet list per item ---- */
function renderActsValuesByItem(key) {
  const container = document.getElementById('acts-value-groups-' + key);
  if (!container) return;
  const items = (_deeperState['deeper_' + key + '_acts_items'] || []).filter(it => it && it.trim());
  const stateKey = 'deeper_' + key + '_acts_values_by_item';
  if (typeof _deeperState[stateKey] !== 'object' || !_deeperState[stateKey]) _deeperState[stateKey] = {};
  const valuesByItem = _deeperState[stateKey];

  container.innerHTML = '';
  if (!items.length) return;

  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.name = stateKey;
  function syncHidden() { hidden.value = JSON.stringify(valuesByItem); }

  // Every distinct value typed anywhere on this page, across all actions/inactions —
  // offered as quick-add checkboxes on the OTHER items so the same value never has
  // to be typed out twice. Matching is case-insensitive (e.g. "Security" and
  // "security" count as the same value); the first-typed casing is kept for display.
  function allTypedValues() {
    const seen = [];
    const seenNorm = new Set();
    items.forEach((it) => {
      (valuesByItem[it] || []).forEach((v) => {
        const t = (v || '').trim();
        const norm = t.toLowerCase();
        if (t && !seenNorm.has(norm)) { seenNorm.add(norm); seen.push(t); }
      });
    });
    return seen;
  }

  const refreshSuggestionsFns = [];
  function refreshAllSuggestions() {
    refreshSuggestionsFns.forEach((fn) => fn());
  }

  items.forEach((item) => {
    if (!Array.isArray(valuesByItem[item]) || !valuesByItem[item].length) valuesByItem[item] = [''];
    const values = valuesByItem[item];

    const block = document.createElement('div');
    block.className = 'acts-group';
    const itemLbl = document.createElement('p');
    itemLbl.className = 'acts-item-heading';
    itemLbl.textContent = item;
    itemLbl.style.marginBottom = '0';
    const itemLblRow = indentPastBullet(itemLbl, 'indent-row-center');
    itemLblRow.style.marginBottom = '.6rem';
    block.appendChild(itemLblRow);

    // Quick-add checkboxes for values already named under other actions/inactions
    // on this page. Checking one fills it into this item's list below instead of
    // making the person retype a value they already named elsewhere.
    const suggestWrap = document.createElement('div');
    suggestWrap.className = 'acts-suggest-wrap';
    block.appendChild(suggestWrap);

    block.appendChild(createListHint(VALUE_LIST_HINT));

    const list = document.createElement('div');
    list.className = 'cause-list';
    block.appendChild(list);

    function buildRows() {
      list.innerHTML = '';
      values.forEach((val, i) => {
        const row = document.createElement('div');
        row.className = 'cause-item';
        const bullet = document.createElement('span');
        bullet.className = 'cause-bullet';
        bullet.textContent = '•';
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'cause-input';
        inp.value = val;
        inp.placeholder = 'e.g. Security, comfort, avoiding failure…';
        inp.addEventListener('input', () => {
          values[i] = inp.value;
          syncHidden();
          list.querySelectorAll('.cause-remove').forEach(b => { b.hidden = values.length === 1; });
        });
        inp.addEventListener('blur', () => { refreshAllSuggestions(); });
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            values.push('');
            buildRows();
            const inputs = list.querySelectorAll('.cause-input');
            if (inputs.length) inputs[inputs.length - 1].focus();
          }
        });
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'cause-remove';
        rm.textContent = '×';
        rm.hidden = values.length === 1;
        rm.addEventListener('click', () => {
          values.splice(i, 1);
          if (!values.length) values.push('');
          buildRows();
          syncHidden();
          refreshAllSuggestions();
        });
        row.appendChild(bullet); row.appendChild(inp); row.appendChild(rm);
        list.appendChild(row);
      });
    }
    buildRows();

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'list-add-btn';
    addBtn.textContent = '+ Add another';
    addBtn.addEventListener('click', () => {
      values.push('');
      buildRows();
      const inputs = list.querySelectorAll('.cause-input');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    block.appendChild(wrapListAddBtn(addBtn));

    function refreshSuggestions() {
      const already = new Set(values.map((v) => (v || '').trim().toLowerCase()).filter(Boolean));
      const options = allTypedValues().filter((v) => !already.has(v.toLowerCase()));
      suggestWrap.innerHTML = '';
      if (!options.length) return;
      const suggestLbl = document.createElement('p');
      suggestLbl.className = 'list-hint';
      suggestLbl.textContent = 'Also applies here?';
      suggestWrap.appendChild(indentPastBullet(suggestLbl, 'indent-row-center'));
      const checks = document.createElement('div');
      checks.className = 'acts-checkboxes';
      options.forEach((opt) => {
        const rowLbl = document.createElement('label');
        rowLbl.className = 'acts-check-label';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.addEventListener('change', () => {
          if (!cb.checked) return;
          const blankIdx = values.findIndex((v) => !v || !v.trim());
          if (blankIdx !== -1) values[blankIdx] = opt; else values.push(opt);
          buildRows();
          syncHidden();
          refreshSuggestions();
        });
        const span = document.createElement('span');
        span.textContent = opt;
        rowLbl.appendChild(cb); rowLbl.appendChild(span);
        checks.appendChild(rowLbl);
      });
      suggestWrap.appendChild(indentPastBullet(checks, 'indent-row-center'));
    }
    refreshSuggestions();
    refreshSuggestionsFns.push(refreshSuggestions);

    container.appendChild(block);
  });

  syncHidden();
  container.appendChild(hidden);

  const listErr = document.createElement('p');
  listErr.className = 'yn-error list-error';
  container.appendChild(listErr);
}

function renderSimpleBulletList(containerId, stateKey, placeholder, nothingStateKey, stateObj, hintText) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const state = stateObj || _deeperState;
  if (!Array.isArray(state[stateKey])) state[stateKey] = [''];
  const items = state[stateKey];

  function syncHidden() {
    const h = container.querySelector('input[name="' + stateKey + '"]');
    if (h) h.value = JSON.stringify(items);
  }

  function build() {
    container.innerHTML = '';
    const isNothing = nothingStateKey && !!state[nothingStateKey];

    const list = document.createElement('div');
    list.className = 'cause-list';
    list.hidden = isNothing;
    items.forEach((val, i) => {
      const row = document.createElement('div');
      row.className = 'cause-item';
      const bullet = document.createElement('span');
      bullet.className = 'cause-bullet';
      bullet.textContent = '•';
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'cause-input';
      inp.value = val;
      inp.placeholder = placeholder;
      inp.addEventListener('input', () => {
        items[i] = inp.value;
        state[stateKey] = items;
        syncHidden();
        if (window.clearFormError) window.clearFormError();
        container.querySelectorAll('.cause-remove').forEach(b => { b.hidden = items.length === 1; });
      });
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault(); e.stopPropagation();
          items.push('');
          state[stateKey] = items;
          build();
          const inputs = container.querySelectorAll('.cause-input');
          if (inputs.length) inputs[inputs.length - 1].focus();
        }
      });
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'cause-remove';
      rm.textContent = '×';
      rm.hidden = items.length === 1;
      rm.addEventListener('click', () => {
        items.splice(i, 1);
        state[stateKey] = items;
        build(); syncHidden();
      });
      row.appendChild(bullet); row.appendChild(inp); row.appendChild(rm);
      list.appendChild(row);
    });
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'list-add-btn';
    addBtn.textContent = '+ Add another';
    addBtn.addEventListener('click', () => {
      items.push('');
      state[stateKey] = items;
      build();
      const inputs = container.querySelectorAll('.cause-input');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    const addBtnRow = wrapListAddBtn(addBtn);
    addBtnRow.hidden = isNothing;
    const hint = createListHint(hintText || GENERIC_LIST_HINT);
    hint.hidden = isNothing;
    container.appendChild(hint);
    container.appendChild(list);
    container.appendChild(addBtnRow);
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = stateKey;
    hidden.value = JSON.stringify(items);
    container.appendChild(hidden);

    if (nothingStateKey) {
      const nothingWrap = document.createElement('label');
      nothingWrap.className = 'nothing-checkbox-label';
      nothingWrap.style.cssText = 'display:flex;align-items:center;gap:.5rem;margin-top:.75rem;cursor:pointer;font-size:.9rem;';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = isNothing;
      cb.addEventListener('change', () => {
        state[nothingStateKey] = cb.checked;
        if (window.clearFormError) window.clearFormError();
        build();
      });
      const lbl = document.createElement('span');
      lbl.textContent = 'Nothing';
      nothingWrap.appendChild(cb);
      nothingWrap.appendChild(lbl);
      container.appendChild(nothingWrap);
    }
  }

  build();
}

function renderTrackRecordList(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!Array.isArray(_fsState['fs_q6_items']) || !_fsState['fs_q6_items'].length) {
    _fsState['fs_q6_items'] = [{ what: '', howWell: null, why: '' }];
  }
  const items = _fsState['fs_q6_items'];

  function whyLabel(howWell) {
    if (howWell === 10) return 'What made it work so well?';
    if (howWell >= 6)   return 'What could have made it even better?';
    return 'What do you think got in the way?';
  }

  function build() {
    container.innerHTML = '';
    const isNothing = !!_fsState['fs_q6_nothing'];

    const list = document.createElement('div');
    list.hidden = isNothing;

    items.forEach((item, i) => {
      const card = document.createElement('div');
      card.dataset.index = i;
      card.style.cssText = 'border:1px solid var(--hair);border-radius:4px;padding:1rem 1.2rem;margin-bottom:1rem';

      // What row
      const whatRow = document.createElement('div');
      whatRow.dataset.role = 'what-row';
      whatRow.style.cssText = 'display:flex;align-items:center;gap:.6rem';
      const bullet = document.createElement('span');
      bullet.className = 'cause-bullet';
      bullet.textContent = '•';
      const whatInp = document.createElement('input');
      whatInp.type = 'text';
      whatInp.className = 'cause-input';
      whatInp.style.flex = '1';
      whatInp.value = item.what;
      whatInp.placeholder = 'Describe what you tried…';
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'cause-remove';
      rm.textContent = '×';
      rm.hidden = items.length === 1;
      rm.addEventListener('click', () => { items.splice(i, 1); build(); });
      whatRow.appendChild(bullet); whatRow.appendChild(whatInp); whatRow.appendChild(rm);
      card.appendChild(whatRow);

      // Scale — hidden until text is entered
      const scaleSec = document.createElement('div');
      scaleSec.dataset.role = 'scale-row';
      scaleSec.style.marginTop = '1rem';
      scaleSec.hidden = !item.what?.trim();
      const scaleLbl = document.createElement('label');
      scaleLbl.style.cssText = 'font-size:.8rem;font-family:var(--sc);letter-spacing:.12em;display:block;margin-bottom:.5rem';
      scaleLbl.textContent = 'How well did it work?';
      const scaleRow = document.createElement('div');
      scaleRow.className = 'number-scale';
      const scaleLegend = document.createElement('div');
      scaleLegend.style.cssText = 'display:flex;justify-content:space-between;font-size:.68rem;letter-spacing:.1em;font-family:var(--sc);color:var(--muted);margin-top:.3rem';
      scaleLegend.innerHTML = '<span>Not at all</span><span>Very well</span>';

      // Why textarea — hidden until scale is selected
      const taSec = document.createElement('div');
      taSec.dataset.role = 'why-row';
      taSec.style.marginTop = '1rem';
      taSec.hidden = !item.howWell;
      const taLbl = document.createElement('label');
      taLbl.style.cssText = 'font-size:.8rem;font-family:var(--sc);letter-spacing:.12em;display:block;margin-bottom:.5rem';
      taLbl.textContent = whyLabel(item.howWell);
      const ta = document.createElement('textarea');
      ta.className = 'cause-input';
      ta.style.cssText = 'width:100%;min-height:3.5rem;resize:vertical;box-sizing:border-box';
      ta.value = item.why;
      ta.addEventListener('input', () => { items[i].why = ta.value; if (window.clearFormError) window.clearFormError(); });
      taSec.appendChild(taLbl); taSec.appendChild(ta);

      for (let n = 1; n <= 10; n++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'number-btn' + (item.howWell === n ? ' selected' : '');
        btn.textContent = n;
        btn.addEventListener('click', () => {
          scaleRow.querySelectorAll('.number-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          items[i].howWell = n;
          taLbl.textContent = whyLabel(n);
          taSec.hidden = false;
          if (window.clearFormError) window.clearFormError();
        });
        scaleRow.appendChild(btn);
      }
      scaleSec.appendChild(scaleLbl); scaleSec.appendChild(scaleRow); scaleSec.appendChild(scaleLegend);
      card.appendChild(scaleSec);
      card.appendChild(taSec);

      whatInp.addEventListener('input', () => {
        items[i].what = whatInp.value;
        scaleSec.hidden = !whatInp.value.trim();
        if (window.clearFormError) window.clearFormError();
      });

      list.appendChild(card);
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'list-add-btn';
    addBtn.textContent = '+ Add another';
    addBtn.addEventListener('click', () => {
      items.push({ what: '', howWell: null, why: '' });
      build();
      container.querySelectorAll('.cause-input')[items.length * 2 - 2]?.focus();
    });
    // Cards have their own 1.2rem left padding around the bullet+input row, on
    // top of the usual bullet-width+gap indent — so the hint and add-button need
    // that extra offset too, to still land on the text field, not the bullet.
    const hintRow = createListHint(ATTEMPT_LIST_HINT);
    hintRow.hidden = isNothing;
    hintRow.style.paddingLeft = '1.2rem';
    const addBtnRow = wrapListAddBtn(addBtn);
    addBtnRow.hidden = isNothing;
    addBtnRow.style.paddingLeft = '1.2rem';
    container.appendChild(hintRow);
    container.appendChild(list);
    container.appendChild(addBtnRow);

    const nothingWrap = document.createElement('label');
    nothingWrap.style.cssText = 'display:flex;align-items:center;gap:.5rem;margin-top:.75rem;cursor:pointer;font-size:.9rem;';
    const nothingCb = document.createElement('input');
    nothingCb.type = 'checkbox';
    nothingCb.checked = isNothing;
    nothingCb.addEventListener('change', () => {
      _fsState['fs_q6_nothing'] = nothingCb.checked;
      if (window.clearFormError) window.clearFormError();
      build();
    });
    const nothingLbl = document.createElement('span');
    nothingLbl.textContent = 'Nothing';
    nothingWrap.appendChild(nothingCb);
    nothingWrap.appendChild(nothingLbl);
    container.appendChild(nothingWrap);
  }

  build();
}

function renderActsGroups(key) {
  const isNothing = !!_deeperState['deeper_' + key + '_acts_raw_nothing'];
  const items = isNothing ? [] : (_deeperState['deeper_' + key + '_acts_raw_items'] || []).filter(i => i && i.trim());
  _deeperState['deeper_' + key + '_acts_items'] = items;
  renderActsValuesByItem(key);
}

function renderActsItemValues(key) {
  renderActsGroups(key);
}

function renderActsConfirm(key) {
  const container = document.getElementById('acts-confirm-' + key);
  if (!container) return;
  container.innerHTML = '';
  container.hidden = !_deeperState['deeper_' + key + '_acts_confirm_shown'];
  container.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:1.2rem;background:rgba(20,18,14,.6);';

  const card = document.createElement('div');
  card.style.cssText = 'background:#fdfcf9;border-radius:14px;max-width:420px;width:100%;padding:1.7rem 1.6rem;box-shadow:0 20px 60px rgba(0,0,0,.35);';

  const title = document.createElement('p');
  title.style.cssText = 'font-weight:600;margin:0 0 1rem;font-size:1.05rem;';
  title.textContent = 'Before you continue —';
  card.appendChild(title);

  const wrap = document.createElement('label');
  wrap.style.cssText = 'display:flex;align-items:flex-start;gap:.6rem;cursor:pointer;font-size:.95rem;line-height:1.45;';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.style.marginTop = '.2rem';
  cb.checked = !!_deeperState['deeper_' + key + '_acts_confirm'];
  const lbl = document.createElement('span');
  lbl.textContent = "I contemplated all of the things I am NOT doing but COULD be doing to improve my situation.";
  wrap.appendChild(cb);
  wrap.appendChild(lbl);
  card.appendChild(wrap);

  const err = document.createElement('p');
  err.style.cssText = 'color:#b3261e;font-size:.85rem;margin:.7rem 0 0;display:none;';
  err.textContent = 'Please check the box first.';
  card.appendChild(err);

  cb.addEventListener('change', () => { if (cb.checked) err.style.display = 'none'; });

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Continue';
  btn.style.cssText = 'margin-top:1.3rem;width:100%;padding:.75rem 1rem;border:none;border-radius:8px;background:#1a1a1a;color:#fff;font-size:.95rem;cursor:pointer;';
  btn.addEventListener('click', () => {
    if (!cb.checked) { err.style.display = 'block'; return; }
    _deeperState['deeper_' + key + '_acts_confirm'] = true;
    container.hidden = true;
    if (window.clearFormError) window.clearFormError();
    window._showDeeperSubPage(window._deeperSubPageIdx + 1, 1);
  });
  card.appendChild(btn);

  const backLink = document.createElement('button');
  backLink.type = 'button';
  backLink.textContent = 'Wait — let me add more';
  backLink.style.cssText = 'margin-top:.8rem;width:100%;padding:.5rem;border:none;background:none;color:#6b6559;font-size:.85rem;text-decoration:underline;cursor:pointer;';
  backLink.addEventListener('click', () => { container.hidden = true; });
  card.appendChild(backLink);

  container.appendChild(card);
}

/* ---- Vision bullet list ---- */
function renderVisionList(key) {
  const container = document.getElementById('vision-list-' + key);
  if (!container) return;
  if (!Array.isArray(_deeperState['deeper_' + key + '_vision_items'])) {
    _deeperState['deeper_' + key + '_vision_items'] = [''];
  }
  const items = _deeperState['deeper_' + key + '_vision_items'];
  const expand = container.closest('.yn-expand');
  const valuesReveal = expand?.querySelector('.values-reveal');
  const confirmCheck = valuesReveal?.querySelector('.vision-actual-check');
  const confirmError = valuesReveal?.querySelector('.yn-error');

  if (confirmCheck && !confirmCheck.dataset.wired) {
    confirmCheck.dataset.wired = '1';
    confirmCheck.addEventListener('change', () => {
      _deeperState['deeper_' + key + '_vision_actual_yn'] = confirmCheck.checked ? 'yes' : '';
      if (confirmError) confirmError.classList.remove('visible');
    });
  }

  function updateReveal() {
    const filled = items.filter(i => i && i.trim()).length > 0;
    if (valuesReveal) valuesReveal.hidden = !filled;
  }

  function uncheck() {
    if (confirmCheck && confirmCheck.checked) {
      confirmCheck.checked = false;
      _deeperState['deeper_' + key + '_vision_actual_yn'] = '';
    }
  }

  function syncHidden() {
    const h = container.querySelector('input[type="hidden"]');
    if (h) h.value = JSON.stringify(items);
  }

  function build() {
    container.innerHTML = '';
    const placeholder = container.dataset.placeholder || 'What would need to be in place…';
    const list = document.createElement('div');
    list.className = 'cause-list';
    items.forEach((val, i) => {
      const row = document.createElement('div');
      row.className = 'cause-item';
      const bullet = document.createElement('span');
      bullet.className = 'cause-bullet';
      bullet.textContent = '•';
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'cause-input';
      inp.value = val;
      inp.placeholder = placeholder;
      inp.addEventListener('input', () => {
        items[i] = inp.value;
        _deeperState['deeper_' + key + '_vision_items'] = items;
        syncHidden();
        updateReveal();
        uncheck();
        container.querySelectorAll('.cause-remove').forEach(b => { b.hidden = items.length === 1; });
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          items.push('');
          _deeperState['deeper_' + key + '_vision_items'] = items;
          build();
          const inputs = container.querySelectorAll('.cause-input');
          if (inputs.length) inputs[inputs.length - 1].focus();
        }
      });
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'cause-remove';
      rm.textContent = '×';
      rm.hidden = items.length === 1;
      rm.addEventListener('click', () => {
        items.splice(i, 1);
        _deeperState['deeper_' + key + '_vision_items'] = items;
        build();
        syncHidden();
        updateReveal();
      });
      row.appendChild(bullet); row.appendChild(inp); row.appendChild(rm);
      list.appendChild(row);
    });
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'list-add-btn';
    addBtn.textContent = '+ Add another';
    addBtn.addEventListener('click', () => {
      items.push('');
      _deeperState['deeper_' + key + '_vision_items'] = items;
      build();
      const inputs = container.querySelectorAll('.cause-input');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = 'deeper_' + key + '_vision_items';
    hidden.value = JSON.stringify(items);
    container.appendChild(createListHint(VISION_LIST_HINT));
    container.appendChild(list);
    container.appendChild(wrapListAddBtn(addBtn));
    container.appendChild(hidden);
    const listErr = document.createElement('p');
    listErr.className = 'yn-error list-error';
    container.appendChild(listErr);
  }

  build();
  updateReveal();
}

/* ---- Control bullet list ---- */
function renderControlList(key) {
  const container = document.getElementById('control-list-' + key);
  if (!container) return;
  if (!Array.isArray(_deeperState['deeper_' + key + '_control_items'])) {
    _deeperState['deeper_' + key + '_control_items'] = [''];
  }
  const items = _deeperState['deeper_' + key + '_control_items'];

  function syncAndUpdate() {
    _deeperState['deeper_' + key + '_control_items'] = items;
    const hidden = container.querySelector('input[type="hidden"]');
    if (hidden) hidden.value = JSON.stringify(items);
    renderControlAttitude(key);
  }

  function build() {
    container.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'cause-list';
    items.forEach((val, i) => {
      const row = document.createElement('div');
      row.className = 'cause-item';
      const bullet = document.createElement('span');
      bullet.className = 'cause-bullet';
      bullet.textContent = '•';
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'cause-input';
      inp.value = val;
      inp.placeholder = 'Something not in your control…';
      inp.addEventListener('input', () => {
        items[i] = inp.value;
        syncAndUpdate();
        container.querySelectorAll('.cause-remove').forEach(b => { b.hidden = items.length === 1; });
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          items.push('');
          _deeperState['deeper_' + key + '_control_items'] = items;
          build();
          const inputs = container.querySelectorAll('.cause-input');
          if (inputs.length) inputs[inputs.length - 1].focus();
        }
      });
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'cause-remove';
      rm.textContent = '×';
      rm.hidden = items.length === 1;
      rm.addEventListener('click', () => {
        items.splice(i, 1);
        _deeperState['deeper_' + key + '_control_items'] = items;
        build();
        syncAndUpdate();
      });
      row.appendChild(bullet); row.appendChild(inp); row.appendChild(rm);
      list.appendChild(row);
    });
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'list-add-btn';
    addBtn.textContent = '+ Add another';
    addBtn.addEventListener('click', () => {
      items.push('');
      _deeperState['deeper_' + key + '_control_items'] = items;
      build();
      const inputs = container.querySelectorAll('.cause-input');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = 'deeper_' + key + '_control_items';
    hidden.value = JSON.stringify(items);
    container.appendChild(createListHint(CONTROL_LIST_HINT));
    container.appendChild(list);
    container.appendChild(wrapListAddBtn(addBtn));
    container.appendChild(hidden);
    const listErr = document.createElement('p');
    listErr.className = 'yn-error list-error';
    container.appendChild(listErr);
  }
  build();
}

/* ---- Control attitude per-item ---- */
function renderControlAttitude(key) {
  const container = document.getElementById('control-attitude-' + key);
  if (!container) return;
  const items = (_deeperState['deeper_' + key + '_control_items'] || []).filter(i => i && i.trim());
  container.hidden = items.length === 0;
  if (!items.length) { container.innerHTML = ''; return; }

  const feelingKey        = 'deeper_' + key + '_control_feeling';
  const feelingYnKey      = 'deeper_' + key + '_control_feeling_yn';
  const feelingConfirmKey = 'deeper_' + key + '_control_feeling_confirm';
  if (typeof _deeperState[feelingKey] !== 'object' || !_deeperState[feelingKey]) _deeperState[feelingKey] = {};
  if (typeof _deeperState[feelingYnKey] !== 'object' || !_deeperState[feelingYnKey]) _deeperState[feelingYnKey] = {};
  if (typeof _deeperState[feelingConfirmKey] !== 'object' || !_deeperState[feelingConfirmKey]) _deeperState[feelingConfirmKey] = {};
  const feelings        = _deeperState[feelingKey];
  const feelingYn        = _deeperState[feelingYnKey];
  const feelingConfirm   = _deeperState[feelingConfirmKey];

  function syncHidden(stateKey, stateObj) {
    const h = container.querySelector('input[name="' + stateKey + '"]');
    if (h) h.value = JSON.stringify(stateObj);
  }

  // Every distinct feeling typed anywhere on this page, across all circumstances —
  // offered as quick-add checkboxes on the OTHER circumstances so the same feeling
  // never has to be typed out twice. Mirrors the same pattern used for values.
  function allTypedFeelings() {
    const seen = [];
    const seenNorm = new Set();
    items.forEach((it) => {
      (feelings[it] || []).forEach((v) => {
        const t = (v || '').trim();
        const norm = t.toLowerCase();
        if (t && !seenNorm.has(norm)) { seenNorm.add(norm); seen.push(t); }
      });
    });
    return seen;
  }
  const refreshFeelingSuggestionsFns = [];
  function refreshAllFeelingSuggestions() {
    refreshFeelingSuggestionsFns.forEach((fn) => fn());
  }

  container.innerHTML = '';

  items.forEach(item => {
    const block = document.createElement('div');
    block.className = 'deeper-block';
    block.dataset.item = item;
    block.style.marginTop = '1.4rem';

    const itemHead = document.createElement('p');
    itemHead.style.cssText = 'font-family:var(--display);font-size:1rem;font-weight:400;margin-bottom:1rem';
    itemHead.textContent = item;
    block.appendChild(itemHead);

    const feelingWrap = document.createElement('div');
    feelingWrap.className = 'deeper-field';
    feelingWrap.style.marginBottom = '1rem';
    const feelingLbl = document.createElement('span');
    feelingLbl.style.cssText = 'font-family:var(--body);font-weight:300;font-size:var(--q-size);line-height:1.8;color:var(--muted);display:block;margin-bottom:.5rem;text-align:center;background:var(--bg2);border-radius:3px;padding:1.1rem 1.6rem';
    feelingLbl.textContent = 'How do you feel about this?';
    feelingWrap.appendChild(feelingLbl);

    // Plain (non-flex) wrapper for hint+list+add-button, so their spacing is
    // governed by normal margins instead of the .deeper-field flex gap —
    // matching every other bullet+input list on the site.
    const feelingListWrap = document.createElement('div');
    feelingWrap.appendChild(feelingListWrap);

    const feelingSuggestWrap = document.createElement('div');
    feelingSuggestWrap.className = 'acts-suggest-wrap';
    feelingListWrap.appendChild(feelingSuggestWrap);

    feelingListWrap.appendChild(createListHint(FEELING_LIST_HINT));

    if (!Array.isArray(feelings[item]) || !feelings[item].length) feelings[item] = [''];
    const feelingList = feelings[item];

    const feelingListEl = document.createElement('div');
    feelingListEl.className = 'cause-list';
    feelingListWrap.appendChild(feelingListEl);

    function buildFeelingRows() {
      feelingListEl.innerHTML = '';
      feelingList.forEach((val, i) => {
        const row = document.createElement('div');
        row.className = 'cause-item';
        const bullet = document.createElement('span');
        bullet.className = 'cause-bullet';
        bullet.textContent = '•';
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'cause-input';
        inp.value = val;
        inp.placeholder = 'e.g. Resigned, angry, at peace with it, bitter, numb, frustrated…';
        inp.addEventListener('input', () => {
          feelingList[i] = inp.value;
          feelings[item] = feelingList;
          _deeperState[feelingKey] = feelings;
          syncHidden(feelingKey, feelings);
          if (window.clearFormError) window.clearFormError();
          feelingListEl.querySelectorAll('.cause-remove').forEach(b => { b.hidden = feelingList.length === 1; });
        });
        inp.addEventListener('blur', () => { refreshAllFeelingSuggestions(); });
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            feelingList.push('');
            buildFeelingRows();
            const inputs = feelingListEl.querySelectorAll('.cause-input');
            if (inputs.length) inputs[inputs.length - 1].focus();
          }
        });
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'cause-remove';
        rm.textContent = '×';
        rm.hidden = feelingList.length === 1;
        rm.addEventListener('click', () => {
          feelingList.splice(i, 1);
          if (!feelingList.length) feelingList.push('');
          feelings[item] = feelingList;
          _deeperState[feelingKey] = feelings;
          buildFeelingRows();
          syncHidden(feelingKey, feelings);
        });
        row.appendChild(bullet); row.appendChild(inp); row.appendChild(rm);
        feelingListEl.appendChild(row);
      });
    }
    buildFeelingRows();

    const feelingAddBtn = document.createElement('button');
    feelingAddBtn.type = 'button';
    feelingAddBtn.className = 'list-add-btn';
    feelingAddBtn.textContent = '+ Add another';
    feelingAddBtn.addEventListener('click', () => {
      feelingList.push('');
      buildFeelingRows();
      const inputs = feelingListEl.querySelectorAll('.cause-input');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    feelingListWrap.appendChild(wrapListAddBtn(feelingAddBtn));

    function refreshFeelingSuggestions() {
      const already = new Set(feelingList.map((v) => (v || '').trim().toLowerCase()).filter(Boolean));
      const options = allTypedFeelings().filter((v) => !already.has(v.toLowerCase()));
      feelingSuggestWrap.innerHTML = '';
      if (!options.length) return;
      const suggestLbl = document.createElement('p');
      suggestLbl.className = 'list-hint';
      suggestLbl.textContent = 'Also applies here?';
      feelingSuggestWrap.appendChild(indentPastBullet(suggestLbl, 'indent-row-center'));
      const checks = document.createElement('div');
      checks.className = 'acts-checkboxes';
      options.forEach((opt) => {
        const rowLbl = document.createElement('label');
        rowLbl.className = 'acts-check-label';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.addEventListener('change', () => {
          if (!cb.checked) return;
          const blankIdx = feelingList.findIndex((v) => !v || !v.trim());
          if (blankIdx !== -1) feelingList[blankIdx] = opt; else feelingList.push(opt);
          feelings[item] = feelingList;
          _deeperState[feelingKey] = feelings;
          syncHidden(feelingKey, feelings);
          buildFeelingRows();
          refreshFeelingSuggestions();
        });
        const span = document.createElement('span');
        span.textContent = opt;
        rowLbl.appendChild(cb); rowLbl.appendChild(span);
        checks.appendChild(rowLbl);
      });
      feelingSuggestWrap.appendChild(indentPastBullet(checks, 'indent-row-center'));
    }
    refreshFeelingSuggestions();
    refreshFeelingSuggestionsFns.push(refreshFeelingSuggestions);

    block.appendChild(feelingWrap);

    const ynWrap = document.createElement('div');
    ynWrap.className = 'deeper-field';
    const ynLbl = document.createElement('label');
    ynLbl.style.cssText = 'font-family:var(--body);font-weight:300;font-size:var(--q-size);line-height:1.8;color:var(--muted);display:block;margin-bottom:.5rem;text-align:center';
    ynLbl.textContent = 'Is this how you want to feel about it?';
    const btns = document.createElement('div');
    btns.className = 'yn-btns';

    const confirmWrap = document.createElement('div');
    confirmWrap.className = 'deeper-field confirm-check-field';
    confirmWrap.hidden = feelingYn[item] !== 'yes';
    const confirmLbl = document.createElement('label');
    confirmLbl.className = 'confirm-note';
    confirmLbl.innerHTML = 'Before you move on: are you sure you\'re not just settling for less, or playing down how you really feel? <strong>Now is the opportunity to be honest and stand up for yourself and what you actually want in life.</strong>';
    const confirmCheckWrap = document.createElement('label');
    confirmCheckWrap.className = 'confirm-check-wrap';
    const confirmInput = document.createElement('input');
    confirmInput.type = 'checkbox';
    confirmInput.className = 'confirm-check';
    confirmInput.checked = feelingConfirm[item] === 'yes';
    const confirmBox = document.createElement('span');
    confirmBox.className = 'confirm-check-box';
    const confirmText = document.createElement('span');
    confirmText.className = 'confirm-check-text';
    confirmText.textContent = "This is genuinely how I want to feel about it";
    confirmInput.addEventListener('change', () => {
      feelingConfirm[item] = confirmInput.checked ? 'yes' : '';
      _deeperState[feelingConfirmKey] = feelingConfirm;
      syncHidden(feelingConfirmKey, feelingConfirm);
      if (window.clearFormError) window.clearFormError();
    });
    confirmCheckWrap.appendChild(confirmInput);
    confirmCheckWrap.appendChild(confirmBox);
    confirmCheckWrap.appendChild(confirmText);
    confirmCheckWrap.style.marginTop = '0';
    const confirmErr = document.createElement('p');
    confirmErr.className = 'yn-error';
    confirmErr.textContent = 'Please confirm before continuing.';
    const confirmCheckRow = indentPastBullet(confirmCheckWrap, 'indent-row-center');
    confirmCheckRow.style.marginTop = '.5rem';
    confirmWrap.appendChild(indentPastBullet(confirmLbl, 'indent-row-center'));
    confirmWrap.appendChild(confirmCheckRow);
    confirmWrap.appendChild(confirmErr);

    ['yes', 'no'].forEach(val => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'yn-btn' + (feelingYn[item] === val ? ' selected' : '');
      btn.textContent = val === 'yes' ? 'Yes' : 'No';
      btn.addEventListener('click', () => {
        btns.querySelectorAll('.yn-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        feelingYn[item] = val;
        _deeperState[feelingYnKey] = feelingYn;
        syncHidden(feelingYnKey, feelingYn);
        confirmWrap.hidden = val !== 'yes';
        if (val !== 'yes' && feelingConfirm[item]) {
          feelingConfirm[item] = '';
          _deeperState[feelingConfirmKey] = feelingConfirm;
          syncHidden(feelingConfirmKey, feelingConfirm);
          confirmInput.checked = false;
        }
        if (window.clearFormError) window.clearFormError();
      });
      btns.appendChild(btn);
    });
    ynWrap.appendChild(ynLbl);
    ynWrap.appendChild(btns);
    block.appendChild(ynWrap);
    block.appendChild(confirmWrap);

    container.appendChild(block);
  });

  const allBlocks = container.querySelectorAll('.deeper-block');
  if (allBlocks.length) { const last = allBlocks[allBlocks.length - 1]; last.style.borderBottom = 'none'; last.style.paddingBottom = '0'; }

  const h1 = document.createElement('input');
  h1.type = 'hidden'; h1.name = feelingKey; h1.value = JSON.stringify(feelings);
  container.appendChild(h1);
  const h2 = document.createElement('input');
  h2.type = 'hidden'; h2.name = feelingYnKey; h2.value = JSON.stringify(feelingYn);
  container.appendChild(h2);
  const h3 = document.createElement('input');
  h3.type = 'hidden'; h3.name = feelingConfirmKey; h3.value = JSON.stringify(feelingConfirm);
  container.appendChild(h3);
}

function renderVisionItemAchievable(key) {
  const container = document.getElementById('vision-item-achievable-' + key);
  if (!container) return;
  const vYn = _deeperState['deeper_' + key + '_vision_yn'];
  const vItems = (vYn === 'yes' || vYn === 'partially')
    ? (_deeperState['deeper_' + key + '_vision_items'] || []).filter(i => i && i.trim())
    : [];
  const achievableKey = 'deeper_' + key + '_vision_item_achievable';
  if (typeof _deeperState[achievableKey] !== 'object' || !_deeperState[achievableKey]) {
    _deeperState[achievableKey] = {};
  }
  const achievable = _deeperState[achievableKey];

  function syncHidden() {
    const h = container.querySelector('input[name="' + achievableKey + '"]');
    if (h) h.value = JSON.stringify(achievable);
  }

  container.innerHTML = '';
  vItems.forEach((item, i) => {
    const block = document.createElement('div');
    block.className = 'deeper-block';
    block.style.marginTop = '1.2rem';

    const itemHead = document.createElement('p');
    itemHead.style.cssText = 'font-family:var(--display);font-size:1rem;font-weight:400;margin-bottom:.8rem';
    itemHead.textContent = item;
    block.appendChild(itemHead);

    const btns = document.createElement('div');
    btns.className = 'yn-btns';
    [{ val: 'yes', label: 'Achievable' }, { val: 'no', label: 'Literally impossible' }].forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'yn-btn' + (achievable[i] === opt.val ? ' selected' : '');
      btn.textContent = opt.label;
      btn.addEventListener('click', () => {
        btns.querySelectorAll('.yn-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        achievable[i] = opt.val;
        _deeperState[achievableKey] = achievable;
        syncHidden();
        if (window.clearFormError) window.clearFormError();
      });
      btns.appendChild(btn);
    });
    block.appendChild(btns);
    container.appendChild(block);
  });

  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.name = achievableKey;
  hidden.value = JSON.stringify(achievable);
  container.appendChild(hidden);

  const allBlocks = container.querySelectorAll('.deeper-block');
  if (allBlocks.length) { const last = allBlocks[allBlocks.length - 1]; last.style.borderBottom = 'none'; last.style.paddingBottom = '0'; }
}

function renderVisionAchievableCheck(key) {
  const container = document.getElementById('vision-achievable-check-' + key);
  if (!container) return;
  const vYn = _deeperState['deeper_' + key + '_vision_yn'];
  const vItems = (vYn === 'yes' || vYn === 'partially')
    ? (_deeperState['deeper_' + key + '_vision_items'] || []).filter(i => i && i.trim())
    : [];
  const achievable = _deeperState['deeper_' + key + '_vision_item_achievable'] || {};
  const notAchievable = vItems.filter((_, i) => achievable[i] === 'no');
  const stillAchievable = vItems.filter((_, i) => achievable[i] !== 'no');
  const checkKey = 'deeper_' + key + '_vision_achievable_check';
  if (!_deeperState[checkKey]) _deeperState[checkKey] = '';

  function syncHidden() {
    const h = container.querySelector('input[name="' + checkKey + '"]');
    if (h) h.value = _deeperState[checkKey];
  }

  container.innerHTML = '';

  if (notAchievable.length) {
    const notAchBlock = document.createElement('div');
    notAchBlock.className = 'recap-block';
    notAchBlock.style.marginBottom = '1.4rem';
    const notAchLbl = document.createElement('p');
    notAchLbl.className = 'recap-label';
    notAchLbl.textContent = 'Not achievable — we will address these in the acceptance section:';
    notAchBlock.appendChild(notAchLbl);
    const notAchList = document.createElement('ul');
    notAchList.className = 'recap-list';
    notAchievable.forEach(item => { const li = document.createElement('li'); li.textContent = item; notAchList.appendChild(li); });
    notAchBlock.appendChild(notAchList);
    container.appendChild(notAchBlock);
  }

  if (stillAchievable.length) {
    const achBlock = document.createElement('div');
    achBlock.className = 'recap-block';
    achBlock.style.marginBottom = '1.6rem';
    const achLbl = document.createElement('p');
    achLbl.className = 'recap-label';
    achLbl.textContent = 'Your achievable vision:';
    achBlock.appendChild(achLbl);
    const achList = document.createElement('ul');
    achList.className = 'recap-list';
    stillAchievable.forEach(item => { const li = document.createElement('li'); li.textContent = item; achList.appendChild(li); });
    achBlock.appendChild(achList);
    container.appendChild(achBlock);
  }

  const allNotAchievable = vItems.length > 0 && notAchievable.length === vItems.length;

  const qWrap = document.createElement('div');
  qWrap.className = 'deeper-field yn-field vision-achievable-check-field';

  const qLbl = document.createElement('label');
  qLbl.textContent = allNotAchievable
    ? 'None of your vision points are achievable as stated — what would you like to do?'
    : 'Is this still a vision worth working towards?';
  qWrap.appendChild(qLbl);

  const btns = document.createElement('div');
  btns.className = 'yn-btns';
  btns.style.flexWrap = 'wrap';
  const options = allNotAchievable
    ? [{ val: 'revise', label: "I'd like to revise it" }, { val: 'unknown after vision was rejected as not achievable', label: "I don't know what my vision is" }]
    : [
        { val: 'yes', label: vYn === 'partially' ? 'Yes, this is my partial vision' : 'Yes, this is still my full vision' },
        ...(vYn === 'yes' ? [{ val: 'partial', label: 'This is my partial vision for now' }] : []),
        { val: 'revise', label: "I'd like to add to or revise it" },
      ];
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'yn-btn' + (_deeperState[checkKey] === opt.val ? ' selected' : '');
    btn.textContent = opt.label;
    btn.addEventListener('click', () => {
      btns.querySelectorAll('.yn-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      _deeperState[checkKey] = opt.val;
      syncHidden();
      if (window.clearFormError) window.clearFormError();
    });
    btns.appendChild(btn);
  });
  qWrap.appendChild(btns);

  const err = document.createElement('p');
  err.className = 'yn-error';
  qWrap.appendChild(err);

  container.appendChild(qWrap);

  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.name = checkKey;
  hidden.value = _deeperState[checkKey];
  container.appendChild(hidden);
}

function renderVisionCommitment(key) {
  const el = document.getElementById('vision-commitment-recap-' + key);
  if (!el) return;
  const isRevised = _deeperState['deeper_' + key + '_vision_achievable_check'] === 'revise';
  let items;
  if (isRevised) {
    items = (_deeperState['deeper_' + key + '_vision_revised_items'] || []).filter(i => i && i.trim());
  } else {
    const vYn = _deeperState['deeper_' + key + '_vision_yn'];
    const vItems = (vYn === 'yes' || vYn === 'partially')
      ? (_deeperState['deeper_' + key + '_vision_items'] || []).filter(i => i && i.trim())
      : [];
    const achievable = _deeperState['deeper_' + key + '_vision_item_achievable'] || {};
    items = vItems.filter((_, i) => achievable[i] !== 'no');
  }
  if (!items.length) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = '';
  const lbl = document.createElement('p');
  lbl.className = 'recap-label';
  lbl.textContent = 'Your vision:';
  el.appendChild(lbl);
  const ul = document.createElement('ul');
  ul.className = 'recap-list';
  items.forEach(item => { const li = document.createElement('li'); li.textContent = item; ul.appendChild(li); });
  el.appendChild(ul);
}

function renderVisionRevised(key) {
  const container = document.getElementById('vision-revised-' + key);
  if (!container) return;
  const revisedKey = 'deeper_' + key + '_vision_revised_items';

  const vYn = _deeperState['deeper_' + key + '_vision_yn'];
  const vItems = (vYn === 'yes' || vYn === 'partially')
    ? (_deeperState['deeper_' + key + '_vision_items'] || []).filter(i => i && i.trim())
    : [];
  const achievable = _deeperState['deeper_' + key + '_vision_item_achievable'] || {};
  const stillAchievable = vItems.filter((_, i) => achievable[i] !== 'no');
  _deeperState[revisedKey] = stillAchievable.length ? [...stillAchievable] : [''];

  renderSimpleBulletList('vision-revised-' + key, revisedKey, 'Describe your revised vision…', null, undefined, VISION_LIST_HINT);
}

function renderVisionRevisedCompleteness(key) {
  const container = document.getElementById('vision-revised-completeness-' + key);
  if (!container) return;
  container.innerHTML = '';

  const vYn = _deeperState['deeper_' + key + '_vision_yn'];
  if (vYn !== 'yes') return; // only meaningful if they originally claimed full awareness

  const stateKey = 'deeper_' + key + '_completeness_yn';

  const field = document.createElement('div');
  field.className = 'deeper-field yn-field';
  field.dataset.key = key;
  field.dataset.role = 'completeness';

  const lbl = document.createElement('label');
  lbl.textContent = "Now that you've revised it, is this your full vision, or is it partial?";
  field.appendChild(lbl);

  const btns = document.createElement('div');
  btns.className = 'yn-btns';
  [{ val: 'full', label: 'This is my full vision' }, { val: 'partial', label: 'This is my partial vision' }].forEach(opt => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'yn-btn' + (_deeperState[stateKey] === opt.val ? ' selected' : '');
    btn.textContent = opt.label;
    btn.addEventListener('click', () => {
      btns.querySelectorAll('.yn-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      _deeperState[stateKey] = opt.val;
      if (window.clearFormError) window.clearFormError();
    });
    btns.appendChild(btn);
  });
  field.appendChild(btns);

  const err = document.createElement('p');
  err.className = 'yn-error';
  field.appendChild(err);

  container.appendChild(field);
}

/* ---- Step 5: Deeper questions per focus area ---- */
function initDeeperStep() {
  const container = document.getElementById('deeper-questions');

  // Save state before re-rendering
  container.querySelectorAll('textarea').forEach(ta => {
    if (ta.name && ta.value) _deeperState[ta.name] = ta.value;
  });
  container.querySelectorAll('.yn-btn.selected').forEach(btn => {
    const field = btn.closest('.yn-field');
    if (!field) return;
    const key = field.dataset.key;
    const role = field.dataset.role || 'own';
    _deeperState[`deeper_${key}_${role}_yn`] = btn.dataset.val;
  });
  container.querySelectorAll('.vision-actual-field').forEach(field => {
    const check = field.querySelector('.vision-actual-check');
    if (check?.checked) _deeperState[`deeper_${field.dataset.key}_vision_actual_yn`] = 'yes';
  });

  const selectedKeys = [...document.querySelectorAll('#focus-hidden-inputs input')].map(i => i.value);
  const wheel = getWheelValues();
  const areaMap = Object.fromEntries(AREAS.map(([key, label, desc]) => [key, { label, desc }]));
  const wheelMap = Object.fromEntries(wheel.map(a => [a.key, a]));

  // Sub-pages: 5 per area
  const qtypes = ['cause', 'vision', 'vision-describe', 'vision-item-achievable', 'vision-achievable-check', 'vision-revised', 'vision-commitment', 'acts-list', 'acts-values', 'control', 'control-attitude'];
  const allSubPages = selectedKeys.flatMap(key => qtypes.map(qtype => ({ key, qtype })));

  container.innerHTML = selectedKeys.flatMap(key => {
    const { label, desc } = areaMap[key] || { label: key, desc: '' };
    const labelHtml = ampSafe(label);
    const data = wheelMap[key] || {};
    const q3Toggle = `Are you consciously aware of what your 5/5 in ${labelHtml} would look like?`;
    const q3Expand = `Describe the version of this area that would feel fully alive…`;
    const controlYn      = _deeperState[`deeper_${key}_control_yn`] || '';
    const controlItems   = _deeperState[`deeper_${key}_control_items`] || [];
    const visionYn       = _deeperState[`deeper_${key}_vision_yn`] || '';
    const visionItems    = _deeperState[`deeper_${key}_vision_items`] || [];
    const commitmentYn   = _deeperState[`deeper_${key}_commitment_yn`] || '';
    const visionActualYn  = _deeperState[`deeper_${key}_vision_actual_yn`] || '';
    return [
      `<div class="deeper-subpage" id="deeper-sub-${key}-cause" data-area="${label}" hidden>
        <h3 class="deeper-page-title" style="font-size:clamp(1.3rem,2.4vw,1.7rem);margin:.2rem 0 .7rem">What's the Matter?</h3>
        <div class="deeper-field">
          <label>Why does ${labelHtml} only feel like a ${data.fulfillment}/5 right now?</label>
          <div id="cause-list-${key}"></div>
        </div>
      </div>`,
      `<div class="deeper-subpage" id="deeper-sub-${key}-vision" data-area="${label}" hidden>
        <h3 class="deeper-page-title" style="font-size:clamp(1.3rem,2.4vw,1.7rem);margin:.2rem 0 .7rem">Vision</h3>
        <div class="deeper-field yn-field" data-key="${key}" data-role="vision">
          <label>${q3Toggle}</label>
          <div class="yn-btns">
            <button type="button" class="yn-btn${visionYn === 'yes'       ? ' selected' : ''}" data-val="yes">Yes</button>
            <button type="button" class="yn-btn${visionYn === 'partially' ? ' selected' : ''}" data-val="partially">Partially</button>
            <button type="button" class="yn-btn${visionYn === 'no'        ? ' selected' : ''}" data-val="no">Not yet</button>
          </div>
          <p class="yn-error">Please select one.</p>
        </div>
      </div>`,
      `<div class="deeper-subpage" id="deeper-sub-${key}-vision-describe" data-area="${label}" hidden>
        <h3 class="deeper-page-title" style="font-size:clamp(1.3rem,2.4vw,1.7rem);margin:.2rem 0 .7rem">Vision</h3>
        <div class="deeper-field">
          <label>Describe what your 5/5 in ${labelHtml} would look like.</label>
          <div class="yn-expand">
            <div id="vision-list-${key}" data-placeholder="${q3Expand}" style="margin-top:.9rem"></div>
            <div class="values-reveal" ${visionItems.filter(i => i && i.trim()).length ? '' : 'hidden'}>
              <div class="deeper-field vision-actual-field" data-key="${key}">
                <div class="indent-row-center">
                  <span class="cause-bullet" style="visibility:hidden">•</span>
                  <label class="confirm-note">Are you sure you <strong>ACTUALLY WANT THESE?</strong> Or are these things you think you're <strong>SUPPOSED TO</strong> want, or <strong>WOULD LIKE TO</strong> want, but don't really?</label>
                </div>
                <div class="indent-row-center" style="margin-top:.5rem">
                  <span class="cause-bullet" style="visibility:hidden">•</span>
                  <label class="confirm-check-wrap" style="margin-top:0">
                    <input type="checkbox" class="confirm-check vision-actual-check" name="deeper_${key}_vision_actual" value="yes" ${visionActualYn === 'yes' ? 'checked' : ''}>
                    <span class="confirm-check-box"></span>
                    <span class="confirm-check-text">I genuinely want these</span>
                  </label>
                </div>
                <p class="yn-error">Please confirm before continuing.</p>
              </div>
            </div>
          </div>
        </div>
      </div>`,
      `<div class="deeper-subpage" id="deeper-sub-${key}-vision-item-achievable" data-area="${label}" hidden>
        <h3 class="deeper-page-title" style="font-size:clamp(1.3rem,2.4vw,1.7rem);margin:.2rem 0 .7rem">Vision</h3>
        <div class="deeper-field vision-achievable-field">
          <label>For each point in your vision, is it theoretically achievable?</label>
          <div id="vision-item-achievable-${key}" style="margin-top:.9rem"></div>
        </div>
      </div>`,
      `<div class="deeper-subpage" id="deeper-sub-${key}-vision-achievable-check" data-area="${label}" hidden>
        <h3 class="deeper-page-title" style="font-size:clamp(1.3rem,2.4vw,1.7rem);margin:.2rem 0 .7rem">Vision</h3>
        <div id="vision-achievable-check-${key}"></div>
      </div>`,
      `<div class="deeper-subpage" id="deeper-sub-${key}-vision-revised" data-area="${label}" hidden>
        <h3 class="deeper-page-title" style="font-size:clamp(1.3rem,2.4vw,1.7rem);margin:.2rem 0 .7rem">Vision</h3>
        <div class="deeper-field">
          <label>Create your revised vision — only things that are theoretically achievable.</label>
          <div id="vision-revised-${key}" style="margin-top:.9rem"></div>
        </div>
        <div id="vision-revised-completeness-${key}" style="margin-top:1.4rem"></div>
      </div>`,
      `<div class="deeper-subpage" id="deeper-sub-${key}-vision-commitment" data-area="${label}" hidden>
        <h3 class="deeper-page-title" style="font-size:clamp(1.3rem,2.4vw,1.7rem);margin:.2rem 0 .7rem">Conviction</h3>
        <div id="vision-commitment-recap-${key}" class="recap-block" style="margin-bottom:1.6rem" hidden></div>
        <div class="deeper-field yn-field" data-key="${key}" data-role="commitment">
          <label><strong>WILL</strong> you achieve this?</label>
          <div class="yn-btns">
            <button type="button" class="yn-btn${commitmentYn === 'certain'  ? ' selected' : ''}" data-val="certain">There is no other way</button>
            <button type="button" class="yn-btn${commitmentYn === 'doubtful' ? ' selected' : ''}" data-val="doubtful">I have doubts</button>
          </div>
          <p class="yn-error">Please select one.</p>
        </div>
      </div>`,
      `<div class="deeper-subpage" id="deeper-sub-${key}-acts-list" data-area="${label}" hidden>
        <h3 class="deeper-page-title" style="font-size:clamp(1.3rem,2.4vw,1.7rem);margin:.2rem 0 .7rem">Your Contribution</h3>
        <div id="recap-causes-${key}-acts-list" data-label="Why ${label} feels like a ${data.fulfillment}/5" class="recap-block" hidden></div>
        <div class="deeper-field">
          <label>How are you contributing to this?</label>
          <div id="acts-items-${key}" style="margin-top:.5rem"></div>
        </div>
        <div id="acts-confirm-${key}" style="margin-top:1.2rem" hidden></div>
      </div>`,
      `<div class="deeper-subpage" id="deeper-sub-${key}-acts-values" data-area="${label}" hidden>
        <h3 class="deeper-page-title" style="font-size:clamp(1.3rem,2.4vw,1.7rem);margin:.2rem 0 .7rem">Hidden Values</h3>
        <div id="recap-acts-${key}" data-label="How you are contributing to this" class="recap-block" hidden></div>
        <div class="deeper-field">
          <label>If you're brutally honest with yourself, which values might you have that you are serving with these actions/inactions?</label>
          <div id="acts-value-groups-${key}" style="margin-top:.9rem"></div>
        </div>
      </div>`,
      `<div class="deeper-subpage" id="deeper-sub-${key}-control" data-area="${label}" hidden>
        <h3 class="deeper-page-title" style="font-size:clamp(1.3rem,2.4vw,1.7rem);margin:.2rem 0 .7rem">Acceptance</h3>
        <div id="recap-causes-${key}-control" data-label="Why ${label} feels like a ${data.fulfillment}/5" class="recap-block" hidden></div>
        <div id="recap-not-achievable-${key}" class="recap-block" style="margin-bottom:1.4rem" hidden></div>
        <div class="deeper-field yn-field" data-key="${key}" data-role="control">
          <label>Is there anything about the above that you cannot change and must therefore accept?</label>
          <div class="yn-btns">
            <button type="button" class="yn-btn${controlYn === 'yes' ? ' selected' : ''}" data-val="yes">Yes</button>
            <button type="button" class="yn-btn${controlYn === 'no'  ? ' selected' : ''}" data-val="no">No</button>
          </div>
          <p class="yn-error">Please select one.</p>
          <div class="yn-expand" ${controlYn !== 'yes' ? 'hidden' : ''}>
            <div id="control-list-${key}" style="margin-top:.9rem"></div>
          </div>
        </div>
      </div>`,
      `<div class="deeper-subpage" id="deeper-sub-${key}-control-attitude" data-area="${label}" hidden>
        <h3 class="deeper-page-title" style="font-size:clamp(1.3rem,2.4vw,1.7rem);margin:.2rem 0 .7rem">Acceptance</h3>
        <div id="control-attitude-${key}"></div>
      </div>`,
    ];
  }).join('');

  // Sub-page navigation
  function fillRecapBlock(el, items) {
    if (!el || !items.length) { if (el) el.hidden = true; return; }
    el.hidden = false;
    const lbl = el.dataset.label || '';
    el.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'recap-label';
    p.textContent = lbl;
    el.appendChild(p);
    const ul = document.createElement('ul');
    ul.className = 'recap-list';
    items.forEach(item => { const li = document.createElement('li'); li.textContent = item; ul.appendChild(li); });
    el.appendChild(ul);
  }

  function showDeeperSubPage(idx, direction = 1) {
    if (idx >= allSubPages.length) { window.advanceMainStep?.(); return; }
    if (idx < 0) return;
    const sp = allSubPages[idx];
    if (sp.qtype === 'control-attitude' && _deeperState['deeper_' + sp.key + '_control_yn'] !== 'yes') {
      showDeeperSubPage(idx + direction, direction);
      return;
    }
    if (sp.qtype === 'acts-values') {
      const isNothing = !!_deeperState['deeper_' + sp.key + '_acts_raw_nothing'];
      const items = isNothing ? [] : (_deeperState['deeper_' + sp.key + '_acts_raw_items'] || []).filter(i => i && i.trim());
      if (!items.length) {
        showDeeperSubPage(idx + direction, direction);
        return;
      }
      renderActsItemValues(sp.key);
    }
    if (sp.qtype === 'vision-describe') {
      const vYn = _deeperState['deeper_' + sp.key + '_vision_yn'];
      if (vYn !== 'yes' && vYn !== 'partially') {
        showDeeperSubPage(idx + direction, direction);
        return;
      }
      const vDescribeEl = document.getElementById('deeper-sub-' + sp.key + '-vision-describe');
      const vDescribeLbl = vDescribeEl?.querySelector('.deeper-field > label');
      const vDescribeArea = (areaMap[sp.key] || {}).label || sp.key;
      if (vDescribeLbl) vDescribeLbl.textContent = vYn === 'yes'
        ? 'Describe what your 5/5 in ' + vDescribeArea + ' would look like.'
        : 'Describe what you know about your 5/5 in ' + vDescribeArea + ' so far.';
    }
    if (sp.qtype === 'vision-item-achievable') {
      const vYn = _deeperState['deeper_' + sp.key + '_vision_yn'];
      const vActual = _deeperState['deeper_' + sp.key + '_vision_actual_yn'];
      const vItems = (_deeperState['deeper_' + sp.key + '_vision_items'] || []).filter(i => i && i.trim());
      if ((vYn !== 'yes' && vYn !== 'partially') || !vItems.length || vActual !== 'yes') {
        showDeeperSubPage(idx + direction, direction);
        return;
      }
    }
    if (sp.qtype === 'vision-achievable-check') {
      const vYn = _deeperState['deeper_' + sp.key + '_vision_yn'];
      const vItems = (vYn === 'yes' || vYn === 'partially')
        ? (_deeperState['deeper_' + sp.key + '_vision_items'] || []).filter(i => i && i.trim())
        : [];
      const achievable = _deeperState['deeper_' + sp.key + '_vision_item_achievable'] || {};
      const hasNotAchievable = vItems.some((_, i) => achievable[i] === 'no');
      if (!hasNotAchievable) {
        _deeperState['deeper_' + sp.key + '_vision_achievable_check'] = '';
        showDeeperSubPage(idx + direction, direction);
        return;
      }
    }
    if (sp.qtype === 'vision-revised') {
      if (_deeperState['deeper_' + sp.key + '_vision_achievable_check'] !== 'revise') {
        showDeeperSubPage(idx + direction, direction);
        return;
      }
    }
    if (sp.qtype === 'vision-commitment') {
      const vYn = _deeperState['deeper_' + sp.key + '_vision_yn'];
      const vActual = _deeperState['deeper_' + sp.key + '_vision_actual_yn'];
      const vItems = (_deeperState['deeper_' + sp.key + '_vision_items'] || []).filter(i => i && i.trim());
      const achievableCheck = _deeperState['deeper_' + sp.key + '_vision_achievable_check'];
      if ((vYn !== 'yes' && vYn !== 'partially') || !vItems.length || vActual !== 'yes' || achievableCheck === 'unknown after vision was rejected as not achievable') {
        showDeeperSubPage(idx + direction, direction);
        return;
      }
    }
    container.querySelectorAll('.deeper-subpage').forEach((el, i) => { el.hidden = i !== idx; });
    window._deeperSubPageIdx = idx;
    if (window.updateAssessmentProgress) window.updateAssessmentProgress();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (!window._historyNav) history.pushState({ step: 4, sub: idx }, '');
    const { key, qtype } = sp;
    const causes = (_deeperState['deeper_' + key + '_causes'] || []).filter(c => c && c.trim());
    if (qtype === 'acts-list' || qtype === 'control') {
      fillRecapBlock(document.getElementById('recap-causes-' + key + '-' + qtype), causes);
    }
    if (qtype === 'acts-values') {
      const actsItems = (_deeperState['deeper_' + key + '_acts_items'] || []).filter(i => i && i.trim());
      fillRecapBlock(document.getElementById('recap-acts-' + key), actsItems);
    }
    if (qtype === 'control') {
      const controlItemsKey = 'deeper_' + key + '_control_items';

      const vYn = _deeperState['deeper_' + key + '_vision_yn'];
      const vItems = (vYn === 'yes' || vYn === 'partially')
        ? (_deeperState['deeper_' + key + '_vision_items'] || []).filter(i => i && i.trim())
        : [];
      const achievable    = _deeperState['deeper_' + key + '_vision_item_achievable'] || {};
      const notAchievable = vItems.filter((_, i) => achievable[i] === 'no');

      const recapEl = document.getElementById('recap-not-achievable-' + key);
      if (recapEl) {
        if (notAchievable.length) {
          recapEl.hidden = false;
          recapEl.innerHTML = '';
          const lbl = document.createElement('p');
          lbl.className = 'recap-label';
          lbl.textContent = 'From your vision — not achievable:';
          recapEl.appendChild(lbl);
          const ul = document.createElement('ul');
          ul.className = 'recap-list';
          notAchievable.forEach(item => { const li = document.createElement('li'); li.textContent = item; ul.appendChild(li); });
          recapEl.appendChild(ul);
        } else {
          recapEl.hidden = true;
        }
      }

      renderControlList(key);

      const subEl   = document.getElementById('deeper-sub-' + key + '-control');
      const ynField = subEl?.querySelector('.yn-field');
      const expand  = subEl?.querySelector('.yn-expand');
      const ynBtns  = ynField?.querySelector('.yn-btns');
      const ynErr   = ynField?.querySelector('.yn-error');
      const ynLabel = ynField?.querySelector('label');

      if (notAchievable.length) {
        if (ynLabel) ynLabel.textContent = 'Based on the above, what realities must you accept?';
        if (ynBtns) ynBtns.hidden = true;
        if (ynErr)  ynErr.hidden  = true;
        if (ynField) ynField.dataset.noValidate = '1';
        _deeperState['deeper_' + key + '_control_yn'] = 'yes';
        if (expand) expand.hidden = false;
      } else {
        if (ynLabel) ynLabel.textContent = 'Is there anything about the above that you cannot change and must therefore accept?';
        if (ynBtns) ynBtns.hidden = false;
        if (ynErr)  ynErr.hidden  = false;
        if (ynField) delete ynField.dataset.noValidate;
        const remaining = (_deeperState[controlItemsKey] || []).filter(i => i && i.trim());
        if (_deeperState['deeper_' + key + '_control_yn'] === 'yes' && !remaining.length) {
          _deeperState['deeper_' + key + '_control_yn'] = '';
          ynBtns?.querySelectorAll('.yn-btn').forEach(b => b.classList.remove('selected'));
        }
        if (expand) expand.hidden = _deeperState['deeper_' + key + '_control_yn'] !== 'yes';
      }
    }
    if (qtype === 'control-attitude') {
      renderControlAttitude(key);
    }
    if (qtype === 'vision-item-achievable') {
      renderVisionItemAchievable(key);
    }
    if (qtype === 'vision-achievable-check') {
      renderVisionAchievableCheck(key);
    }
    if (qtype === 'vision-revised') {
      renderVisionRevised(key);
      renderVisionRevisedCompleteness(key);
    }
    if (qtype === 'vision-commitment') {
      renderVisionCommitment(key);
    }
  }
  window._deeperSubPageCount = allSubPages.length;
  window._deeperSubPageIdx = 0;
  window._showDeeperSubPage = showDeeperSubPage;
  showDeeperSubPage(0);

  selectedKeys.forEach(k => { renderCauseList(k); renderSimpleBulletList('acts-items-' + k, 'deeper_' + k + '_acts_raw_items', 'Describe what you are doing, or could be doing…', 'deeper_' + k + '_acts_raw_nothing', undefined, GENERIC_LIST_HINT); renderActsConfirm(k); renderActsGroups(k); renderControlList(k); renderControlAttitude(k); renderVisionList(k); });

  // Wire up yn-field toggles
  container.querySelectorAll('.yn-field').forEach(field => {
    const key = field.dataset.key;
    const role = field.dataset.role;
    const stateKey = `deeper_${key}_${role}_yn`;
    const expand = field.querySelector('.yn-expand');
    const textareas = expand ? expand.querySelectorAll('textarea') : [];
    const error = field.querySelector('.yn-error');
    const expandOn = role === 'vision' ? (val) => val === 'yes' || val === 'partially' : (val) => val === 'yes';
    field.querySelectorAll('.yn-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        field.querySelectorAll('.yn-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const val = btn.dataset.val;
        _deeperState[stateKey] = val;
        if (expand) expand.hidden = !expandOn(val);
        textareas.forEach(ta => { ta.required = expandOn(val); });
        error.classList.remove('visible');
      });
    });
  });

  // Persist textarea values
  container.querySelectorAll('textarea').forEach(ta => {
    ta.addEventListener('input', () => { _deeperState[ta.name] = ta.value; });
  });

  // Per-sub-page validation
  window._validateDeeperSubPage = function(idx) {
    const sp = allSubPages[idx];
    if (!sp) return true;
    const { key, qtype } = sp;
    const subEl = document.getElementById('deeper-sub-' + key + '-' + qtype);
    if (!subEl) return true;
    clearFormErr();

    const unansweredYn = [...subEl.querySelectorAll('.yn-field')].find(f => !f.dataset.noValidate && !f.querySelector('.yn-btn.selected'));
    if (unansweredYn) {
      setFormErr('Please select an answer before continuing.', unansweredYn);
      return false;
    }

    if (qtype === 'cause') {
      const causes = (_deeperState['deeper_' + key + '_causes'] || []).filter(c => c && c.trim());
      if (!causes.length) {
        setFormErr('Please add at least one reason before continuing.', document.getElementById('cause-list-' + key));
        return false;
      }
    }

    if (qtype === 'control' && _deeperState['deeper_' + key + '_control_yn'] === 'no') {
      const isNothing = !!_deeperState['deeper_' + key + '_acts_raw_nothing'];
      const items = isNothing ? [] : (_deeperState['deeper_' + key + '_acts_raw_items'] || []).filter(i => i && i.trim());
      if (!items.length) {
        setFormErr("Hold on — your situation has to consist of things you're contributing to, things that are outside your control and must be accepted, or both. There is no situation in which it's neither. Please go back and reconsider one of your answers.");
        return false;
      }
    }

    if (qtype === 'control' && _deeperState['deeper_' + key + '_control_yn'] === 'yes') {
      const filledItems = (_deeperState['deeper_' + key + '_control_items'] || []).filter(i => i && i.trim());
      if (!filledItems.length) {
        setFormErr('Please add at least one circumstance before continuing.', document.getElementById('control-list-' + key));
        return false;
      }
    }

    if (qtype === 'control-attitude') {
      const filledItems     = (_deeperState['deeper_' + key + '_control_items'] || []).filter(i => i && i.trim());
      const feelings        = _deeperState['deeper_' + key + '_control_feeling'] || {};
      const feelingYn       = _deeperState['deeper_' + key + '_control_feeling_yn'] || {};
      const feelingConfirm  = _deeperState['deeper_' + key + '_control_feeling_confirm'] || {};
      const attEl = document.getElementById('control-attitude-' + key);
      const itemBlock = (it) => [...(attEl?.querySelectorAll('.deeper-block') || [])].find(b => b.dataset.item === it) || attEl;
      for (const item of filledItems) {
        if (!(Array.isArray(feelings[item]) && feelings[item].some(f => f && f.trim()))) {
          setFormErr('Please describe how you feel about each circumstance before continuing.', itemBlock(item));
          return false;
        }
        if (!feelingYn[item]) {
          setFormErr('Please answer whether this is how you want to feel before continuing.', itemBlock(item));
          return false;
        }
        if (feelingYn[item] === 'yes' && feelingConfirm[item] !== 'yes') {
          setFormErr('Please confirm before continuing.', itemBlock(item));
          return false;
        }
      }
    }

    if (qtype === 'acts-list') {
      const items     = (_deeperState['deeper_' + key + '_acts_raw_items'] || []).filter(i => i && i.trim());
      const isNothing = !!_deeperState['deeper_' + key + '_acts_raw_nothing'];
      if (!items.length && !isNothing) {
        setFormErr('Please add at least one item or select "Nothing".', document.getElementById('acts-items-' + key));
        return false;
      }
      if (!_deeperState['deeper_' + key + '_acts_confirm']) {
        _deeperState['deeper_' + key + '_acts_confirm_shown'] = true;
        renderActsConfirm(key);
        return false;
      }
    }

    if (qtype === 'acts-values') {
      const filledItems = (_deeperState['deeper_' + key + '_acts_items'] || []).filter(i => i && i.trim());
      const valuesByItem = _deeperState['deeper_' + key + '_acts_values_by_item'] || {};
      const allCovered = filledItems.every(item =>
        Array.isArray(valuesByItem[item]) && valuesByItem[item].some(v => v && v.trim())
      );
      if (!allCovered) {
        setFormErr('Every action needs at least one value attributed to it before continuing.', document.getElementById('acts-value-groups-' + key));
        return false;
      }
    }

    if (qtype === 'vision-describe') {
      const yn = _deeperState['deeper_' + key + '_vision_yn'];
      if (yn === 'yes' || yn === 'partially') {
        const vItems = (_deeperState['deeper_' + key + '_vision_items'] || []).filter(i => i && i.trim());
        if (!vItems.length) {
          setFormErr('Please describe what it would take before continuing.', document.getElementById('vision-list-' + key));
          return false;
        }
      }
      const unchecked = [...subEl.querySelectorAll('.vision-actual-field')].find(f => !f.closest('[hidden]') && !f.querySelector('.vision-actual-check')?.checked);
      if (unchecked) {
        setFormErr('Please confirm before continuing.', unchecked);
        return false;
      }
    }

    if (qtype === 'vision-item-achievable') {
      const vYn = _deeperState['deeper_' + key + '_vision_yn'];
      const vItems = (vYn === 'yes' || vYn === 'partially')
        ? (_deeperState['deeper_' + key + '_vision_items'] || []).filter(i => i && i.trim())
        : [];
      const achievable = _deeperState['deeper_' + key + '_vision_item_achievable'] || {};
      if (vItems.some((_, i) => !achievable[i])) {
        setFormErr('Please mark each point as achievable or not before continuing.', document.getElementById('vision-item-achievable-' + key));
        return false;
      }
    }

    if (qtype === 'vision-achievable-check') {
      if (!_deeperState['deeper_' + key + '_vision_achievable_check']) {
        setFormErr('Please answer before continuing.', document.getElementById('vision-achievable-check-' + key));
        return false;
      }
    }

    if (qtype === 'vision-revised') {
      const revised = (_deeperState['deeper_' + key + '_vision_revised_items'] || []).filter(i => i && i.trim());
      if (!revised.length) {
        setFormErr('Please describe your revised vision before continuing.', document.getElementById('vision-revised-' + key));
        return false;
      }
    }

    if (qtype === 'vision-commitment') {
      if (!_deeperState['deeper_' + key + '_commitment_yn']) {
        setFormErr('Please select one before continuing.', document.getElementById('deeper-sub-' + key + '-vision-commitment'));
        return false;
      }
    }

    for (const f of subEl.querySelectorAll('textarea[required]')) {
      if (!f.reportValidity()) return false;
    }
    return true;
  };

  window._validateDeeper = function() {
    return window._validateDeeperSubPage(window._deeperSubPageIdx);
  };
}

/* ---- Step 6: Fit Signals ---- */
function initFitSignalsStep() {
  const container = document.getElementById('fit-signals-container');
  if (!container) return;

  const questions = [
    { id: 'q2', type: 'singleselect', headline: 'Readiness', title: 'Capacity',
      label: 'Do you feel like you have the mental and emotional capacity to tackle your challenges and create change right now?',
      options: ['Yes, whatever it takes', 'Yes, but I need to go easy on myself', "No, I'm exhausted"],
      followup: { triggerValue: "No, I'm exhausted", label: 'What do you think you need right now?', stateKey: 'fs_q2_needs' } },
    { id: 'q3', type: 'multiselect', headline: 'Inner state', title: 'Symptoms',
      label: 'Do you struggle with any of these on a regular basis?',
      options: ['Anxiety', 'Depression', 'PTSD', 'Apathy', 'Anger or resentment', 'Frustration or pressure', 'Meaninglessness', 'Panic attacks', 'Hypochondria', 'Insomnia', 'Other', 'None'],
      other: 'Other', none: 'None' },
    { id: 'q4', type: 'multiselect', headline: 'Compulsive patterns', title: 'Coping',
      label: 'Do you struggle with any addictions or compulsive habits?',
      options: ['Alcohol', 'Drugs', 'Pharmaceuticals', 'Pornography', 'Gambling', 'Social media', 'Gaming', 'Food', 'Other', 'None'],
      other: 'Other', none: 'None' },
    { id: 'q5l', type: 'multiselect', headline: 'Lifestyle', title: 'Lifestyle',
      label: 'Which of the following do you struggle to maintain consistently?',
      options: ['Sleep', 'Exercise', 'Healthy eating', 'Social connection', 'Time outdoors', 'Downtime / switching off', 'Hobbies or creative outlets', 'Other', 'None'],
      other: 'Other', none: 'None' },
    { id: 'q5', type: 'scale5', headline: 'The mainstream', title: 'Personality',
      label: 'How do you feel when you imagine living the life of mainstream society — a steady job, a mortgage, blending in?',
      low: "Can't think of anything worse", high: "It's exactly what I want" },
    { id: 'q6', type: 'track-record', headline: 'Track record', title: 'Attempts',
      label: 'What have you tried in the past to deal with your situation(s)?' },
    { id: 'q7', type: 'singleselect', headline: 'The stakes', title: 'Commitment',
      label: 'If your life looks exactly the same in 3 years from now, how would you feel?',
      options: ["I'd be fine with it", "Disappointing, but I'd manage", "Like I'd wasted something important", "Unacceptable — it cannot happen"] },
    { id: 'q9', type: 'singleselect', headline: 'Coaching Ambitions', title: 'Coaching Ambitions',
      label: 'Are you or do you have any ambitions of working as a coach yourself?',
      options: ['Yes', 'Maybe', 'No'] },
    { id: 'q8', type: 'textarea', optional: true, headline: 'Anything else', title: 'Anything else?',
      label: "Is there anything else you'd like to share that wasn't addressed in this assessment?",
      placeholder: 'Optional — write as much or as little as you like.' },
  ];

  container.innerHTML = '';

  questions.forEach(q => {
    const page = document.createElement('div');
    page.className = 'deeper-subpage';
    page.id = 'fs-sub-' + q.id;
    page.hidden = true;

    page.dataset.area = q.headline;

    const qTitle = document.createElement('h3');
    qTitle.className = 'deeper-page-title';
    qTitle.style.cssText = 'font-size:clamp(1.3rem,2.4vw,1.7rem);margin:.2rem 0 .7rem';
    qTitle.textContent = q.title;
    page.appendChild(qTitle);

    const qlbl = document.createElement('p');
    qlbl.className = 'fulfillment-area-desc';
    qlbl.textContent = q.label;
    page.appendChild(qlbl);

    if (q.note) {
      const qnote = document.createElement('p');
      qnote.className = 'guide-text';
      qnote.style.marginTop = '0.75rem';
      qnote.textContent = q.note;
      page.appendChild(qnote);
    }

    if (q.bullets) {
      const qpoints = document.createElement('ul');
      qpoints.className = 'guide-points';
      qpoints.style.marginTop = '0.9rem';
      q.bullets.forEach(b => {
        const li = document.createElement('li');
        li.textContent = b;
        qpoints.appendChild(li);
      });
      page.appendChild(qpoints);
    }

    const field = document.createElement('div');
    field.className = 'deeper-field';

    if (q.type === 'yesno') {
      const btns = document.createElement('div');
      btns.className = 'yn-btns';

      let followupEl = null;
      if (q.followup) {
        followupEl = document.createElement('div');
        followupEl.hidden = _fsState['fs_' + q.id] !== 'yes';
        followupEl.style.marginTop = '1.4rem';
        const fLbl = document.createElement('label');
        fLbl.style.cssText = 'font-family:var(--body);font-weight:300;font-size:var(--q-size);line-height:1.8;color:var(--muted);display:block;margin-bottom:.7rem;text-align:center;background:var(--bg2);border-radius:3px;padding:1.1rem 1.6rem';
        fLbl.textContent = q.followup.label;
        const fBtns = document.createElement('div');
        fBtns.className = 'yn-btns';
        fBtns.style.flexWrap = 'wrap';
        q.followup.options.forEach(opt => {
          const fb = document.createElement('button');
          fb.type = 'button';
          fb.className = 'yn-btn' + (_fsState[q.followup.stateKey] === opt ? ' selected' : '');
          fb.textContent = opt;
          fb.addEventListener('click', () => {
            fBtns.querySelectorAll('.yn-btn').forEach(b => b.classList.remove('selected'));
            fb.classList.add('selected');
            _fsState[q.followup.stateKey] = opt;
            if (window.clearFormError) window.clearFormError();
          });
          fBtns.appendChild(fb);
        });
        followupEl.appendChild(fLbl);
        followupEl.appendChild(fBtns);
      }

      ['yes', 'no'].forEach(val => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'yn-btn' + (_fsState['fs_' + q.id] === val ? ' selected' : '');
        btn.textContent = val === 'yes' ? 'Yes' : 'No';
        btn.addEventListener('click', () => {
          btns.querySelectorAll('.yn-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          _fsState['fs_' + q.id] = val;
          if (followupEl) followupEl.hidden = val !== 'yes';
          if (window.clearFormError) window.clearFormError();
        });
        btns.appendChild(btn);
      });
      field.appendChild(btns);
      if (followupEl) field.appendChild(followupEl);
    }

    if (q.type === 'singleselect') {
      const btns = document.createElement('div');
      btns.className = 'yn-btns';
      btns.style.flexWrap = 'wrap';

      let followupEl = null;
      if (q.followup) {
        followupEl = document.createElement('div');
        followupEl.style.marginTop = '1.4rem';
        followupEl.hidden = _fsState['fs_' + q.id] !== q.followup.triggerValue;
        const fLbl = document.createElement('label');
        fLbl.style.cssText = 'font-family:var(--body);font-weight:300;font-size:var(--q-size);line-height:1.8;color:var(--muted);display:block;margin-bottom:.7rem;text-align:center;background:var(--bg2);border-radius:3px;padding:1.1rem 1.6rem';
        fLbl.textContent = q.followup.label;
        const fList = document.createElement('div');
        fList.id = 'fs-followup-' + q.id;
        followupEl.appendChild(fLbl);
        followupEl.appendChild(fList);
      }

      q.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'yn-btn' + (_fsState['fs_' + q.id] === opt ? ' selected' : '');
        btn.textContent = opt;
        btn.addEventListener('click', () => {
          btns.querySelectorAll('.yn-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          _fsState['fs_' + q.id] = opt;
          if (followupEl) followupEl.hidden = opt !== q.followup.triggerValue;
          if (window.clearFormError) window.clearFormError();
        });
        btns.appendChild(btn);
      });
      field.appendChild(btns);
      if (followupEl) field.appendChild(followupEl);
    }

    if (q.type === 'multiselect') {
      if (!Array.isArray(_fsState['fs_' + q.id])) _fsState['fs_' + q.id] = [];
      const cbEls = [];
      let otherWrap = null;
      // Fixed width rather than fit-content, so the box's size (and centering)
      // never changes based on content — showing/hiding the "Other" field, or
      // it being in a one-row vs. two-row second box, can't shift anything.
      const checks = document.createElement('div');
      checks.className = 'acts-checkboxes';
      checks.style.cssText = 'margin-top:.8rem;width:20rem;margin-left:auto;margin-right:auto';
      field.appendChild(checks);
      q.options.forEach((opt, i) => {
        const row = document.createElement('label');
        row.className = 'acts-check-label';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = _fsState['fs_' + q.id].includes(opt);
        cbEls.push(cb);
        cb.addEventListener('change', () => {
          const arr = _fsState['fs_' + q.id];
          if (opt === q.none) {
            if (cb.checked) {
              cbEls.forEach(c => { if (c !== cb) c.checked = false; });
              _fsState['fs_' + q.id] = [opt];
              if (otherWrap) otherWrap.hidden = true;
            } else {
              _fsState['fs_' + q.id] = arr.filter(o => o !== opt);
            }
          } else {
            const noneIdx = q.options.indexOf(q.none);
            if (noneIdx >= 0) { cbEls[noneIdx].checked = false; _fsState['fs_' + q.id] = arr.filter(o => o !== q.none); }
            if (cb.checked) {
              if (!_fsState['fs_' + q.id].includes(opt)) _fsState['fs_' + q.id].push(opt);
              if (opt === q.other && otherWrap) otherWrap.hidden = false;
            } else {
              _fsState['fs_' + q.id] = _fsState['fs_' + q.id].filter(o => o !== opt);
              if (opt === q.other && otherWrap) otherWrap.hidden = true;
            }
          }
          if (window.clearFormError) window.clearFormError();
        });
        const span = document.createElement('span');
        span.textContent = opt;
        row.appendChild(cb); row.appendChild(span);
        checks.appendChild(row);
        if (opt === q.other) {
          otherWrap = document.createElement('div');
          otherWrap.id = 'fs-other-' + q.id;
          otherWrap.hidden = !_fsState['fs_' + q.id].includes(q.other);
          // Indented to match where the checkbox LABEL text starts (checkbox
          // width + its gap), so the field lines up with the checkboxes above
          // it instead of sitting at the row's outer edge.
          otherWrap.style.cssText = 'margin-left:1.6rem';
          checks.appendChild(otherWrap);
        }
      });
    }

    if (q.type === 'scale5') {
      const scaleWrap = document.createElement('div');
      scaleWrap.style.cssText = 'width:100%;max-width:36rem;margin:0 auto';
      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:.4rem;margin-bottom:1rem';
      for (let i = 1; i <= 5; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'number-btn' + (_fsState['fs_' + q.id] === i ? ' selected' : '');
        btn.style.cssText = 'flex:1;height:2.8rem';
        btn.textContent = i;
        btn.addEventListener('click', () => {
          btnRow.querySelectorAll('.number-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          _fsState['fs_' + q.id] = i;
          if (window.clearFormError) window.clearFormError();
        });
        btnRow.appendChild(btn);
      }
      const legend = document.createElement('div');
      legend.style.cssText = 'display:flex;justify-content:space-between;font-family:var(--sc);font-size:.65rem;letter-spacing:.2em;color:var(--muted)';
      const lowEl = document.createElement('span'); lowEl.textContent = q.low;
      const highEl = document.createElement('span'); highEl.textContent = q.high;
      legend.appendChild(lowEl); legend.appendChild(highEl);
      scaleWrap.appendChild(btnRow);
      scaleWrap.appendChild(legend);
      field.appendChild(scaleWrap);
    }

    if (q.type === 'track-record') {
      const listContainer = document.createElement('div');
      listContainer.id = 'fs-track-record-list';
      field.appendChild(listContainer);
    }

    if (q.type === 'textarea') {
      const ta = document.createElement('textarea');
      ta.className = 'cause-input';
      ta.style.cssText = 'width:100%;min-height:5rem;resize:vertical;margin-top:.8rem;box-sizing:border-box';
      ta.value = _fsState['fs_' + q.id] || '';
      if (q.placeholder) ta.placeholder = q.placeholder;
      ta.addEventListener('input', () => { _fsState['fs_' + q.id] = ta.value; });
      field.appendChild(ta);
    }

    page.appendChild(field);
    container.appendChild(page);

    if (q.type === 'singleselect' && q.followup) {
      renderSimpleBulletList('fs-followup-' + q.id, q.followup.stateKey, 'Describe what you need…', null, _fsState, GENERIC_LIST_HINT);
    }
    if (q.type === 'multiselect' && q.other) {
      renderSimpleBulletList('fs-other-' + q.id, 'fs_' + q.id + '_other_items', 'Please specify...', null, _fsState, GENERIC_LIST_HINT);
    }
    if (q.type === 'track-record') {
      renderTrackRecordList('fs-track-record-list');
    }
  });

  window._fitSubPageCount = questions.length;
  window._fitSubPageIdx = 0;

  const fsSections = [
    { num: '06', title: 'Inner State.', maxIdx: 3 },
    { num: '07', title: 'Personality.', maxIdx: Infinity }
  ];

  function updateFsHeader(idx) {
    const el = document.getElementById('fs-section-head');
    if (el) el.innerHTML = '';
  }

  let _fsKeyHandler = null;

  window._showFitSubPage = function(idx) {
    container.querySelectorAll('.deeper-subpage').forEach((el, i) => { el.hidden = i !== idx; });
    window._fitSubPageIdx = idx;
    if (window.updateAssessmentProgress) window.updateAssessmentProgress();
    updateFsHeader(idx);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (!window._historyNav) history.pushState({ step: 5, sub: idx }, '');

    if (_fsKeyHandler) { document.removeEventListener('keydown', _fsKeyHandler); _fsKeyHandler = null; }
    const q = questions[idx];
    if (q.type === 'scale5') {
      const page = document.getElementById('fs-sub-' + q.id);
      _fsKeyHandler = (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        const n = parseInt(e.key);
        if (n >= 1 && n <= 5) page?.querySelector(`.number-btn:nth-child(${n})`)?.click();
      };
      document.addEventListener('keydown', _fsKeyHandler);
    }
  };

  window._validateFitSubPage = function(idx) {
    const q = questions[idx];
    clearFormErr();
    const page = document.getElementById('fs-sub-' + q.id);
    if (q.type === 'yesno' && !_fsState['fs_' + q.id]) {
      setFormErr('Please select an answer before continuing.', page?.querySelector('.yn-btns')); return false;
    }
    if (q.type === 'singleselect' && !_fsState['fs_' + q.id]) {
      setFormErr('Please select an answer before continuing.', page?.querySelector('.yn-btns')); return false;
    }
    if (q.type === 'singleselect' && q.followup && _fsState['fs_' + q.id] === q.followup.triggerValue) {
      const items = (_fsState[q.followup.stateKey] || []).filter(i => i && i.trim());
      if (!items.length) { setFormErr('Please describe what you need before continuing.', document.getElementById('fs-followup-' + q.id)); return false; }
    }
    if (q.type === 'multiselect' && !_fsState['fs_' + q.id]?.length) {
      setFormErr('Please select at least one option before continuing.', page?.querySelector('.acts-checkboxes')); return false;
    }
    if (q.type === 'multiselect' && q.other && _fsState['fs_' + q.id]?.includes(q.other)) {
      const items = (_fsState['fs_' + q.id + '_other_items'] || []).filter(i => i && i.trim());
      if (!items.length) { setFormErr('Please specify your answer before continuing.', document.getElementById('fs-other-' + q.id)); return false; }
    }
    if (q.type === 'scale5' && !_fsState['fs_' + q.id]) {
      setFormErr('Please select a number before continuing.', page?.querySelector('.number-btn')?.parentElement); return false;
    }
    if (q.type === 'textarea' && !q.optional && !_fsState['fs_' + q.id]?.trim()) {
      setFormErr('Please write your answer before continuing.', page?.querySelector('textarea')); return false;
    }
    if (q.type === 'track-record' && !_fsState['fs_q6_nothing']) {
      const cardEl = (i) => document.querySelector('#fs-track-record-list [data-index="' + i + '"]');
      const allItems = _fsState['fs_q6_items'] || [];
      // Only attempts with a "what" filled in need howWell/why — an empty trailing
      // row (e.g. from "+ Add another") is skipped rather than blocking submission.
      const filled = allItems.map((item, i) => ({ item, i })).filter(({ item }) => item.what?.trim());
      if (!filled.length) {
        setFormErr('Please describe at least one thing you have tried.', cardEl(0)?.querySelector('[data-role="what-row"]'));
        return false;
      }
      const missingHowWell = filled.find(({ item }) => !item.howWell);
      if (missingHowWell) {
        setFormErr('Please rate how well each attempt worked before continuing.', cardEl(missingHowWell.i)?.querySelector('[data-role="scale-row"]'));
        return false;
      }
      const missingWhy = filled.find(({ item }) => !item.why?.trim());
      if (missingWhy) {
        setFormErr('Please explain what got in the way for each attempt before continuing.', cardEl(missingWhy.i)?.querySelector('[data-role="why-row"]'));
        return false;
      }
    }
    return true;
  };

  window._showFitSubPage(0);
}

/* ---- Step change hook ---- */
window.onStepChange = function(step) {
  if (step !== 0 && _fulfillmentKeyHandler) {
    document.removeEventListener("keydown", _fulfillmentKeyHandler);
    _fulfillmentKeyHandler = null;
  }
  if (step === 0) initFulfillmentStep();
  if (step === 1) initImportanceStep();
  if (step === 2) initUrgencyFlagStep();
  if (step === 3) initFocusStep();
  if (step === 4) initDeeperStep();
  if (step === 5) initFitSignalsStep();
  const btnNext = document.getElementById('btn-next');
  if (btnNext) btnNext.textContent = step === 6 ? 'Get my results →' : 'Next →';
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

// ---- Human-readable capture of every question + answer, for the notify email.
// Labels mirror the fit-signals `questions` array in initFitSignalsStep; keep in sync.
const FIT_LABELS = {
  q2: 'Do you feel you have the mental and emotional capacity to tackle your challenges and create change right now?',
  q3: 'Do you struggle with any of these on a regular basis?',
  q4: 'Do you struggle with any addictions or compulsive habits?',
  q5l: 'Which of the following do you struggle to maintain consistently?',
  q5: 'How do you feel when you imagine living the life of mainstream society — a steady job, a mortgage, blending in?',
  q6: 'What have you tried in the past to deal with your situation(s)?',
  q7: 'If your life looks exactly the same in 3 years from now, how would you feel?',
  q8: "Is there anything else you'd like to share that wasn't addressed in this assessment?",
  q9: 'Are you or do you have any ambitions of working as a coach yourself?',
};
const FIT_ORDER = ['q2', 'q3', 'q4', 'q5l', 'q5', 'q6', 'q7', 'q9', 'q8'];

function _prettyKey(k) {
  return String(k).replace(/^deeper_/, '').replace(/_/g, ' ').trim();
}
function _fmtFitAnswer(id) {
  if (id === 'q6') {
    if (_fsState['fs_q6_nothing']) return 'Nothing';
    const items = (_fsState['fs_q6_items'] || []).filter((i) => (i.what || '').trim());
    if (!items.length) return '(none given)';
    const formatted = items
      .map((i) => `${i.what}${i.howWell != null ? ` (worked ${i.howWell}/5)` : ''}${(i.why || '').trim() ? ` — why: ${i.why}` : ''}`);
    return formatted.length > 1 ? formatted : formatted[0];
  }
  let v = _fsState['fs_' + id];
  let out;
  if (Array.isArray(v)) {
    let arr = v.slice();
    const otherItems = (_fsState['fs_' + id + '_other_items'] || []).filter((i) => i && i.trim());
    if (otherItems.length && arr.includes('Other')) arr = arr.map((o) => (o === 'Other' ? 'Other: ' + otherItems.join('; ') : o));
    out = arr.length > 1 ? arr : (arr.length ? arr[0] : '(none selected)');
  } else if (typeof v === 'number') {
    out = 'Rated ' + v;
  } else if (v === 'yes') out = 'Yes';
  else if (v === 'no') out = 'No';
  else out = v == null || v === '' ? '(not answered)' : String(v);
  if (id === 'q2' && v === "No, I'm exhausted" && _fsState['fs_q2_needs']) out += ' — needs: ' + _fsState['fs_q2_needs'];
  return out;
}
// Read the deeper-step questions + answers straight from the rendered page, so the
// email shows each question in FULL exactly as the person saw it (no guessed labels).
function captureDeeperFromDom() {
  const rows = [];
  try {
    document.querySelectorAll('.deeper-subpage').forEach((sp) => {
      // Fit-signals pages share the .deeper-subpage class for styling, but they're
      // not what this function is for — they already have their own correct,
      // conditional handling in FIT_ORDER/FIT_LABELS/_fmtFitAnswer below. Scanning
      // them here too picked up stray labels (e.g. a hidden follow-up's label)
      // and produced garbled/duplicate rows in the notification email.
      if (!sp.id.startsWith('deeper-sub-')) return;
      const area = (sp.dataset.area || sp.querySelector('.deeper-area-name')?.textContent || '').trim();

      // Control-attitude: one row per circumstance they must accept, combining their
      // feeling about it and whether they want to feel that way — instead of the same
      // two generic questions ("How do you feel about this?" / "Is this how you want to
      // feel about it?") repeating once per circumstance with no context of which is which.
      const attMatch = sp.id.match(/^deeper-sub-(.+)-control-attitude$/);
      if (attMatch) {
        const areaKey = attMatch[1];
        const items = (_deeperState['deeper_' + areaKey + '_control_items'] || []).filter((i) => i && i.trim());
        const feelings = _deeperState['deeper_' + areaKey + '_control_feeling'] || {};
        const feelingYn = _deeperState['deeper_' + areaKey + '_control_feeling_yn'] || {};
        items.forEach((item) => {
          const feelingList = Array.isArray(feelings[item]) ? feelings[item] : (feelings[item] ? [feelings[item]] : []);
          const feeling = feelingList.filter((f) => f && f.trim()).join(', ');
          if (!feeling) return;
          const wantsToFeel = feelingYn[item] === 'yes' ? 'Yes' : feelingYn[item] === 'no' ? 'No' : '';
          const a = wantsToFeel ? `Feels: ${feeling}. Wants to feel this way: ${wantsToFeel}.` : `Feels: ${feeling}.`;
          rows.push([area ? `${area} — ${item}` : item, a]);
        });
        return;
      }

      sp.querySelectorAll('.deeper-field').forEach((field) => {
        if (field.classList.contains('vision-actual-field')) return; // mandatory confirm checkbox — answer is always the same, not worth showing
        if (field.classList.contains('vision-achievable-field')) return; // per-item achievable/not-achievable ratings — not needed in the email
        if (field.classList.contains('vision-achievable-check-field')) return; // whether it's still worth achieving / needs revising — not needed in the email
        if (field.classList.contains('confirm-check-field')) return; // mandatory confirm checkbox (e.g. control-attitude) — answer is always the same, not worth showing
        const lblEl = [...field.children].find((c) => c.tagName === 'LABEL') || field.querySelector('label');
        const q = (lblEl?.textContent || '').replace(/\s+/g, ' ').trim();
        if (!q) return;
        const mine = (el) => el.closest('.deeper-field') === field;
        let a = '';
        const sel = [...field.querySelectorAll('.yn-btn.selected')].find(mine);
        if (sel) a = sel.textContent.trim();
        if (!a) {
          // The "which values" question lists a bullet-list of values under each
          // action/inaction — there are no checkboxes here, just free-text values.
          const isActsValuesField = !!field.querySelector('[id^="acts-value-groups-"]');
          const texts = [...field.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea')]
            .filter(mine).map((i) => i.value.trim()).filter(Boolean);
          const checks = isActsValuesField ? [] : [...field.querySelectorAll('input[type=checkbox]')]
            .filter((c) => mine(c) && c.checked)
            .map((c) => (c.closest('label')?.textContent || 'Yes').replace(/\s+/g, ' ').trim());
          const combined = [...texts, ...checks];
          a = combined.length > 1 ? combined : combined.join('; ');
        }
        if (a) rows.push([area ? `${area} — ${q}` : q, a]);
      });
    });
  } catch (_e) { /* best effort */ }
  return rows;
}

// Flatten any stored answer (string / number / array / {what,howWell,why}) to text.
function _fmtStateVal(v) {
  if (Array.isArray(v)) {
    return v
      .map((x) => (x && typeof x === 'object'
        ? Object.values(x).filter((y) => String(y ?? '').trim()).join(' — ')
        : String(x ?? '')))
      .filter((s) => s.trim())
      .join('; ');
  }
  if (v && typeof v === 'object') return Object.values(v).filter((y) => String(y ?? '').trim()).join(' — ');
  return v == null ? '' : String(v);
}

function buildQaSummary(answers) {
  const groups = [];
  const shownNorm = new Set();
  const norm = (s) => String(s ?? '').trim().toLowerCase();
  const mark = (a) => { const n = norm(Array.isArray(a) ? a.join('; ') : a); if (n) shownNorm.add(n); };

  const areaLabel = {};
  (typeof AREAS !== 'undefined' ? AREAS : []).forEach(([k, l]) => { areaLabel[k] = l; });

  // ---- About them (contact) — includes age + occupation ----
  const contact = [
    ['Name', [answers.first_name, answers.last_name].filter(Boolean).join(' ') || '(not given)'],
    ['Email', answers.email || '(not given)'],
    ['Age', answers.age || '(not given)'],
    ['Gender', answers.gender || '(not given)'],
    ['Occupation', answers.work_status || '(not given)'],
    ['Time taken', answers.time_taken || '(not recorded)'],
  ];
  contact.forEach(([, a]) => mark(a));
  groups.push({ title: 'About them', rows: contact });

  // ---- Life areas — ALL of them ----
  let areaRows = [];
  try {
    areaRows = getWheelValues().map((a) => [a.label, `Fulfilment ${a.fulfillment}/5 · Importance ${a.importance}`]);
  } catch (_e) {
    (typeof AREAS !== 'undefined' ? AREAS : []).forEach(([key, label]) =>
      areaRows.push([label, `Fulfilment ${answers['fulfillment_' + key] ?? '?'}/5 · Importance ${answers['importance_' + key] ?? '?'}`]));
  }
  if (areaRows.length) { areaRows.forEach(([, a]) => mark(a)); groups.push({ title: 'Life areas — all 11, with ratings', rows: areaRows, subNumbered: true }); }

  // ---- Where they chose to focus ----
  try {
    const focusKeys = [...document.querySelectorAll('#focus-hidden-inputs input')].map((i) => i.value).filter(Boolean);
    if (focusKeys.length) {
      const val = focusKeys.map((k) => areaLabel[k] || k).join(', ');
      mark(val);
      groups.push({ title: 'Where they chose to focus', rows: [['Focus area', val]] });
    }
  } catch (_e) { /* best effort */ }

  // ---- Deeper questions — read in full from the page ----
  const deeperRows = captureDeeperFromDom();
  deeperRows.forEach(([, a]) => mark(a));

  // The achievable-ratings and revise/worth-it questions are intentionally left out of
  // the email (see the skips in captureDeeperFromDom). But when someone's vision was
  // rejected as not achievable AND they said they don't actually know their real vision,
  // that's worth a clear, dedicated flag — distinct from saying "I don't know" up front.
  (typeof AREAS !== 'undefined' ? AREAS : []).forEach(([key, label]) => {
    if (_deeperState['deeper_' + key + '_vision_achievable_check'] === 'unknown after vision was rejected as not achievable') {
      const note = "Their stated vision was marked not achievable, and they don't know what their real vision is — this came after the rejection, not as a first answer.";
      deeperRows.push([`${label} — Vision outcome`, note]);
      mark(note);
    }
  });

  if (deeperRows.length) groups.push({ title: 'Deeper questions', rows: deeperRows });

  // ---- Inner state & personality (fit signals) ----
  const fitRows = FIT_ORDER.map((id) => [FIT_LABELS[id], _fmtFitAnswer(id)]);
  fitRows.forEach(([, a]) => mark(a));
  groups.push({ title: 'Inner state & personality', rows: fitRows });

  // ---- COMPLETENESS NET: every stored deeper answer not already shown above, so no
  // question can ever silently go missing from the email. Fit-signal answers (fs_*) are
  // NOT scanned here — every one of them is already fully represented, correctly
  // formatted, in "Inner state & personality" above (FIT_ORDER covers every question,
  // including its side-fields like "other" text and the track-record list), so scanning
  // them again here would just re-dump the same answer in a raw, differently-worded form.
  // Likewise, fields deliberately excluded from the email (mandatory confirm checkboxes,
  // per-item achievable ratings, revise/worth-it question, and the values-by-item object
  // behind the "which values" question — already shown as just the values above) stay
  // excluded here too, for the same reason: they'd otherwise reappear as an ugly,
  // differently-formatted raw duplicate of something already shown cleanly.
  const SUPPRESSED_KEY_SUFFIXES = [
    // Every yn-field (vision/commitment/control) is already captured above with its
    // proper button wording (e.g. "There is no other way", not the raw "certain") —
    // the raw code stored in state rarely matches that wording, so without this it
    // reappears down here as an ugly, differently-worded duplicate.
    '_yn',
    // Mandatory confirm checkboxes (acts-list, control-attitude) and the UI flag
    // that tracks whether that confirm modal has been shown — the answer is always
    // the same when present, and neither is real content worth showing.
    '_confirm', '_confirm_shown',
    '_vision_item_achievable', '_vision_achievable_check', '_vision_items',
    '_acts_values_by_item', '_omits_groups',
    '_control_feeling',
  ];
  const extra = [];
  const scan = (state) => {
    Object.keys(state || {}).sort().forEach((k) => {
      if (SUPPRESSED_KEY_SUFFIXES.some((suffix) => k.endsWith(suffix))) return;
      const s = _fmtStateVal(state[k]);
      if (!s.trim() || shownNorm.has(norm(s))) return;
      extra.push([_prettyKey(k), s]);
      mark(s);
    });
  };
  try { scan(_deeperState); } catch (_e) { /* best effort */ }
  if (extra.length) groups.push({ title: 'Additional detail (nothing dropped)', rows: extra });

  return groups;
}

window.submitAssessment = async function submitAssessment(form, submitButton) {
  const answers = collectAnswers(form);

  // Fit signals live in _fsState (plain JS object, not form fields) — derive scoring signals here
  const q2 = _fsState['fs_q2'] || '';
  const q5 = typeof _fsState['fs_q5'] === 'number' ? _fsState['fs_q5'] : 3;
  const q7 = _fsState['fs_q7'] || '';
  const q6items = (_fsState['fs_q6_items'] || []).filter(i => i.what?.trim());

  const r6 = { 'Yes, whatever it takes': 6, 'Yes, but I need to go easy on myself': 4, "No, I'm exhausted": 2 };
  const s6 = { "Unacceptable — it cannot happen": 6, "Like I'd wasted something important": 5, "Disappointing, but I'd manage": 3, "I'd be fine with it": 1 };
  const r5 = { 'Yes, whatever it takes': 5, 'Yes, but I need to go easy on myself': 3, "No, I'm exhausted": 1 };
  const s5 = { "Unacceptable — it cannot happen": 5, "Like I'd wasted something important": 4, "Disappointing, but I'd manage": 2, "I'd be fine with it": 1 };

  answers.path_signal          = r6[q2] ?? 3;
  answers.decision_signal      = s6[q7] ?? 3;
  answers.previous_attempts    = Math.min(q6items.length + 1, 5);
  answers.help_openness        = r5[q2] ?? 3;
  answers.change_timeline      = s5[q7] ?? 3;
  answers.investment_readiness = r5[q2] ?? 3;
  answers.vision_scale         = Math.max(1, 6 - q5);
  answers.conformity_signal    = answers.vision_scale;
  answers.truth_directness     = s5[q7] ?? 3;
  answers.potential_signal     = s5[q7] ?? 3;

  // How long they spent on the whole assessment, start to finish — shown to
  // Dan in the notification email, not to the person taking it.
  try {
    const secs = window.getAssessmentDurationSeconds ? window.getAssessmentDurationSeconds() : null;
    if (secs != null) {
      const m = Math.floor(secs / 60), s = secs % 60;
      answers.time_taken = m > 0 ? `${m}m ${s}s` : `${s}s`;
    }
  } catch (_e) { /* best effort */ }

  // Readable question-by-question capture for the notify email (never fatal).
  try { answers.qa_summary = buildQaSummary(answers); } catch (_e) { /* summary is best-effort */ }

  const result = calculateResult(answers);
  if (window.stopStopwatch) window.stopStopwatch();
  renderResult(result, "pending");
  renderPrintResult(result);
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
