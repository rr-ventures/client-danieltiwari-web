/* ============================================================
   Daniel Tiwari — assessment form behaviour
   Scoring + result render live in assessment-core.js (shared with
   the hosted result page). This file owns the live quiz: step
   initialization, one-at-a-time fulfillment, and submission.
   ============================================================ */

const _scaleState = {};       // "urgency_career": "2"
const _fulfillmentState = {}; // "career": "7"
const _deeperState = {};      // "career_cause": "...", "career_vision": "..."
const _fsState = {};          // fit signals answers
let _fulfillmentKeyHandler = null;
let _spilloverState = null;

function setFormErr(msg) {
  const el = document.getElementById('form-step-error');
  if (el) { el.textContent = msg; el.classList.add('visible'); document.getElementById('form-nav').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
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
    urgency: parseInt(document.querySelector(`input[name="urgency_${key}"]`)?.value || 2),
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
  const card = document.getElementById("fulfillment-card");
  card.innerHTML = `
    <h3 class="deeper-area-name">${label}</h3>
    ${desc ? `<p class="fulfillment-area-desc">${desc}</p>` : ""}
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
        <span class="drag-label">${label}</span>
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

/* ---- Step 2: Urgency ---- */
function initUrgencyStep() {
  buildRankingRows("urgency-rows", "urgency-hidden-inputs", "urgency");
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

/* ---- Step 4: Focus recommendation ---- */
function initFocusStep() {
  const wheel = getWheelValues();
  const ranked = rankAllAreas(wheel);
  const n = AREAS.length;

  const existingKeys = new Set(
    [...document.querySelectorAll('#focus-hidden-inputs input')].map(i => i.value)
  );
  const selected = existingKeys.size
    ? existingKeys
    : new Set(ranked.slice(0, 1).map(a => a.key));

  function getReason(area) {
    const urgencyRank = n + 1 - area.urgency;
    const importanceRank = n + 1 - area.importance;
    if (urgencyRank <= 2) return `most urgent · ${area.fulfillment}/5 fulfilled`;
    if (area.fulfillment <= 2) return `${area.fulfillment}/5 fulfilled · #${importanceRank} in importance`;
    if (urgencyRank <= 4) return `#${urgencyRank} most urgent · ${area.fulfillment}/5 fulfilled`;
    return `#${importanceRank} in importance · ${area.fulfillment}/5 fulfilled`;
  }

  function updateInputs() {
    document.getElementById("focus-hidden-inputs").innerHTML =
      [...selected].map(key => `<input type="hidden" name="focus_area" value="${key}">`).join("");
  }

  function render() {
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
        updateInputs();
        render();
      });
    });

    updateInputs();
  }

  render();
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
      bullet.textContent = '—';
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
    container.appendChild(list);
    container.appendChild(addBtn);
    container.appendChild(hidden);
    const listErr = document.createElement('p');
    listErr.className = 'yn-error list-error';
    container.appendChild(listErr);
  }
  build();
}

