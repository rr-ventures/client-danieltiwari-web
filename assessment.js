/* ============================================================
   Daniel Tiwari — assessment form behaviour
   Scoring + result render live in assessment-core.js (shared with
   the hosted result page). This file owns the live quiz: step
   initialization, one-at-a-time fulfillment, and submission.
   ============================================================ */

const _scaleState = {};       // "urgency_career": "2"
const _fulfillmentState = {}; // "career": "7"
const _deeperState = {};      // "career_cause": "...", "career_vision": "..."
let _fulfillmentKeyHandler = null;
let _spilloverState = null;

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
    <h3 class="fulfillment-area-label">${label}</h3>
    ${desc ? `<p class="fulfillment-area-desc">${desc}</p>` : ""}
    <div class="number-scale">
      ${[1,2,3,4,5,6,7,8,9,10].map(n => `<button type="button" class="number-btn" data-val="${n}">${n}</button>`).join("")}
    </div>
    <div class="scale-legend-card"><span>not fulfilled</span><span>fully fulfilled</span></div>
    <p class="area-counter sc">${index + 1} / ${AREAS.length}</p>
    <div class="fulfillment-nav">
      ${!isFirst ? `<button type="button" class="btn btn-ghost fulfillment-back-btn">← Back</button>` : ""}
      <button type="button" class="btn btn-primary fulfillment-next-btn">${isLast ? "Continue →" : "Next →"}</button>
    </div>
    <p class="fulfillment-error">Please select a number first.</p>
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
    const n = e.key === "0" ? 10 : (parseInt(e.key) >= 1 && parseInt(e.key) <= 9 ? parseInt(e.key) : null);
    if (!n) return;
    card.querySelector(`.number-btn[data-val="${n}"]`)?.click();
  };
  document.addEventListener("keydown", _fulfillmentKeyHandler);
  if (!isFirst) {
    card.querySelector(".fulfillment-back-btn").addEventListener("click", () => {
      if (selected) _fulfillmentState[key] = selected;
      const prevKey = AREAS[index - 1][0];
      const prevInput = document.querySelector(`#fulfillment-inputs input[name="fulfillment_${prevKey}"]`);
      const prevVal = prevInput?.value || null;
      if (prevInput) prevInput.remove();
      renderFulfillmentCard(index - 1, prevVal);
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
  });

  window._validateRanking = window._validateRanking || {};
  window._validateRanking[containerId] = function() {
    if (!hasMoved) {
      warning.classList.add("visible");
      warning.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return false;
    }
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
    : new Set(ranked.slice(0, 2).map(a => a.key));

  function getReason(area) {
    const urgencyRank = n + 1 - area.urgency;
    const importanceRank = n + 1 - area.importance;
    if (urgencyRank <= 2) return `most urgent · ${area.fulfillment}/10 fulfilled`;
    if (area.fulfillment <= 3) return `${area.fulfillment}/10 fulfilled · #${importanceRank} in importance`;
    if (urgencyRank <= 4) return `#${urgencyRank} most urgent · ${area.fulfillment}/10 fulfilled`;
    return `#${importanceRank} in importance · ${area.fulfillment}/10 fulfilled`;
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
          if (selected.size > 1) selected.delete(key);
        } else {
          if (selected.size >= 2) {
            const lowest = ranked.slice().reverse().find(a => selected.has(a.key));
            if (lowest) selected.delete(lowest.key);
          }
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
  }
  build();
}

/* ---- Shared: bullet list + value groups (acts & omits) ---- */
function renderItemValueGroups(key, type, itemPlaceholder, valueLabel) {
  const container = document.getElementById(type + '-groups-' + key);
  if (!container) return;
  const itemsKey  = 'deeper_' + key + '_' + type + '_items';
  const groupsKey = 'deeper_' + key + '_' + type + '_groups';

  if (!Array.isArray(_deeperState[itemsKey])) _deeperState[itemsKey] = [''];
  const items = _deeperState[itemsKey];
  if (!Array.isArray(_deeperState[groupsKey])) _deeperState[groupsKey] = [{ selected: [], value: '' }];
  const groups = _deeperState[groupsKey];

  function syncItems() {
    _deeperState[itemsKey] = items;
    const h = container.querySelector('input[name="' + itemsKey + '"]');
    if (h) h.value = JSON.stringify(items);
    refreshValueGroups();
  }
  function syncGroups() {
    _deeperState[groupsKey] = groups;
    const h = container.querySelector('input[name="' + groupsKey + '"]');
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
    addBtn.textContent = '+ Add another value group';
    addBtn.addEventListener('click', () => { groups.push({ selected: [], value: '' }); buildValueGroups(vgEl); syncGroups(); });
    vgEl.appendChild(addBtn);
  }

  function refreshValueGroups() {
    const filledItems = items.filter(it => it && it.trim());
    const vgWrap = container.querySelector('.' + type + '-vg-wrap');
    if (!vgWrap) return;
    vgWrap.hidden = filledItems.length === 0;
    if (filledItems.length) { const vgEl = vgWrap.querySelector('.' + type + '-vg-inner'); if (vgEl) buildValueGroups(vgEl); }
  }

  function build() {
    container.innerHTML = '';
    const listEl = document.createElement('div');
    buildItemList(listEl);
    container.appendChild(listEl);

    const vgWrap = document.createElement('div');
    vgWrap.className = type + '-vg-wrap deeper-field';
    vgWrap.hidden = items.filter(it => it && it.trim()).length === 0;
    vgWrap.style.marginTop = '1.4rem';
    const vgLbl = document.createElement('label');
    vgLbl.textContent = valueLabel;
    vgWrap.appendChild(vgLbl);
    const vgInner = document.createElement('div');
    vgInner.className = type + '-vg-inner';
    buildValueGroups(vgInner);
    vgWrap.appendChild(vgInner);
    container.appendChild(vgWrap);

    const hiddenItems = document.createElement('input');
    hiddenItems.type = 'hidden';
    hiddenItems.name = itemsKey;
    hiddenItems.value = JSON.stringify(items);
    container.appendChild(hiddenItems);
    const hiddenGroups = document.createElement('input');
    hiddenGroups.type = 'hidden';
    hiddenGroups.name = groupsKey;
    hiddenGroups.value = JSON.stringify(groups);
    container.appendChild(hiddenGroups);
  }

  build();
}

function renderActsGroups(key) {
  renderItemValueGroups(key, 'acts',
    'Describe what you are doing…',
    "What values are each of those actions serving? Be brutally honest — they may be values you don't consciously approve of.");
}

function renderOmitsGroups(key) {
  renderItemValueGroups(key, 'omits',
    'Describe what you are NOT doing…',
    "What values are each of those inactions serving? Be brutally honest — they may be values you don't consciously approve of.");
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
  }
  build();
}