/* ---- Shared: bullet list + value groups (acts & omits) ---- */
function renderItemValueGroups(key, type, itemPlaceholder, valueLabel, vgContainerId) {
  const container = document.getElementById(type + '-groups-' + key);
  if (!container) return;
  const itemsKey = 'deeper_' + key + '_' + type + '_items';

  const groupsKey = 'deeper_' + key + '_' + type + '_groups';

  if (!Array.isArray(_deeperState[itemsKey])) _deeperState[itemsKey] = [''];
  const items = _deeperState[itemsKey];
  if (!Array.isArray(_deeperState[groupsKey])) _deeperState[groupsKey] = [{ selected: [], value: '' }];
  const groups = _deeperState[groupsKey];

  function getVgTarget() {
    return vgContainerId ? (document.getElementById(vgContainerId) || container) : container;
  }

  function syncItems() {
    _deeperState[itemsKey] = items;
    const h = container.querySelector('input[name="' + itemsKey + '"]');
    if (h) h.value = JSON.stringify(items);
    refreshValueGroups();
  }

  function syncGroups() {
    _deeperState[groupsKey] = groups;
    const h = getVgTarget().querySelector('input[name="' + groupsKey + '"]');
    if (h) h.value = JSON.stringify(groups);
  }

  function buildItemList(listEl) {
    listEl.innerHTML = '';
    const rows = document.createElement('div');
    rows.className = 'cause-list';
    items.forEach((val, i) => {
      const row = document.createElement('div');
      row.className = 'cause-item';
      const bullet = document.createElement('span');
      bullet.className = 'cause-bullet';
      bullet.textContent = '—';
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'cause-input';
      inp.value = val;
      inp.placeholder = itemPlaceholder;
      inp.addEventListener('input', () => {
        items[i] = inp.value;
        syncItems();
        listEl.querySelectorAll('.cause-remove').forEach(b => { b.hidden = items.length === 1; });
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          items.push('');
          buildItemList(listEl);
          const inputs = listEl.querySelectorAll('.cause-input');
          if (inputs.length) inputs[inputs.length - 1].focus();
        }
      });
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'cause-remove';
      rm.textContent = '×';
      rm.hidden = items.length === 1;
      rm.addEventListener('click', () => { items.splice(i, 1); buildItemList(listEl); syncItems(); });
      row.appendChild(bullet); row.appendChild(inp); row.appendChild(rm);
      rows.appendChild(row);
    });
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'list-add-btn';
    addBtn.textContent = '+ Add another';
    addBtn.addEventListener('click', () => {
      items.push('');
      buildItemList(listEl);
      const inputs = listEl.querySelectorAll('.cause-input');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    listEl.appendChild(rows);
    listEl.appendChild(addBtn);
    const listErr = document.createElement('p');
    listErr.className = 'yn-error list-error';
    listEl.appendChild(listErr);
  }

  function buildGroup(gi, vgEl) {
    const g = groups[gi];
    if (!Array.isArray(g.selected)) g.selected = [];
    const filledItems = items.filter(it => it && it.trim());
    const wrap = document.createElement('div');
    wrap.className = 'acts-group';
    const checks = document.createElement('div');
    checks.className = 'acts-checkboxes';
    filledItems.forEach(item => {
      const lbl = document.createElement('label');
      lbl.className = 'acts-check-label';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = g.selected.includes(item);
      cb.addEventListener('change', () => {
        if (cb.checked) { if (!g.selected.includes(item)) g.selected.push(item); }
        else { g.selected = g.selected.filter(s => s !== item); }
        reveal.hidden = g.selected.length === 0;
        syncGroups();
      });
      const span = document.createElement('span');
      span.textContent = item;
      lbl.appendChild(cb); lbl.appendChild(span);
      checks.appendChild(lbl);
    });
    wrap.appendChild(checks);
    const reveal = document.createElement('div');
    reveal.className = 'acts-value-reveal';
    reveal.hidden = g.selected.length === 0;
    const valueInp = document.createElement('input');
    valueInp.type = 'text';
    valueInp.className = 'cause-input';
    valueInp.style.marginTop = '.6rem';
    valueInp.style.width = '100%';
    valueInp.placeholder = 'e.g. Security, comfort, avoiding failure…';
    valueInp.value = g.value || '';
    valueInp.addEventListener('input', () => { g.value = valueInp.value; syncGroups(); });
    reveal.appendChild(valueInp);
    wrap.appendChild(reveal);
    if (groups.length > 1) {
      const footer = document.createElement('div');
      footer.className = 'acts-group-footer';
      const rmBtn = document.createElement('button');
      rmBtn.type = 'button';
      rmBtn.className = 'acts-group-remove';
      rmBtn.textContent = 'Remove';
      rmBtn.addEventListener('click', () => { groups.splice(gi, 1); buildValueGroups(vgEl); syncGroups(); });
      footer.appendChild(rmBtn);
      wrap.appendChild(footer);
    }
    return wrap;
  }

  function buildValueGroups(vgEl) {
    vgEl.innerHTML = '';
    groups.forEach((_, gi) => vgEl.appendChild(buildGroup(gi, vgEl)));
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'list-add-btn';
    addBtn.style.marginTop = '.8rem';
    addBtn.textContent = '+ Add another value';
    addBtn.addEventListener('click', () => { groups.push({ selected: [], value: '' }); buildValueGroups(vgEl); syncGroups(); });
    vgEl.appendChild(addBtn);
  }

  function refreshValueGroups() {
    const filledItems = items.filter(it => it && it.trim());
    const vgWrap = getVgTarget().querySelector('.' + type + '-vg-wrap');
    if (!vgWrap) return;
    vgWrap.hidden = filledItems.length === 0;
    if (filledItems.length) { const vgEl = vgWrap.querySelector('.' + type + '-vg-inner'); if (vgEl) buildValueGroups(vgEl); }
  }

  function build() {
    container.innerHTML = '';
    const listEl = document.createElement('div');
    buildItemList(listEl);
    container.appendChild(listEl);

    const vgTarget = getVgTarget();
    if (vgContainerId) vgTarget.innerHTML = '';

    const vgWrap = document.createElement('div');
    vgWrap.className = type + '-vg-wrap deeper-field';
    vgWrap.hidden = items.filter(it => it && it.trim()).length === 0;
    vgWrap.style.marginTop = '1.4rem';
    const vgLbl = document.createElement('label');
    vgLbl.textContent = valueLabel;
    vgWrap.appendChild(vgLbl);
    const vgError = document.createElement('p');
    vgError.className = 'yn-error';
    vgError.textContent = 'Every ' + (type === 'acts' ? 'action' : 'inaction') + ' needs at least one value attributed to it before continuing.';
    vgWrap.appendChild(vgError);
    const vgInner = document.createElement('div');
    vgInner.className = type + '-vg-inner';
    buildValueGroups(vgInner);
    vgWrap.appendChild(vgInner);
    vgTarget.appendChild(vgWrap);

    const hiddenItems = document.createElement('input');
    hiddenItems.type = 'hidden';
    hiddenItems.name = itemsKey;
    hiddenItems.value = JSON.stringify(items);
    container.appendChild(hiddenItems);
    const hiddenGroups = document.createElement('input');
    hiddenGroups.type = 'hidden';
    hiddenGroups.name = groupsKey;
    hiddenGroups.value = JSON.stringify(groups);
    vgTarget.appendChild(hiddenGroups);
  }

  build();
}

function renderSimpleBulletList(containerId, stateKey, placeholder) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!Array.isArray(_deeperState[stateKey])) _deeperState[stateKey] = [''];
  const items = _deeperState[stateKey];

  function syncHidden() {
    const h = container.querySelector('input[name="' + stateKey + '"]');
    if (h) h.value = JSON.stringify(items);
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
      bullet.textContent = '—';
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'cause-input';
      inp.value = val;
      inp.placeholder = placeholder;
      inp.addEventListener('input', () => {
        items[i] = inp.value;
        _deeperState[stateKey] = items;
        syncHidden();
        if (window.clearFormError) window.clearFormError();
        container.querySelectorAll('.cause-remove').forEach(b => { b.hidden = items.length === 1; });
      });
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault(); e.stopPropagation();
          items.push('');
          _deeperState[stateKey] = items;
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
        _deeperState[stateKey] = items;
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
      _deeperState[stateKey] = items;
      build();
      const inputs = container.querySelectorAll('.cause-input');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    container.appendChild(list);
    container.appendChild(addBtn);
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = stateKey;
    hidden.value = JSON.stringify(items);
    container.appendChild(hidden);
  }

  build();
}