/* ---- Control attitude per-item Yes/No ---- */
function renderControlAttitude(key) {
  const container = document.getElementById('control-attitude-' + key);
  if (!container) return;
  const items = (_deeperState['deeper_' + key + '_control_items'] || []).filter(i => i && i.trim());
  container.hidden = items.length === 0;
  if (!items.length) { container.innerHTML = ''; return; }
  if (!_deeperState['deeper_' + key + '_control_attitude_answers'] ||
      typeof _deeperState['deeper_' + key + '_control_attitude_answers'] !== 'object') {
    _deeperState['deeper_' + key + '_control_attitude_answers'] = {};
  }
  const answers = _deeperState['deeper_' + key + '_control_attitude_answers'];

  function sync() {
    _deeperState['deeper_' + key + '_control_attitude_answers'] = answers;
    const h = container.querySelector('input[type="hidden"]');
    if (h) h.value = JSON.stringify(answers);
  }

  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'deeper-field';
  wrap.style.marginTop = '1.4rem';
  const lbl = document.createElement('label');
  lbl.textContent = 'Is your attitude towards and interpretation of each of these things serving you?';
  wrap.appendChild(lbl);
  const itemsDiv = document.createElement('div');
  itemsDiv.style.marginTop = '.8rem';
  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'control-attitude-item';
    const text = document.createElement('span');
    text.className = 'control-attitude-item-text';
    text.textContent = item;
    const btns = document.createElement('div');
    btns.className = 'yn-btns';
    ['yes', 'no'].forEach(val => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'yn-btn' + (answers[item] === val ? ' selected' : '');
      btn.textContent = val.charAt(0).toUpperCase() + val.slice(1);
      btn.addEventListener('click', () => {
        btns.querySelectorAll('.yn-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        answers[item] = val;
        sync();
      });
      btns.appendChild(btn);
    });
    row.appendChild(text);
    row.appendChild(btns);
    itemsDiv.appendChild(row);
  });
  wrap.appendChild(itemsDiv);
  container.appendChild(wrap);
  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.name = 'deeper_' + key + '_control_attitude_answers';
  hidden.value = JSON.stringify(answers);
  container.appendChild(hidden);
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

  container.innerHTML = selectedKeys.map(key => {
    const { label, desc } = areaMap[key] || { label: key, desc: '' };
    const data = wheelMap[key] || {};
    const urgencyFocused = (data.urgency || 0) > (data.importance || 0);
    const q3Toggle = `Are you consciously aware of what it would take for ${label} to be a 10/10?`;
    const q3Expand = urgencyFocused
      ? `What would need to be resolved, achieved, or in place…`
      : `Describe the version of this area that would feel fully alive…`;
    const controlYn    = _deeperState[`deeper_${key}_control_yn`] || '';
    const controlItems = _deeperState[`deeper_${key}_control_items`] || [];
    const actsYn       = _deeperState[`deeper_${key}_acts_yn`] || '';
    const omitsYn = _deeperState[`deeper_${key}_omits_yn`] || '';
    const visionYn       = _deeperState[`deeper_${key}_vision_yn`] || '';
    const visionVal      = _deeperState[`deeper_${key}_vision`] || '';
    const visionValues   = _deeperState[`deeper_${key}_vision_values`] || '';
    const visionActualYn = _deeperState[`deeper_${key}_vision_actual_yn`] || '';
    return `
      <div class="deeper-block">
        <div class="deeper-block-head">
          <p class="deeper-area-name">${label}</p>
          ${desc ? `<p class="deeper-area-desc">${desc}</p>` : ''}
        </div>
        <div class="deeper-field">
          <label>Why does ${label} only feel like a ${data.fulfillment}/10 right now? List everything you can come up with.</label>
          <div id="cause-list-${key}"></div>
        </div>
        <div class="deeper-field yn-field" data-key="${key}" data-role="acts">
          <label>Is there anything <strong>you</strong> are doing that is contributing to the above? If multiple things, list them all.</label>
          <div class="yn-btns">
            <button type="button" class="yn-btn${actsYn === 'yes' ? ' selected' : ''}" data-val="yes">Yes</button>
            <button type="button" class="yn-btn${actsYn === 'no'  ? ' selected' : ''}" data-val="no">No</button>
          </div>
          <p class="yn-error">Please select one.</p>
          <div class="yn-expand" ${actsYn !== 'yes' ? 'hidden' : ''}>
            <div id="acts-groups-${key}" style="margin-top:.5rem"></div>
          </div>
        </div>
        <div class="deeper-field yn-field" data-key="${key}" data-role="control">
          <label>Is there anything that on the other hand you feel like is NOT in your control?</label>
          <div class="yn-btns">
            <button type="button" class="yn-btn${controlYn === 'yes' ? ' selected' : ''}" data-val="yes">Yes</button>
            <button type="button" class="yn-btn${controlYn === 'no'  ? ' selected' : ''}" data-val="no">No</button>
          </div>
          <p class="yn-error">Please select one.</p>
          <div class="yn-expand" ${controlYn !== 'yes' ? 'hidden' : ''}>
            <div id="control-list-${key}" style="margin-top:.9rem"></div>
            <div id="control-attitude-${key}" ${controlItems.filter(i => i && i.trim()).length ? '' : 'hidden'}></div>
          </div>
        </div>
        <div class="deeper-field yn-field" data-key="${key}" data-role="vision">
          <label>${q3Toggle}</label>
          <div class="yn-btns">
            <button type="button" class="yn-btn${visionYn === 'yes'       ? ' selected' : ''}" data-val="yes">Yes</button>
            <button type="button" class="yn-btn${visionYn === 'partially' ? ' selected' : ''}" data-val="partially">Partially</button>
            <button type="button" class="yn-btn${visionYn === 'no'        ? ' selected' : ''}" data-val="no">No</button>
          </div>
          <p class="yn-error">Please select one.</p>
          <div class="yn-expand" ${(visionYn === 'yes' || visionYn === 'partially') ? '' : 'hidden'}>
            <div class="deeper-field" style="margin-top:.9rem">
              <label for="deeper_${key}_vision">Describe it.</label>
              <textarea id="deeper_${key}_vision" name="deeper_${key}_vision" ${(visionYn === 'yes' || visionYn === 'partially') ? 'required' : ''} placeholder="${q3Expand}">${visionVal}</textarea>
            </div>
            <div class="values-reveal" ${visionVal ? '' : 'hidden'}>
              <div class="deeper-field vision-actual-field" data-key="${key}">
                <label>Are you sure you <strong>ACTUALLY WANT THIS?</strong> Or is this something you think you're <strong>SUPPOSED TO</strong> want, or <strong>WOULD LIKE TO</strong> want, but don't really?</label>
                <label class="confirm-check-wrap">
                  <input type="checkbox" class="vision-actual-check" name="deeper_${key}_vision_actual" value="yes" ${visionActualYn === 'yes' ? 'checked' : ''}>
                  <span class="confirm-check-box"></span>
                  <span class="confirm-check-text">I genuinely want this</span>
                </label>
                <p class="yn-error">Please confirm before continuing.</p>
              </div>
            </div>
          </div>
        </div>
        <div class="deeper-field yn-field" data-key="${key}" data-role="omits">
          <label>Is there anything that <strong>you</strong> are NOT doing but COULD be doing that would improve ${label}?</label>
          <div class="yn-btns">
            <button type="button" class="yn-btn${omitsYn === 'yes' ? ' selected' : ''}" data-val="yes">Yes</button>
            <button type="button" class="yn-btn${omitsYn === 'no'  ? ' selected' : ''}" data-val="no">No</button>
          </div>
          <p class="yn-error">Please select one.</p>
          <div class="yn-expand" ${omitsYn !== 'yes' ? 'hidden' : ''}>
            <div id="omits-groups-${key}" style="margin-top:.5rem"></div>
          </div>
        </div>
      </div>`;
  }).join('');

  selectedKeys.forEach(k => { renderCauseList(k); renderActsGroups(k); renderOmitsGroups(k); renderControlList(k); renderControlAttitude(k); });

  // Wire up toggle buttons
  container.querySelectorAll('.yn-field').forEach(field => {
    const key = field.dataset.key;
    const role = field.dataset.role;
    const stateKey = `deeper_${key}_${role}_yn`;
    const expand = field.querySelector('.yn-expand');
    const textareas = expand.querySelectorAll('textarea');
    const error = field.querySelector('.yn-error');
    const expandOn = role === 'vision'
      ? (val) => val === 'yes' || val === 'partially'
      : (val) => val === 'yes';
    field.querySelectorAll('.yn-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        field.querySelectorAll('.yn-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const val = btn.dataset.val;
        _deeperState[stateKey] = val;
        expand.hidden = !expandOn(val);
        textareas.forEach(ta => { ta.required = expandOn(val); });
        error.classList.remove('visible');
      });
    });
  });

  // Show values-reveal when textarea has content; wire confirm checkbox; uncheck on vision edit
  container.querySelectorAll('.yn-expand').forEach(expand => {
    const whatIsIt = expand.querySelector('textarea');
    const valuesReveal = expand.querySelector('.values-reveal');
    if (!whatIsIt || !valuesReveal) return;
    const valuesTa = valuesReveal.querySelector('textarea');
    const confirmCheck = valuesReveal.querySelector('.vision-actual-check');
    const confirmError = valuesReveal.querySelector('.yn-error');
    const visionField = expand.closest('.yn-field');

    if (confirmCheck) {
      confirmCheck.addEventListener('change', () => {
        _deeperState[`deeper_${visionField?.dataset.key}_vision_actual_yn`] = confirmCheck.checked ? 'yes' : '';
        if (confirmError) confirmError.classList.remove('visible');
      });
    }

    whatIsIt.addEventListener('input', () => {
      const hasContent = whatIsIt.value.trim().length > 0;
      valuesReveal.hidden = !hasContent;
      if (valuesTa) valuesTa.required = hasContent;
      if (confirmCheck && confirmCheck.checked) {
        confirmCheck.checked = false;
        _deeperState[`deeper_${visionField?.dataset.key}_vision_actual_yn`] = '';
      }
    });
  });

  // Persist textarea values on input
  container.querySelectorAll('textarea').forEach(ta => {
    ta.addEventListener('input', () => { _deeperState[ta.name] = ta.value; });
  });

  function scrollToVisible(el) {
    const offset = (document.getElementById('bar')?.offsetHeight || 0) + 24;
    window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - offset, behavior: 'smooth' });
  }

  // Custom validator — checks yn selection + required fields
  window._validateDeeper = function() {
    let valid = true;
    container.querySelectorAll('.yn-field').forEach(field => {
      const error = field.querySelector('.yn-error');
      if (!field.querySelector('.yn-btn.selected')) {
        error.classList.add('visible');
        if (valid) scrollToVisible(field);
        valid = false;
      } else {
        error.classList.remove('visible');
      }
    });
    container.querySelectorAll('.vision-actual-field').forEach(field => {
      if (field.closest('[hidden]')) return;
      const check = field.querySelector('.vision-actual-check');
      const error = field.querySelector('.yn-error');
      if (check && !check.checked) {
        error.classList.add('visible');
        if (valid) scrollToVisible(field);
        valid = false;
      } else if (error) {
        error.classList.remove('visible');
      }
    });
    // Validate cause lists
    for (const k of selectedKeys) {
      const causes = (_deeperState['deeper_' + k + '_causes'] || []).filter(c => c && c.trim());
      if (!causes.length) {
        const cl = document.getElementById('cause-list-' + k);
        const inp = cl?.querySelector('.cause-input');
        if (inp) { inp.setCustomValidity('Please add at least one reason.'); inp.reportValidity(); inp.setCustomValidity(''); }
        if (valid && cl) scrollToVisible(cl);
        valid = false;
      }
    }
    // Validate acts (if acts answered yes: need ≥1 item, and ≥1 completed value group)
    for (const k of selectedKeys) {
      if (_deeperState['deeper_' + k + '_acts_yn'] !== 'yes') continue;
      const actItems = (_deeperState['deeper_' + k + '_acts_items'] || []).filter(i => i && i.trim());
      const groups = _deeperState['deeper_' + k + '_acts_groups'] || [];
      const groupOk = groups.some(g => Array.isArray(g.selected) && g.selected.length > 0 && g.value && g.value.trim());
      if (!actItems.length || !groupOk) {
        const gc = document.getElementById('acts-groups-' + k);
        if (valid && gc) scrollToVisible(gc);
        valid = false;
      }
    }
    if (!valid) return false;
    for (const f of container.querySelectorAll('textarea[required]')) {
      if (!f.reportValidity()) return false;
    }
    return true;
  };
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
  if (step === 3) initSpilloverStep();
  if (step === 4) initFocusStep();
  if (step === 5) initDeeperStep();
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