function renderActsGroups(key) {
  const doing    = (_deeperState['deeper_' + key + '_acts_doing_items'] || []).filter(i => i && i.trim());
  const notDoing = (_deeperState['deeper_' + key + '_acts_not_doing_items'] || []).filter(i => i && i.trim());
  _deeperState['deeper_' + key + '_acts_items'] = [...doing, ...notDoing];
  renderItemValueGroups(key, 'acts',
    'Describe what you are doing…',
    "Check the actions/inactions and then write the value that they are serving.",
    'acts-value-groups-' + key);
}

function renderActsItemValues(key) {
  renderActsGroups(key);
}

function renderOmitsGroups(key) {
  renderItemValueGroups(key, 'omits',
    'Describe what you are NOT doing…',
    "What value of yours are you serving by not taking that action? Be brutally honest here — they may be values you don't consciously approve of.");
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
      bullet.textContent = '—';
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
    container.appendChild(list);
    container.appendChild(addBtn);
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
      bullet.textContent = '—';
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
    container.appendChild(list);
    container.appendChild(addBtn);
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

  const feelingKey   = 'deeper_' + key + '_control_feeling';
  const feelingYnKey = 'deeper_' + key + '_control_feeling_yn';
  if (typeof _deeperState[feelingKey] !== 'object' || !_deeperState[feelingKey]) _deeperState[feelingKey] = {};
  if (typeof _deeperState[feelingYnKey] !== 'object' || !_deeperState[feelingYnKey]) _deeperState[feelingYnKey] = {};
  const feelings   = _deeperState[feelingKey];
  const feelingYn  = _deeperState[feelingYnKey];

  function syncHidden(stateKey, stateObj) {
    const h = container.querySelector('input[name="' + stateKey + '"]');
    if (h) h.value = JSON.stringify(stateObj);
  }

  container.innerHTML = '';

  items.forEach(item => {
    const block = document.createElement('div');
    block.className = 'deeper-block';
    block.style.marginTop = '1.4rem';

    const itemHead = document.createElement('p');
    itemHead.style.cssText = 'font-family:var(--display);font-size:1rem;font-weight:400;margin-bottom:1rem';
    itemHead.textContent = item;
    block.appendChild(itemHead);

    const feelingWrap = document.createElement('div');
    feelingWrap.className = 'deeper-field';
    feelingWrap.style.marginBottom = '1rem';
    const feelingLbl = document.createElement('span');
    feelingLbl.style.cssText = 'font-family:var(--sc);font-size:.68rem;letter-spacing:.2em;color:var(--accent);display:block;margin-bottom:.5rem';
    feelingLbl.textContent = 'How do you feel about this?';
    const feelingInp = document.createElement('input');
    feelingInp.type = 'text';
    feelingInp.className = 'cause-input';
    feelingInp.style.width = '100%';
    feelingInp.placeholder = 'e.g. Resigned, angry, at peace with it, bitter, numb, frustrated…';
    feelingInp.value = feelings[item] || '';
    feelingInp.addEventListener('input', () => {
      feelings[item] = feelingInp.value;
      _deeperState[feelingKey] = feelings;
      syncHidden(feelingKey, feelings);
      if (window.clearFormError) window.clearFormError();
    });
    feelingWrap.appendChild(feelingLbl);
    feelingWrap.appendChild(feelingInp);
    block.appendChild(feelingWrap);

    const ynWrap = document.createElement('div');
    ynWrap.className = 'deeper-field';
    const ynLbl = document.createElement('label');
    ynLbl.style.cssText = 'font-family:var(--sc);font-size:.68rem;letter-spacing:.2em;color:var(--accent);display:block;margin-bottom:.5rem;text-align:center';
    ynLbl.textContent = 'Is this how you want to feel about it?';
    const btns = document.createElement('div');
    btns.className = 'yn-btns';
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
        if (window.clearFormError) window.clearFormError();
      });
      btns.appendChild(btn);
    });
    ynWrap.appendChild(ynLbl);
    ynWrap.appendChild(btns);
    block.appendChild(ynWrap);

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

  if (allNotAchievable && _deeperState[checkKey] !== 'revise') {
    _deeperState[checkKey] = 'revise';
    syncHidden();
  }

  const qWrap = document.createElement('div');
  qWrap.className = 'deeper-field yn-field';

  if (allNotAchievable) {
    qWrap.classList.remove('yn-field');
    const msg = document.createElement('label');
    msg.textContent = 'None of your vision points are achievable as stated — you will need to revise your vision in the next step.';
    qWrap.appendChild(msg);
  } else {
    const qLbl = document.createElement('label');
    qLbl.textContent = 'Is this still a vision worth working towards?';
    qWrap.appendChild(qLbl);

    const btns = document.createElement('div');
    btns.className = 'yn-btns';
    btns.style.flexWrap = 'wrap';
    [{ val: 'yes', label: 'Yes, this is my vision' }, { val: 'revise', label: "I'd like to add to or revise it" }].forEach(opt => {
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
  }

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

  renderSimpleBulletList('vision-revised-' + key, revisedKey, 'Describe your revised vision…');
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
  const qtypes = ['cause', 'vision', 'vision-describe', 'vision-item-achievable', 'vision-achievable-check', 'vision-revised', 'vision-commitment', 'acts', 'acts-list', 'acts-values', 'control', 'control-attitude'];
  const allSubPages = selectedKeys.flatMap(key => qtypes.map(qtype => ({ key, qtype })));

  container.innerHTML = selectedKeys.flatMap(key => {
    const { label, desc } = areaMap[key] || { label: key, desc: '' };
    const data = wheelMap[key] || {};
    const urgencyFocused = (data.urgency || 0) > (data.importance || 0);
    const q3Toggle = `Are you consciously aware of what your 5/5 in ${label} would look like?`;
    const q3Expand = urgencyFocused ? `What would need to be resolved, achieved, or in place…` : `Describe the version of this area that would feel fully alive…`;
    const controlYn      = _deeperState[`deeper_${key}_control_yn`] || '';
    const controlItems   = _deeperState[`deeper_${key}_control_items`] || [];
    const actsYn         = _deeperState[`deeper_${key}_acts_yn`] || '';
    const visionYn       = _deeperState[`deeper_${key}_vision_yn`] || '';
    const visionItems    = _deeperState[`deeper_${key}_vision_items`] || [];
    const commitmentYn   = _deeperState[`deeper_${key}_commitment_yn`] || '';
    const visionActualYn  = _deeperState[`deeper_${key}_vision_actual_yn`] || '';
    const head = `<h3 class="deeper-area-name">${label}</h3>${desc ? `<p class="fulfillment-area-desc">${desc}</p>` : ''}`;
    return [
      `<div class="deeper-subpage" id="deeper-sub-${key}-cause" hidden>
        ${head}
        <div class="deeper-field">
          <label>Why does ${label} only feel like a ${data.fulfillment}/5 right now?</label>
          <div id="cause-list-${key}"></div>
        </div>
      </div>`,
      `<div class="deeper-subpage" id="deeper-sub-${key}-vision" hidden>
        ${head}
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
      `<div class="deeper-subpage" id="deeper-sub-${key}-vision-describe" hidden>
        ${head}
        <div class="deeper-field">
          <label>Describe what your 5/5 in ${label} would look like.</label>
          <div class="yn-expand">
            <div id="vision-list-${key}" data-placeholder="${q3Expand}" style="margin-top:.9rem"></div>
            <div class="values-reveal" ${visionItems.filter(i => i && i.trim()).length ? '' : 'hidden'}>
              <div class="deeper-field vision-actual-field" data-key="${key}">
                <label>Are you sure you <strong>ACTUALLY WANT THESE?</strong> Or are these things you think you're <strong>SUPPOSED TO</strong> want, or <strong>WOULD LIKE TO</strong> want, but don't really?</label>
                <label class="confirm-check-wrap">
                  <input type="checkbox" class="vision-actual-check" name="deeper_${key}_vision_actual" value="yes" ${visionActualYn === 'yes' ? 'checked' : ''}>
                  <span class="confirm-check-box"></span>
                  <span class="confirm-check-text">I genuinely want these</span>
                </label>
                <p class="yn-error">Please confirm before continuing.</p>
              </div>
            </div>
          </div>
        </div>
      </div>`,
      `<div class="deeper-subpage" id="deeper-sub-${key}-vision-item-achievable" hidden>
        ${head}
        <p class="guide-text" style="margin-top:1.6rem">Only mark something as "Literally impossible" if it is genuinely, objectively impossible — like reversing death or defying a law of nature (unless you believe this is possible as well). If it feels out of reach for you personally, that is a limiting belief, not an impossibility. Mark those as achievable.</p>
        <div class="deeper-field" style="margin-top:1.4rem">
          <label>For each point in your vision, is it theoretically achievable?</label>
          <div id="vision-item-achievable-${key}" style="margin-top:.9rem"></div>
        </div>
      </div>`,
      `<div class="deeper-subpage" id="deeper-sub-${key}-vision-achievable-check" hidden>
        ${head}
        <div id="vision-achievable-check-${key}" style="margin-top:1.4rem"></div>
      </div>`,
      `<div class="deeper-subpage" id="deeper-sub-${key}-vision-revised" hidden>
        ${head}
        <div class="deeper-field" style="margin-top:1.4rem">
          <label>Create your revised vision — only things that are theoretically achievable.</label>
          <div id="vision-revised-${key}" style="margin-top:.9rem"></div>
        </div>
      </div>`,
      `<div class="deeper-subpage" id="deeper-sub-${key}-vision-commitment" hidden>
        ${head}
        <div id="vision-commitment-recap-${key}" class="recap-block" style="margin-top:1.4rem;margin-bottom:1.6rem" hidden></div>
        <div class="deeper-field yn-field" data-key="${key}" data-role="commitment">
          <label><strong>WILL</strong> you achieve it?</label>
          <div class="yn-btns">
            <button type="button" class="yn-btn${commitmentYn === 'certain'  ? ' selected' : ''}" data-val="certain">There is no other way</button>
            <button type="button" class="yn-btn${commitmentYn === 'doubtful' ? ' selected' : ''}" data-val="doubtful">I have doubts</button>
          </div>
          <p class="yn-error">Please select one.</p>
        </div>
      </div>`,
      `<div class="deeper-subpage" id="deeper-sub-${key}-acts" hidden>
        ${head}
        <div id="recap-causes-${key}-acts" data-label="Why ${label} feels like a ${data.fulfillment}/5" class="recap-block" hidden></div>
        <div class="deeper-field yn-field" data-key="${key}" data-role="acts">
          <label>Are there ways in which <strong>YOU</strong> are contributing to the above?</label>
          <div class="yn-btns">
            <button type="button" class="yn-btn${actsYn === 'yes' ? ' selected' : ''}" data-val="yes">Yes</button>
            <button type="button" class="yn-btn${actsYn === 'no'  ? ' selected' : ''}" data-val="no">No</button>
          </div>
          <p class="yn-error">Please select one.</p>
        </div>
      </div>`,
      `<div class="deeper-subpage" id="deeper-sub-${key}-acts-list" hidden>
        ${head}
        <div id="recap-causes-${key}-acts-list" data-label="Why ${label} feels like a ${data.fulfillment}/5" class="recap-block" hidden></div>
        <div class="deeper-field" style="margin-top:1.4rem">
          <label>What are <strong>YOU DOING</strong> that is contributing to the situation?</label>
          <div id="acts-doing-${key}" style="margin-top:.5rem"></div>
        </div>
        <div class="deeper-field" style="margin-top:1.4rem">
          <label>What <strong>COULD</strong> you be doing to improve the situation but are <strong>NOT</strong> doing?</label>
          <div id="acts-not-doing-${key}" style="margin-top:.5rem"></div>
        </div>
        <div id="acts-groups-${key}" hidden></div>
      </div>`,
      `<div class="deeper-subpage" id="deeper-sub-${key}-acts-values" hidden>
        ${head}
        <div id="recap-acts-${key}" data-label="How you are contributing to this" class="recap-block" hidden></div>
        <div class="deeper-field" style="margin-top:1.4rem">
          <label>If you're brutally honest with yourself, which values might you have that you are serving with these actions/inactions?</label>
          <div id="acts-value-groups-${key}" style="margin-top:.9rem"></div>
        </div>
      </div>`,
      `<div class="deeper-subpage" id="deeper-sub-${key}-control" hidden>
        ${head}
        <div id="recap-causes-${key}-control" data-label="Why ${label} feels like a ${data.fulfillment}/5" class="recap-block" hidden></div>
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
      `<div class="deeper-subpage" id="deeper-sub-${key}-control-attitude" hidden>
        ${head}
        <p class="guide-text" style="margin-top:1.6rem">What we can't change, we can still choose how to meet. The stories we attach to our circumstances, and our attitude towards them, matter more than most people realise.</p>
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
    if (idx < 0 || idx >= allSubPages.length) return;
    const sp = allSubPages[idx];
    if (sp.qtype === 'control-attitude' && _deeperState['deeper_' + sp.key + '_control_yn'] !== 'yes') {
      showDeeperSubPage(idx + direction, direction);
      return;
    }
    if (sp.qtype === 'acts-list') {
      const actsYn = _deeperState['deeper_' + sp.key + '_acts_yn'];
      if (actsYn !== 'yes') { showDeeperSubPage(idx + direction, direction); return; }
    }
    if (sp.qtype === 'acts-values') {
      const actsYn = _deeperState['deeper_' + sp.key + '_acts_yn'];
      const doing    = (_deeperState['deeper_' + sp.key + '_acts_doing_items'] || []).filter(i => i && i.trim());
      const notDoing = (_deeperState['deeper_' + sp.key + '_acts_not_doing_items'] || []).filter(i => i && i.trim());
      if (actsYn !== 'yes' || (!doing.length && !notDoing.length)) {
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
      if ((vYn !== 'yes' && vYn !== 'partially') || !vItems.length || vActual !== 'yes') {
        showDeeperSubPage(idx + direction, direction);
        return;
      }
    }
    container.querySelectorAll('.deeper-subpage').forEach((el, i) => { el.hidden = i !== idx; });
    window._deeperSubPageIdx = idx;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (!window._historyNav) history.pushState({ step: 4, sub: idx }, '');
    const { key, qtype } = sp;
    const causes = (_deeperState['deeper_' + key + '_causes'] || []).filter(c => c && c.trim());
    if (qtype === 'acts' || qtype === 'acts-list' || qtype === 'control') {
      fillRecapBlock(document.getElementById('recap-causes-' + key + '-' + qtype), causes);
    }
    if (qtype === 'acts-values') {
      const actsItems = (_deeperState['deeper_' + key + '_acts_items'] || []).filter(i => i && i.trim());
      fillRecapBlock(document.getElementById('recap-acts-' + key), actsItems);
    }
    if (qtype === 'control') {
      const controlItemsKey  = 'deeper_' + key + '_control_items';
      const controlPrePopKey = 'deeper_' + key + '_control_prepopulated';

      // Recompute current non-achievable vision items
      const vYn = _deeperState['deeper_' + key + '_vision_yn'];
      const vItems = (vYn === 'yes' || vYn === 'partially')
        ? (_deeperState['deeper_' + key + '_vision_items'] || []).filter(i => i && i.trim())
        : [];
      const achievable    = _deeperState['deeper_' + key + '_vision_item_achievable'] || {};
      const notAchievable = vItems.filter((_, i) => achievable[i] === 'no');
      const prevPrePop    = _deeperState[controlPrePopKey] || [];

      // Remove previously pre-populated items that are no longer non-achievable
      if (prevPrePop.length) {
        const removed = prevPrePop.filter(item => !notAchievable.includes(item));
        if (removed.length) {
          _deeperState[controlItemsKey] = (_deeperState[controlItemsKey] || []).filter(i => !removed.includes(i));
        }
      }

      // Add any new non-achievable items not already in the list
      const existing = (_deeperState[controlItemsKey] || []).filter(i => i && i.trim());
      const toAdd = notAchievable.filter(item => !existing.includes(item));
      if (toAdd.length) {
        _deeperState[controlItemsKey] = [...existing, ...toAdd, ''];
        renderControlList(key);
      } else if (!existing.length && !prevPrePop.length) {
        // first visit, nothing to pre-populate
      } else {
        renderControlList(key);
      }
      _deeperState[controlPrePopKey] = notAchievable;

      const subEl     = document.getElementById('deeper-sub-' + key + '-control');
      const ynField   = subEl?.querySelector('.yn-field');
      const expand    = subEl?.querySelector('.yn-expand');
      const ynBtns    = ynField?.querySelector('.yn-btns');
      const ynErr     = ynField?.querySelector('.yn-error');
      const ynLabel   = ynField?.querySelector('label');

      if (notAchievable.length) {
        // Pre-populated mode: hide Yes/No, show list directly
        if (ynLabel) ynLabel.textContent = 'These things cannot be changed and must therefore be accepted. Are there any others?';
        if (ynBtns) ynBtns.hidden = true;
        if (ynErr)  ynErr.hidden  = true;
        if (ynField) ynField.dataset.noValidate = '1';
        _deeperState['deeper_' + key + '_control_yn'] = 'yes';
        if (expand) expand.hidden = false;
      } else {
        // Normal mode: restore Yes/No question
        if (ynLabel) ynLabel.textContent = 'Is there anything about the above that you cannot change and must therefore accept?';
        if (ynBtns) ynBtns.hidden = false;
        if (ynErr)  ynErr.hidden  = false;
        if (ynField) delete ynField.dataset.noValidate;
        if (expand) expand.hidden = _deeperState['deeper_' + key + '_control_yn'] !== 'yes';
        // Reset answer only if list is empty
        const remaining = (_deeperState[controlItemsKey] || []).filter(i => i && i.trim());
        if (!remaining.length) _deeperState['deeper_' + key + '_control_yn'] = '';
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
    }
    if (qtype === 'vision-commitment') {
      renderVisionCommitment(key);
    }
  }
  window._deeperSubPageCount = allSubPages.length;
  window._deeperSubPageIdx = 0;
  window._showDeeperSubPage = showDeeperSubPage;
  showDeeperSubPage(0);

  selectedKeys.forEach(k => { renderCauseList(k); renderSimpleBulletList('acts-doing-' + k, 'deeper_' + k + '_acts_doing_items', 'Describe what you are doing…'); renderSimpleBulletList('acts-not-doing-' + k, 'deeper_' + k + '_acts_not_doing_items', 'Describe what you could be doing…'); renderActsGroups(k); renderControlList(k); renderControlAttitude(k); renderVisionList(k); });

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

  function scrollToVisible(el) {
    const offset = (document.getElementById('bar')?.offsetHeight || 0) + 24;
    window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - offset, behavior: 'smooth' });
  }

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
      scrollToVisible(unansweredYn);
      setFormErr('Please select an answer before continuing.');
      return false;
    }

    if (qtype === 'cause') {
      const causes = (_deeperState['deeper_' + key + '_causes'] || []).filter(c => c && c.trim());
      if (!causes.length) {
        const cl = document.getElementById('cause-list-' + key);
        if (cl) scrollToVisible(cl);
        setFormErr('Please add at least one reason before continuing.');
        return false;
      }
    }

    if (qtype === 'control' && _deeperState['deeper_' + key + '_control_yn'] === 'no' &&
        _deeperState['deeper_' + key + '_acts_yn'] === 'no') {
      setFormErr("Hold on — your situation has to consist of things you're contributing to, things that are outside your control and must be accepted, or both. There is no situation in which it's neither. Please go back and reconsider one of your answers.");
      return false;
    }

    if (qtype === 'control' && _deeperState['deeper_' + key + '_control_yn'] === 'yes') {
      const filledItems = (_deeperState['deeper_' + key + '_control_items'] || []).filter(i => i && i.trim());
      if (!filledItems.length) {
        const cl = document.getElementById('control-list-' + key);
        if (cl) scrollToVisible(cl);
        setFormErr('Please add at least one circumstance before continuing.');
        return false;
      }
    }

    if (qtype === 'control-attitude') {
      const filledItems = (_deeperState['deeper_' + key + '_control_items'] || []).filter(i => i && i.trim());
      const feelings  = _deeperState['deeper_' + key + '_control_feeling'] || {};
      const feelingYn = _deeperState['deeper_' + key + '_control_feeling_yn'] || {};
      const attEl = document.getElementById('control-attitude-' + key);
      for (const item of filledItems) {
        if (!feelings[item]?.trim()) {
          if (attEl) scrollToVisible(attEl);
          setFormErr('Please describe how you feel about each circumstance before continuing.');
          return false;
        }
        if (!feelingYn[item]) {
          if (attEl) scrollToVisible(attEl);
          setFormErr('Please answer whether this is how you want to feel before continuing.');
          return false;
        }
      }
    }

    if (qtype === 'acts-list') {
      const doing    = (_deeperState['deeper_' + key + '_acts_doing_items'] || []).filter(i => i && i.trim());
      const notDoing = (_deeperState['deeper_' + key + '_acts_not_doing_items'] || []).filter(i => i && i.trim());
      if (!doing.length && !notDoing.length) {
        setFormErr('Please add at least one item before continuing.');
        return false;
      }
    }

    if (qtype === 'acts-values') {
      const filledItems = (_deeperState['deeper_' + key + '_acts_items'] || []).filter(i => i && i.trim());
      const groups = _deeperState['deeper_' + key + '_acts_groups'] || [];
      const allCovered = filledItems.every(item =>
        groups.some(g => Array.isArray(g.selected) && g.selected.includes(item) && g.value && g.value.trim())
      );
      if (!allCovered) {
        const gc = document.getElementById('acts-value-groups-' + key);
        const vgWrap = gc?.querySelector('.acts-vg-wrap');
        if (vgWrap) scrollToVisible(vgWrap);
        setFormErr('Every action needs at least one value attributed to it before continuing.');
        return false;
      }
    }



    if (qtype === 'vision-describe') {
      const yn = _deeperState['deeper_' + key + '_vision_yn'];
      if (yn === 'yes' || yn === 'partially') {
        const vItems = (_deeperState['deeper_' + key + '_vision_items'] || []).filter(i => i && i.trim());
        if (!vItems.length) {
          const vc = document.getElementById('vision-list-' + key);
          if (vc) scrollToVisible(vc);
          setFormErr('Please describe what it would take before continuing.');
          return false;
        }
      }
      const unchecked = [...subEl.querySelectorAll('.vision-actual-field')].find(f => !f.closest('[hidden]') && !f.querySelector('.vision-actual-check')?.checked);
      if (unchecked) {
        scrollToVisible(unchecked);
        setFormErr('Please confirm before continuing.');
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
        const gc = document.getElementById('vision-item-achievable-' + key);
        if (gc) scrollToVisible(gc);
        setFormErr('Please mark each point as achievable or not before continuing.');
        return false;
      }
    }

    if (qtype === 'vision-achievable-check') {
      const _vYnChk = _deeperState['deeper_' + key + '_vision_yn'];
      const _vItemsChk = (_vYnChk === 'yes' || _vYnChk === 'partially')
        ? (_deeperState['deeper_' + key + '_vision_items'] || []).filter(i => i && i.trim())
        : [];
      const _achChk = _deeperState['deeper_' + key + '_vision_item_achievable'] || {};
      const _allNotAch = _vItemsChk.length > 0 && _vItemsChk.every((_, i) => _achChk[i] === 'no');
      if (_allNotAch) {
        _deeperState['deeper_' + key + '_vision_achievable_check'] = 'revise';
      } else if (!_deeperState['deeper_' + key + '_vision_achievable_check']) {
        const gc = document.getElementById('vision-achievable-check-' + key);
        if (gc) scrollToVisible(gc);
        setFormErr('Please answer before continuing.');
        return false;
      }
    }

    if (qtype === 'vision-revised') {
      const revised = (_deeperState['deeper_' + key + '_vision_revised_items'] || []).filter(i => i && i.trim());
      if (!revised.length) {
        const gc = document.getElementById('vision-revised-' + key);
        if (gc) scrollToVisible(gc);
        setFormErr('Please describe your revised vision before continuing.');
        return false;
      }
    }

    if (qtype === 'vision-commitment') {
      if (!_deeperState['deeper_' + key + '_commitment_yn']) {
        const gc = document.getElementById('deeper-sub-' + key + '-vision-commitment');
        if (gc) scrollToVisible(gc);
        setFormErr('Please select one before continuing.');
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
    { id: 'q7', type: 'singleselect', headline: 'The stakes',
      label: 'If your life looks exactly the same in 3 years from now, how would you feel?',
      options: ["I'd be fine with it", "Disappointing, but I'd manage", "Like I'd wasted something important", "Unacceptable — it cannot happen"] },
    { id: 'q2', type: 'singleselect', headline: 'Readiness',
      label: 'Do you feel like you have the mental and emotional capacity to tackle your challenges and create change right now?',
      options: ['Yes, whatever it takes', 'Yes, but I need to go easy on myself', "No, I'm exhausted"] },
    { id: 'q3', type: 'multiselect', headline: 'Inner state',
      label: 'Do you struggle with any of these on a regular basis?',
      options: ['Anxiety', 'Depression', 'Apathy', 'Anger or resentment', 'Frustration or pressure', 'Meaninglessness', 'Panic attacks', 'Hypochondria', 'Other'],
      other: 'Other' },
    { id: 'q4', type: 'multiselect', headline: 'Compulsive patterns',
      label: 'Do you struggle with any addictions or compulsive habits?',
      options: ['Alcohol', 'Drugs', 'Pornography', 'Gambling', 'Social media', 'Gaming', 'Food', 'Shopping', 'Other'],
      other: 'Other' },
    { id: 'q5l', type: 'multiselect', headline: 'Lifestyle',
      label: 'Which of the following do you struggle to maintain consistently?',
      options: ['Sleep', 'Exercise', 'Healthy eating', 'Social connection', 'Time outdoors', 'Downtime / switching off', 'Hobbies or creative outlets', 'None of the above'] },
    { id: 'q5', type: 'scale5', headline: 'The mainstream',
      label: 'How do you feel when you imagine living the life of mainstream society — a steady job, a mortgage, blending in?',
      low: 'Totally fine with it', high: "Can't think of anything worse" },
    { id: 'q6', type: 'multiselect', headline: 'Track record',
      label: 'In the past year, which of these have you actually done?',
      options: ["Had a difficult conversation I'd been avoiding", 'Changed a habit or routine', 'Sought professional help', 'Invested money in my own development', 'Left something behind to grow', 'None of the above'],
      none: 'None of the above' },
    { id: 'q8', type: 'tried', headline: 'Prior attempts',
      label: 'Have you tried to address your challenges before?' },
    { id: 'q9', type: 'textarea', headline: 'The cost',
      label: 'What is staying where you are costing you?' },
    { id: 'q10', type: 'scale5', headline: 'Truth and directness',
      label: 'How much do you actually want honesty over comfort?',
      low: 'Comfort over honesty', high: 'Honesty above all' },
  ];

  container.innerHTML = '';

  questions.forEach(q => {
    const page = document.createElement('div');
    page.className = 'deeper-subpage';
    page.id = 'fs-sub-' + q.id;
    page.hidden = true;

    const headTitle = document.createElement('h3');
    headTitle.className = 'deeper-area-name';
    headTitle.textContent = q.headline;
    page.appendChild(headTitle);

    const qlbl = document.createElement('p');
    qlbl.className = 'fulfillment-area-desc';
    qlbl.textContent = q.label;
    page.appendChild(qlbl);

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
        fLbl.style.cssText = 'font-family:var(--sc);font-size:.78rem;letter-spacing:.15em;color:var(--ink);display:block;margin-bottom:.7rem;text-align:center';
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
      q.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'yn-btn' + (_fsState['fs_' + q.id] === opt ? ' selected' : '');
        btn.textContent = opt;
        btn.addEventListener('click', () => {
          btns.querySelectorAll('.yn-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          _fsState['fs_' + q.id] = opt;
          if (window.clearFormError) window.clearFormError();
        });
        btns.appendChild(btn);
      });
      field.appendChild(btns);
    }

    if (q.type === 'multiselect') {
      if (!Array.isArray(_fsState['fs_' + q.id])) _fsState['fs_' + q.id] = [];
      const checks = document.createElement('div');
      checks.className = 'acts-checkboxes';
      checks.style.cssText = 'margin-top:.8rem;max-width:fit-content;margin-left:auto;margin-right:auto';
      const cbEls = [];
      let otherWrap = null;
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
      });
      if (q.other) {
        otherWrap = document.createElement('div');
        otherWrap.hidden = !_fsState['fs_' + q.id].includes(q.other);
        otherWrap.style.cssText = 'margin-left:1.6rem;margin-top:.4rem';
        const otherInp = document.createElement('input');
        otherInp.type = 'text';
        otherInp.className = 'cause-input';
        otherInp.placeholder = 'Please specify...';
        otherInp.style.width = '100%';
        otherInp.value = _fsState['fs_' + q.id + '_other'] || '';
        otherInp.addEventListener('input', () => { _fsState['fs_' + q.id + '_other'] = otherInp.value; });
        otherWrap.appendChild(otherInp);
        checks.appendChild(otherWrap);
      }
      field.appendChild(checks);
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

    if (q.type === 'tried') {
      const btns = document.createElement('div');
      btns.className = 'yn-btns';
      const expand = document.createElement('div');
      expand.hidden = _fsState['fs_q8_yn'] !== 'yes';
      expand.style.marginTop = '1.4rem';

      const mkTaField = (label, key) => {
        const wrap = document.createElement('div');
        wrap.className = 'deeper-field';
        wrap.style.marginTop = '1.2rem';
        const l = document.createElement('label'); l.textContent = label;
        const ta = document.createElement('textarea');
        ta.className = 'cause-input';
        ta.style.cssText = 'width:100%;min-height:3.5rem;resize:vertical;margin-top:.5rem;box-sizing:border-box';
        ta.value = _fsState[key] || '';
        ta.addEventListener('input', () => { _fsState[key] = ta.value; });
        wrap.appendChild(l); wrap.appendChild(ta);
        return wrap;
      };
      expand.appendChild(mkTaField('What did you try?', 'fs_q8_what'));

      const hwWrap = document.createElement('div');
      hwWrap.className = 'deeper-field';
      hwWrap.style.marginTop = '1.2rem';
      const hwLbl = document.createElement('label'); hwLbl.textContent = 'How well did it work? (1–10)';
      const hwRow = document.createElement('div');
      hwRow.className = 'number-scale';
      hwRow.style.marginTop = '.5rem';
      for (let i = 1; i <= 10; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'number-btn' + (_fsState['fs_q8_how_well'] === i ? ' selected' : '');
        btn.textContent = i;
        btn.addEventListener('click', () => {
          hwRow.querySelectorAll('.number-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          _fsState['fs_q8_how_well'] = i;
        });
        hwRow.appendChild(btn);
      }
      hwWrap.appendChild(hwLbl); hwWrap.appendChild(hwRow);
      expand.appendChild(hwWrap);
      expand.appendChild(mkTaField("Why didn't it fully work?", 'fs_q8_why'));

      ['yes', 'no'].forEach(val => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'yn-btn' + (_fsState['fs_q8_yn'] === val ? ' selected' : '');
        btn.textContent = val === 'yes' ? 'Yes' : 'No';
        btn.addEventListener('click', () => {
          btns.querySelectorAll('.yn-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          _fsState['fs_q8_yn'] = val;
          expand.hidden = val !== 'yes';
          if (window.clearFormError) window.clearFormError();
        });
        btns.appendChild(btn);
      });
      field.appendChild(btns);
      field.appendChild(expand);
    }

    if (q.type === 'textarea') {
      const ta = document.createElement('textarea');
      ta.className = 'cause-input';
      ta.style.cssText = 'width:100%;min-height:5rem;resize:vertical;margin-top:.8rem;box-sizing:border-box';
      ta.value = _fsState['fs_' + q.id] || '';
      ta.addEventListener('input', () => { _fsState['fs_' + q.id] = ta.value; });
      field.appendChild(ta);
    }

    page.appendChild(field);
    container.appendChild(page);
  });

  window._fitSubPageCount = questions.length;
  window._fitSubPageIdx = 0;

  const fsSections = [
    { num: '06', title: 'Inner State.', desc: 'A look at your emotional and psychological baseline — the internal conditions from which everything else arises.', maxIdx: 3 },
    { num: '07', title: 'Personality.', desc: 'A look at who you are and what actually drives you — beneath the surface-level goals.', maxIdx: Infinity }
  ];

  function updateFsHeader(idx) {
    const sec = fsSections.find(s => idx <= s.maxIdx);
    const el = document.getElementById('fs-section-head');
    if (!el || !sec) return;
    el.innerHTML = `<span class="num">${sec.num}</span><div><h2>${sec.title}</h2><p>${sec.desc}</p></div>`;
  }

  window._showFitSubPage = function(idx) {
    container.querySelectorAll('.deeper-subpage').forEach((el, i) => { el.hidden = i !== idx; });
    window._fitSubPageIdx = idx;
    updateFsHeader(idx);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (!window._historyNav) history.pushState({ step: 5, sub: idx }, '');
  };

  window._validateFitSubPage = function(idx) {
    const q = questions[idx];
    clearFormErr();
    if (q.type === 'yesno' && !_fsState['fs_' + q.id]) {
      setFormErr('Please select an answer before continuing.'); return false;
    }
    if (q.type === 'singleselect' && !_fsState['fs_' + q.id]) {
      setFormErr('Please select an answer before continuing.'); return false;
    }
    if (q.type === 'multiselect' && !_fsState['fs_' + q.id]?.length) {
      setFormErr('Please select at least one option before continuing.'); return false;
    }
    if (q.type === 'scale5' && !_fsState['fs_' + q.id]) {
      setFormErr('Please select a number before continuing.'); return false;
    }
    if (q.type === 'tried') {
      if (!_fsState['fs_q8_yn']) { setFormErr('Please select an answer before continuing.'); return false; }
      if (_fsState['fs_q8_yn'] === 'yes') {
        if (!_fsState['fs_q8_what']?.trim()) { setFormErr('Please describe what you tried before continuing.'); return false; }
        if (!_fsState['fs_q8_how_well']) { setFormErr('Please rate how well it worked before continuing.'); return false; }
        if (!_fsState['fs_q8_why']?.trim()) { setFormErr("Please explain why it didn't fully work before continuing."); return false; }
      }
    }
    if (q.type === 'textarea' && !_fsState['fs_' + q.id]?.trim()) {
      setFormErr('Please write your answer before continuing.'); return false;
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
  if (step === 2) initUrgencyStep();
  if (step === 3) initFocusStep();
  if (step === 4) initDeeperStep();
  if (step === 5) initFitSignalsStep();
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
  if (window.stopStopwatch) window.stopStopwatch();
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
