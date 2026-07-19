/* ============================================================
   Daniel Tiwari — assessment form behaviour
   Scoring + result render live in assessment-core.js (shared with
   the hosted result page). This file owns the live quiz: step
   initialization, one-at-a-time fulfillment, and submission.
   ============================================================ */

const CAUSE_LIST_HINT = 'One reason per line — press "+ Add another" for the next.';
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
const _fulfillmentState = {}; // "career": "7"
const _deeperState = {};      // "career_cause": "...", "career_vision": "..."
const _fsState = {};          // fit signals answers
const _pageFeedbackState = {}; // testing-phase only: "page label" -> tester's free-text note
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
    urgency: document.querySelector(`input[name="urgency_${key}"]`) ? 1 : 0,
  }));
}

/* ---- Step 0: Fulfillment (one at a time) ---- */
function renderFulfillmentCard(index, savedVal = null) {
  const [key, label, desc] = AREAS[index];
  const isFirst = index === 0;
  const isLast = index === AREAS.length - 1;
  if (!savedVal) savedVal = _fulfillmentState[key] || null;
  window._fulfillmentCardIndex = index;
  const card = document.getElementById("fulfillment-card");
  card.innerHTML = `
    <h3 class="deeper-area-name">${label}</h3>
    ${desc ? `<p class="deeper-area-desc">${desc}</p>` : ""}
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
  // Fires after the card's HTML above is in place, not before — the page
  // feedback widget reads the area name straight from this card, so calling
  // this too early left it tagging notes with the previous area's name.
  if (window.updateAssessmentProgress) window.updateAssessmentProgress();
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
  const existingFocusKeys = new Set(
    [...document.querySelectorAll('#focus-hidden-inputs input')].map(i => i.value)
  );
  let selected = existingFocusKeys;

  function getReason(area) {
    if (area.urgency) return `flagged as urgent · ${area.fulfillment}/5 fulfilled`;
    return `${area.fulfillment}/5 fulfilled`;
  }

  function updateFocusInputs() {
    document.getElementById("focus-hidden-inputs").innerHTML =
      [...selected].map(key => `<input type="hidden" name="focus_area" value="${key}">`).join("");
  }

  function renderFocus() {
    const ranked = rankAllAreas(getWheelValues());

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
    if (hidden) hidden.value = JSON.stringify(dedupedForSubmit(causes));
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
    hidden.value = JSON.stringify(dedupedForSubmit(causes));
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

// Normalizes free-typed text into a stable lookup key (trim + lowercase), so the
// same value named under two different reasons is treated as the same answer.
function valueKey(s) {
  return (s || '').trim().toLowerCase();
}

// Shared by every repeatable free-text list (causes, values, feelings, vision,
// control items, etc): returns a COPY of `list` with case-insensitive/trimmed
// duplicates collapsed to their first occurrence — the extra rows are never
// removed from the page itself, only from what actually gets submitted/stored.
// `keyFn` extracts the comparable text — defaults to the entry itself, but
// list-of-objects callers (e.g. track record's `{ what, howWell, why }`) pass
// one to read the right field.
function dedupedForSubmit(list, keyFn = (v) => v) {
  const seen = new Set();
  return list.filter((v) => {
    const k = valueKey(keyFn(v));
    if (!k) return true;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Non-blank, case-insensitive/trimmed-distinct version of a raw typed list
// (causes/acts-items/control-items/vision-items), first-typed casing kept.
// Used wherever a later question builds one block PER typed item (e.g. the
// vision "achievable?" question, control-item feelings, acts reasons/values)
// so retyping the same item twice on the earlier list doesn't duplicate the
// later per-item question — the earlier list itself still shows every row.
function distinctNonBlank(list) {
  const seen = new Set();
  const out = [];
  (list || []).forEach((v) => {
    const t = (v || '').trim();
    if (!t) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  });
  return out;
}

// The individual action/inaction items named on the "Contributions" page for
// a given area.
function distinctActionsForArea(key) {
  return (_deeperState['deeper_' + key + '_acts_items'] || []).filter(it => it && it.trim());
}

// One node in a "why" tree: a single reason at a single depth. `children`
// holds what it deepens into — empty until the person digs deeper or splits
// it into more than one distinct reason, at which point every child ladders
// down independently. A childless node is a leaf: still being typed, or
// (once `terminal`) a stated hidden value. `id` is unique per node so the
// "keep living by this?" answer is tied to THIS specific reason, even if its
// wording happens to match a value stated elsewhere — the same word can be
// worth keeping in one context and not another.
let _whyNodeSeq = 0;
function makeWhyNode(text) {
  return { id: 'wn' + (++_whyNodeSeq), text: text || '', terminal: false, children: [] };
}

// Every "why" tree recorded for a given action — an array of root nodes
// (one per independent starting reason), each of which can itself branch at
// any depth. Initializes a single blank root the first time an action is seen.
function whyThreadsForAction(key, action) {
  const stateKey = 'deeper_' + key + '_why_threads';
  if (typeof _deeperState[stateKey] !== 'object' || !_deeperState[stateKey]) _deeperState[stateKey] = {};
  const byAction = _deeperState[stateKey];
  if (!Array.isArray(byAction[action]) || !byAction[action].length) {
    byAction[action] = [makeWhyNode('')];
  }
  return byAction[action];
}

function collectTerminalWhyLeaves(action, node, path, out) {
  const fullPath = path.concat(node.text);
  if (!node.children.length) {
    if (node.terminal) {
      const layers = dedupedForSubmit(fullPath);
      if (layers.length) out.push({ action, layers, value: layers[layers.length - 1], id: node.id });
    }
    return;
  }
  node.children.forEach((child) => collectTerminalWhyLeaves(action, child, fullPath, out));
}

// Every terminal leaf across every "why" tree for a given area — i.e. every
// real hidden value this page has produced so far, in order. Blank/abandoned
// branches are skipped.
function terminalWhyThreads(key) {
  const stateKey = 'deeper_' + key + '_why_threads';
  const byAction = _deeperState[stateKey] || {};
  const out = [];
  distinctActionsForArea(key).forEach((action) => {
    (byAction[action] || []).forEach((root) => collectTerminalWhyLeaves(action, root, [], out));
  });
  return out;
}

// True if some leaf in this tree has been typed into but never resolved
// (not marked as the final value, and not dug/split any further) — i.e. an
// abandoned reason blocking progress.
function whyTreeHasUnresolvedLeaf(node) {
  if (!node.children.length) return !node.terminal && !!(node.text && node.text.trim());
  return node.children.some(whyTreeHasUnresolvedLeaf);
}


// ---- Merged Reasons + Hidden Values page ----
// For each action/inaction, one or more independent "why" trees (see
// makeWhyNode). Each node lets the person dig one layer deeper ("why does
// THAT matter to you?"), split into more than one distinct reason if a
// single answer actually bundles several motives, or mark itself the real,
// terminal reason — at which point it's treated as the hidden value being
// served, and they're asked whether they want to keep living by it. An
// action can run more than one root reason, and any reason at any depth can
// itself branch the same way.
function renderActsWhyLadders(key) {
  const container = document.getElementById('acts-why-groups-' + key);
  if (!container) return;
  const items = distinctActionsForArea(key);
  container.innerHTML = '';
  if (!items.length) return;

  const threadsHidden = document.createElement('input');
  threadsHidden.type = 'hidden';
  threadsHidden.name = 'deeper_' + key + '_why_threads';
  function serializeWhyNode(node) {
    return { text: node.text, terminal: node.terminal, children: node.children.map(serializeWhyNode) };
  }
  function syncThreadsHidden() {
    const byAction = _deeperState['deeper_' + key + '_why_threads'] || {};
    const out = {};
    Object.keys(byAction).forEach((action) => {
      out[action] = byAction[action].map(serializeWhyNode);
    });
    threadsHidden.value = JSON.stringify(out);
  }

  const continueKey = 'deeper_' + key + '_acts_values_continue';
  if (typeof _deeperState[continueKey] !== 'object' || !_deeperState[continueKey]) _deeperState[continueKey] = {};
  const decisions = _deeperState[continueKey];
  const continueHidden = document.createElement('input');
  continueHidden.type = 'hidden';
  continueHidden.name = continueKey;
  function syncContinueHidden() { continueHidden.value = JSON.stringify(decisions); }

  items.forEach((action) => {
    const threads = whyThreadsForAction(key, action);

    const block = document.createElement('div');
    block.className = 'acts-group';

    const actionLbl = document.createElement('p');
    actionLbl.className = 'acts-item-heading';
    actionLbl.textContent = action;
    block.appendChild(indentPastBullet(actionLbl, 'indent-row-center'));

    const threadsWrap = document.createElement('div');
    block.appendChild(threadsWrap);

    // Renders one node (a single reason at a single depth) plus, recursively,
    // whatever it deepens or splits into. `isRoot` is the very first reason
    // for the action; `siblings`/`idx` let a non-root leaf remove itself;
    // `depth` drives the border shade so nesting stays readable once a tree
    // gets tall. A resolved leaf (final value + answered) collapses to a
    // one-line summary — most of a big tree's bulk is decisions already made.
    function buildNode(node, isRoot, siblings, idx, depth) {
      const nodeEl = document.createElement('div');

      if (node.collapsed) {
        const sumRow = document.createElement('div');
        sumRow.className = 'cause-item';
        const sumBullet = document.createElement('span');
        sumBullet.className = 'cause-bullet';
        sumBullet.textContent = '✓';
        const sumBtn = document.createElement('button');
        sumBtn.type = 'button';
        sumBtn.className = 'why-collapsed-summary';
        const ans = decisions[node.id] === 'yes' ? 'Yes' : decisions[node.id] === 'no' ? 'No' : '';
        sumBtn.textContent = node.text + (ans ? ' — keep living by it: ' + ans : '');
        sumBtn.addEventListener('click', () => {
          node.collapsed = false;
          build();
        });
        sumRow.appendChild(sumBullet); sumRow.appendChild(sumBtn);
        nodeEl.appendChild(sumRow);
        return nodeEl;
      }

      const row = document.createElement('div');
      row.className = 'cause-item';
      const bullet = document.createElement('span');
      bullet.className = 'cause-bullet';
      bullet.textContent = '•';
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'cause-input';
      inp.value = node.text;
      inp.placeholder = isRoot ? 'Why do you do this?' : 'Why does that matter to you?';
      inp.addEventListener('input', () => {
        node.text = inp.value;
        if (!node.children.length) node.terminal = false;
        syncThreadsHidden();
        refreshTail();
      });
      row.appendChild(bullet); row.appendChild(inp);

      if (!isRoot && !node.children.length) {
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'cause-remove';
        rm.textContent = '×';
        rm.addEventListener('click', () => {
          siblings.splice(idx, 1);
          syncThreadsHidden();
          build();
        });
        row.appendChild(rm);
      }
      nodeEl.appendChild(row);

      const tailWrap = document.createElement('div');
      let tailSignature = null;

      function refreshTail() {
        if (node.children.length) {
          if (tailSignature !== 'children') { tailSignature = 'children'; tailWrap.innerHTML = ''; }
          return;
        }
        const hasVal = !!(node.text && node.text.trim());
        const signature = !hasVal ? 'empty' : (!node.terminal ? 'prompt' : 'keep:' + valueKey(node.text));
        if (signature === tailSignature) return;
        tailSignature = signature;
        tailWrap.innerHTML = '';
        if (!hasVal) return;
        if (!node.terminal) {
          const prompt = document.createElement('p');
          prompt.className = 'list-hint';
          prompt.textContent = 'Have you hit the bottom of this, or does this reason go deeper?';
          const btnsWrap = document.createElement('div');
          btnsWrap.className = 'yn-btns';
          btnsWrap.style.justifyContent = 'flex-start';
          const doneBtn = document.createElement('button');
          doneBtn.type = 'button'; doneBtn.className = 'yn-btn';
          doneBtn.textContent = 'This is the final value';
          doneBtn.addEventListener('click', () => {
            node.terminal = true;
            syncThreadsHidden();
            refreshTail();
          });
          const deeperBtn = document.createElement('button');
          deeperBtn.type = 'button'; deeperBtn.className = 'yn-btn';
          deeperBtn.textContent = 'Dig deeper on this reason';
          deeperBtn.addEventListener('click', () => {
            node.children.push(makeWhyNode(''));
            syncThreadsHidden();
            rebuildChildren();
            const inputs = childrenWrap.querySelectorAll('.cause-input');
            if (inputs.length) inputs[inputs.length - 1].focus();
          });
          btnsWrap.appendChild(deeperBtn); btnsWrap.appendChild(doneBtn);
          tailWrap.appendChild(indentPastBullet(prompt, 'indent-row-center'));
          tailWrap.appendChild(indentPastBullet(btnsWrap, 'indent-row-center'));

          const splitBtn = document.createElement('button');
          splitBtn.type = 'button';
          splitBtn.className = 'list-add-btn';
          splitBtn.style.marginTop = '.5rem';
          splitBtn.textContent = '+ Split this into separate reasons';
          splitBtn.addEventListener('click', () => {
            node.children.push(makeWhyNode(''), makeWhyNode(''));
            syncThreadsHidden();
            rebuildChildren();
            const inputs = childrenWrap.querySelectorAll('.cause-input');
            if (inputs.length) inputs[0].focus();
          });
          tailWrap.appendChild(indentPastBullet(splitBtn, 'indent-row-center'));
        } else {
          const keepWrap = document.createElement('div');
          const keepQ = document.createElement('p');
          keepQ.className = 'list-hint';
          keepQ.textContent = 'Is this a value you want to continue living by in this context?';
          const btnsWrap = document.createElement('div');
          btnsWrap.className = 'yn-btns';
          const k = node.id;
          [{ v: 'yes', label: 'Yes' }, { v: 'no', label: 'No' }].forEach(({ v, label: btnLabel }) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'yn-btn' + (decisions[k] === v ? ' selected' : '');
            b.textContent = btnLabel;
            b.addEventListener('click', () => {
              decisions[k] = v;
              syncContinueHidden();
              if (window.clearFormError) window.clearFormError();
              node.collapsed = true;
              build();
            });
            btnsWrap.appendChild(b);
          });
          keepWrap.appendChild(keepQ);
          keepWrap.appendChild(btnsWrap);
          tailWrap.appendChild(indentPastBullet(keepWrap, 'indent-row-center'));
        }
      }

      nodeEl.appendChild(tailWrap);
      refreshTail();

      const childrenWrap = document.createElement('div');
      function rebuildChildren() {
        childrenWrap.innerHTML = '';
        childrenWrap.className = node.children.length ? ('why-children why-depth-' + (depth % 4)) : '';
        node.children.forEach((child, i) => childrenWrap.appendChild(buildNode(child, false, node.children, i, depth + 1)));
        if (node.children.length >= 1) {
          const addBranchBtn = document.createElement('button');
          addBranchBtn.type = 'button';
          addBranchBtn.className = 'list-add-btn';
          addBranchBtn.textContent = '+ Add another branch here';
          addBranchBtn.addEventListener('click', () => {
            node.children.push(makeWhyNode(''));
            syncThreadsHidden();
            rebuildChildren();
            const inputs = childrenWrap.querySelectorAll('.cause-input');
            if (inputs.length) inputs[inputs.length - 1].focus();
          });
          childrenWrap.appendChild(wrapListAddBtn(addBranchBtn));
        }
        refreshTail();
      }
      rebuildChildren();
      nodeEl.appendChild(childrenWrap);

      return nodeEl;
    }

    function build() {
      threadsWrap.innerHTML = '';
      threads.forEach((root, i) => {
        const threadEl = document.createElement('div');
        threadEl.className = 'why-thread';
        threadEl.style.marginBottom = '1rem';
        threadEl.appendChild(buildNode(root, true, null, null, 0));

        if (threads.length > 1) {
          const rmThread = document.createElement('button');
          rmThread.type = 'button';
          rmThread.className = 'list-add-btn';
          rmThread.style.marginTop = '.4rem';
          rmThread.textContent = '− Remove this reason';
          rmThread.addEventListener('click', () => {
            threads.splice(i, 1);
            if (!threads.length) threads.push(makeWhyNode(''));
            syncThreadsHidden();
            build();
          });
          threadEl.appendChild(indentPastBullet(rmThread, 'indent-row-center'));
        }

        threadsWrap.appendChild(threadEl);
      });
    }
    build();

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'list-add-btn acts-add-reason-btn';
    addBtn.textContent = '+ Add a further reason';
    addBtn.addEventListener('click', () => {
      threads.push(makeWhyNode(''));
      syncThreadsHidden();
      build();
    });
    block.appendChild(wrapListAddBtn(addBtn));

    container.appendChild(block);
  });

  syncThreadsHidden();
  container.appendChild(threadsHidden);
  syncContinueHidden();
  container.appendChild(continueHidden);
}

function renderSimpleBulletList(containerId, stateKey, placeholder, nothingStateKey, stateObj, hintText) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const state = stateObj || _deeperState;
  if (!Array.isArray(state[stateKey])) state[stateKey] = [''];
  const items = state[stateKey];

  function syncHidden() {
    const h = container.querySelector('input[name="' + stateKey + '"]');
    if (h) h.value = JSON.stringify(dedupedForSubmit(items));
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
    hidden.value = JSON.stringify(dedupedForSubmit(items));
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
      lbl.textContent = "I don't think I'm contributing to it.";
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
  const items = isNothing ? [] : distinctNonBlank(_deeperState['deeper_' + key + '_acts_raw_items']);
  _deeperState['deeper_' + key + '_acts_items'] = items;
  renderActsWhyLadders(key);
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
    if (h) h.value = JSON.stringify(dedupedForSubmit(items));
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
    hidden.value = JSON.stringify(dedupedForSubmit(items));
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
    if (hidden) hidden.value = JSON.stringify(dedupedForSubmit(items));
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
    hidden.value = JSON.stringify(dedupedForSubmit(items));
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
  const items = distinctNonBlank(_deeperState['deeper_' + key + '_control_items']);
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
    if (!h) return;
    if (stateKey === feelingKey) {
      const deduped = {};
      Object.keys(stateObj).forEach((k) => { deduped[k] = dedupedForSubmit(stateObj[k]); });
      h.value = JSON.stringify(deduped);
    } else {
      h.value = JSON.stringify(stateObj);
    }
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
  h1.type = 'hidden'; h1.name = feelingKey;
  const dedupedFeelings = {};
  Object.keys(feelings).forEach((k) => { dedupedFeelings[k] = dedupedForSubmit(feelings[k]); });
  h1.value = JSON.stringify(dedupedFeelings);
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
    ? distinctNonBlank(_deeperState['deeper_' + key + '_vision_items'])
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
    ? distinctNonBlank(_deeperState['deeper_' + key + '_vision_items'])
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
    items = distinctNonBlank(_deeperState['deeper_' + key + '_vision_revised_items']);
  } else {
    const vYn = _deeperState['deeper_' + key + '_vision_yn'];
    const vItems = (vYn === 'yes' || vYn === 'partially')
      ? distinctNonBlank(_deeperState['deeper_' + key + '_vision_items'])
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
    ? distinctNonBlank(_deeperState['deeper_' + key + '_vision_items'])
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

  // Sub-pages per area — the flow skips whichever ones don't apply to that person.
  const qtypes = ['cause', 'vision', 'vision-describe', 'vision-item-achievable', 'vision-achievable-check', 'vision-revised', 'vision-commitment', 'acts-list', 'acts-reasons', 'control', 'control-attitude'];
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
        <h3 class="deeper-page-title" style="font-size:clamp(1.3rem,2.4vw,1.7rem);margin:.2rem 0 .7rem">Achievable</h3>
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
          <label><strong>WILL</strong> you achieve this? If it's not a clear yes, it's a no.</label>
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
      `<div class="deeper-subpage" id="deeper-sub-${key}-acts-reasons" data-area="${label}" hidden>
        <h3 class="deeper-page-title" style="font-size:clamp(1.3rem,2.4vw,1.7rem);margin:.2rem 0 .7rem">Hidden Values</h3>
        <div id="recap-acts-${key}-acts-reasons" data-label="How you are contributing to this" class="recap-block" hidden></div>
        <div class="deeper-field">
          <label>For each one, why do you do it, or not do it? Keep asking yourself why until you land on the real, possibly uncomfortable value underneath it.</label>
          <div id="acts-why-groups-${key}" style="margin-top:.9rem"></div>
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
    if (sp.qtype === 'acts-reasons') {
      const isNothing = !!_deeperState['deeper_' + sp.key + '_acts_raw_nothing'];
      const items = isNothing ? [] : distinctNonBlank(_deeperState['deeper_' + sp.key + '_acts_raw_items']);
      if (!items.length) {
        showDeeperSubPage(idx + direction, direction);
        return;
      }
      _deeperState['deeper_' + sp.key + '_acts_items'] = items;
      renderActsWhyLadders(sp.key);
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
      const vItems = distinctNonBlank(_deeperState['deeper_' + sp.key + '_vision_items']);
      if ((vYn !== 'yes' && vYn !== 'partially') || !vItems.length || vActual !== 'yes') {
        showDeeperSubPage(idx + direction, direction);
        return;
      }
    }
    if (sp.qtype === 'vision-achievable-check') {
      const vYn = _deeperState['deeper_' + sp.key + '_vision_yn'];
      const vItems = (vYn === 'yes' || vYn === 'partially')
        ? distinctNonBlank(_deeperState['deeper_' + sp.key + '_vision_items'])
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
      const vItems = distinctNonBlank(_deeperState['deeper_' + sp.key + '_vision_items']);
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
    if (!window._historyNav) history.pushState({ step: 3, sub: idx }, '');
    const { key, qtype } = sp;
    const causes = distinctNonBlank(_deeperState['deeper_' + key + '_causes']);
    if (qtype === 'acts-list' || qtype === 'control') {
      fillRecapBlock(document.getElementById('recap-causes-' + key + '-' + qtype), causes);
    }
    if (qtype === 'acts-reasons') {
      const actsItems = (_deeperState['deeper_' + key + '_acts_items'] || []).filter(i => i && i.trim());
      fillRecapBlock(document.getElementById('recap-acts-' + key + '-acts-reasons'), actsItems);
    }
    if (qtype === 'control') {
      const controlItemsKey = 'deeper_' + key + '_control_items';

      const vYn = _deeperState['deeper_' + key + '_vision_yn'];
      const vItems = (vYn === 'yes' || vYn === 'partially')
        ? distinctNonBlank(_deeperState['deeper_' + key + '_vision_items'])
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

  selectedKeys.forEach(k => { renderCauseList(k); renderSimpleBulletList('acts-items-' + k, 'deeper_' + k + '_acts_raw_items', 'Describe what you are doing, or could be doing…', 'deeper_' + k + '_acts_raw_nothing', undefined, 'One action or inaction per line — press "+ Add another" for the next.'); renderActsConfirm(k); renderActsGroups(k); renderControlList(k); renderControlAttitude(k); renderVisionList(k); });

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
      const causes = distinctNonBlank(_deeperState['deeper_' + key + '_causes']);
      if (!causes.length) {
        setFormErr('Please add at least one reason before continuing.', document.getElementById('cause-list-' + key));
        return false;
      }
    }

    if (qtype === 'control' && _deeperState['deeper_' + key + '_control_yn'] === 'no') {
      const isNothing = !!_deeperState['deeper_' + key + '_acts_raw_nothing'];
      const items = isNothing ? [] : distinctNonBlank(_deeperState['deeper_' + key + '_acts_raw_items']);
      if (!items.length) {
        setFormErr("Hold on — your situation has to consist of things you're contributing to, things that are outside your control and must be accepted, or both. There is no situation in which it's neither. Please go back and reconsider one of your answers.");
        return false;
      }
    }

    if (qtype === 'control' && _deeperState['deeper_' + key + '_control_yn'] === 'yes') {
      const filledItems = distinctNonBlank(_deeperState['deeper_' + key + '_control_items']);
      if (!filledItems.length) {
        setFormErr('Please add at least one circumstance before continuing.', document.getElementById('control-list-' + key));
        return false;
      }
    }

    if (qtype === 'control-attitude') {
      const filledItems     = distinctNonBlank(_deeperState['deeper_' + key + '_control_items']);
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
      const items     = distinctNonBlank(_deeperState['deeper_' + key + '_acts_raw_items']);
      const isNothing = !!_deeperState['deeper_' + key + '_acts_raw_nothing'];
      if (!items.length && !isNothing) {
        setFormErr('Please add at least one item or select "I don\'t think I\'m contributing to it."', document.getElementById('acts-items-' + key));
        return false;
      }
      if (!_deeperState['deeper_' + key + '_acts_confirm']) {
        _deeperState['deeper_' + key + '_acts_confirm_shown'] = true;
        renderActsConfirm(key);
        return false;
      }
    }

    if (qtype === 'acts-reasons') {
      const actions = distinctActionsForArea(key);
      const byAction = _deeperState['deeper_' + key + '_why_threads'] || {};
      const container = document.getElementById('acts-why-groups-' + key);

      const hasUnresolvedThread = actions.some((action) =>
        (byAction[action] || []).some((root) => whyTreeHasUnresolvedLeaf(root))
      );
      if (hasUnresolvedThread) {
        setFormErr('Please say "This is the final value" once you\'ve reached the real reason, for each one you\'ve started.', container);
        return false;
      }

      const terminals = terminalWhyThreads(key);
      const allCovered = actions.every((action) => terminals.some((t) => t.action === action));
      if (!allCovered) {
        setFormErr('Every action needs at least one reason before continuing.', container);
        return false;
      }

      const decisions = _deeperState['deeper_' + key + '_acts_values_continue'] || {};
      if (terminals.some((t) => !decisions[t.id])) {
        setFormErr('Please say whether you want to continue living by each value before continuing.', container);
        return false;
      }
    }

    if (qtype === 'vision-describe') {
      const yn = _deeperState['deeper_' + key + '_vision_yn'];
      if (yn === 'yes' || yn === 'partially') {
        const vItems = distinctNonBlank(_deeperState['deeper_' + key + '_vision_items']);
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
        ? distinctNonBlank(_deeperState['deeper_' + key + '_vision_items'])
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
      const revised = distinctNonBlank(_deeperState['deeper_' + key + '_vision_revised_items']);
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
      label: 'Assuming you were fully committed to the changes you want to create: Do you feel like you have the mental and emotional capacity to tackle your challenges and create change right now?',
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
    if (!window._historyNav) history.pushState({ step: 4, sub: idx }, '');

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
      const items = distinctNonBlank(_fsState[q.followup.stateKey]);
      if (!items.length) { setFormErr('Please describe what you need before continuing.', document.getElementById('fs-followup-' + q.id)); return false; }
    }
    if (q.type === 'multiselect' && !_fsState['fs_' + q.id]?.length) {
      setFormErr('Please select at least one option before continuing.', page?.querySelector('.acts-checkboxes')); return false;
    }
    if (q.type === 'multiselect' && q.other && _fsState['fs_' + q.id]?.includes(q.other)) {
      const items = distinctNonBlank(_fsState['fs_' + q.id + '_other_items']);
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
  if (step === 1) initUrgencyFlagStep();
  if (step === 2) initFocusStep();
  if (step === 3) initDeeperStep();
  if (step === 4) initFitSignalsStep();
  const btnNext = document.getElementById('btn-next');
  if (btnNext) btnNext.textContent = step === 5 ? 'Get my results →' : 'Next →';
};

// Initialize step 0 — showStep(0) ran before this script loaded
initFulfillmentStep();

/* ---- Submission ---- */
// ---- Human-readable capture of every question + answer, for the notify email.
// Labels mirror the fit-signals `questions` array in initFitSignalsStep; keep in sync.
const FIT_LABELS = {
  q2: 'Assuming you were fully committed to the changes you want to create: Do you feel like you have the mental and emotional capacity to tackle your challenges and create change right now?',
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
    const items = dedupedForSubmit((_fsState['fs_q6_items'] || []).filter((i) => (i.what || '').trim()), (i) => i.what);
    if (!items.length) return '(none given)';
    const formatted = items
      .map((i) => `${i.what}${i.howWell != null ? ` (worked ${i.howWell}/5)` : ''}${(i.why || '').trim() ? ` — why: ${i.why}` : ''}`);
    return formatted.length > 1 ? formatted : formatted[0];
  }
  let v = _fsState['fs_' + id];
  let out;
  if (Array.isArray(v)) {
    let arr = v.slice();
    const otherItems = distinctNonBlank(_fsState['fs_' + id + '_other_items']);
    if (otherItems.length && arr.includes('Other')) arr = arr.map((o) => (o === 'Other' ? 'Other: ' + otherItems.join('; ') : o));
    out = arr.length > 1 ? arr : (arr.length ? arr[0] : '(none selected)');
  } else if (typeof v === 'number') {
    out = 'Rated ' + v;
  } else if (v === 'yes') out = 'Yes';
  else if (v === 'no') out = 'No';
  else out = v == null || v === '' ? '(not answered)' : String(v);
  if (id === 'q2' && v === "No, I'm exhausted" && _fsState['fs_q2_needs']) {
    const needs = distinctNonBlank(_fsState['fs_q2_needs']);
    if (needs.length) out += ' — needs: ' + needs.join('; ');
  }
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
        const items = distinctNonBlank(_deeperState['deeper_' + areaKey + '_control_items']);
        const feelings = _deeperState['deeper_' + areaKey + '_control_feeling'] || {};
        const feelingYn = _deeperState['deeper_' + areaKey + '_control_feeling_yn'] || {};
        items.forEach((item) => {
          const feelingList = Array.isArray(feelings[item]) ? feelings[item] : (feelings[item] ? [feelings[item]] : []);
          const feeling = distinctNonBlank(feelingList).join(', ');
          if (!feeling) return;
          const wantsToFeel = feelingYn[item] === 'yes' ? 'Yes' : feelingYn[item] === 'no' ? 'No' : '';
          const a = wantsToFeel ? `Feels: ${feeling}. Wants to feel this way: ${wantsToFeel}.` : `Feels: ${feeling}.`;
          rows.push([area ? `${area} — ${item}` : item, a]);
        });
        return;
      }

      // Hidden values: one row per (action, thread) — the full "why" chain down
      // to the terminal value, plus whether they want to keep living by it.
      // Bypasses the generic scan below on purpose — that scan would otherwise
      // pick up the first "keep this value?" button on the page and treat it
      // as if it were the whole question's one answer.
      const reasonsMatch = sp.id.match(/^deeper-sub-(.+)-acts-reasons$/);
      if (reasonsMatch) {
        const areaKey = reasonsMatch[1];
        const decisions = _deeperState['deeper_' + areaKey + '_acts_values_continue'] || {};
        terminalWhyThreads(areaKey).forEach(({ action, layers, value, id }) => {
          const ans = decisions[id] === 'yes' ? 'Yes' : decisions[id] === 'no' ? 'No' : '(no answer given)';
          rows.push([area ? `${area} — ${action}` : action, `${layers.join(' → ')} (continue living by this: ${ans})`]);
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
          const texts = distinctNonBlank([...field.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea')]
            .filter(mine).map((i) => i.value.trim()));
          const checks = [...field.querySelectorAll('input[type=checkbox]')]
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
    const parts = v
      .map((x) => (x && typeof x === 'object'
        ? Object.values(x).filter((y) => String(y ?? '').trim()).join(' — ')
        : String(x ?? '')))
      .filter((s) => s.trim());
    return distinctNonBlank(parts).join('; ');
  }
  if (v && typeof v === 'object') return Object.values(v).filter((y) => String(y ?? '').trim()).join(' — ');
  return v == null ? '' : String(v);
}

function buildQaSummary(answers) {
  const groups = [];
  const shownNorm = new Set();
  const norm = (s) => String(s ?? '').trim().toLowerCase();
  const mark = (a) => { const n = norm(Array.isArray(a) ? a.join('; ') : a); if (n) shownNorm.add(n); };

  // ---- Testing-phase page feedback, shown first so it doesn't get missed ----
  const feedbackRows = Object.entries(_pageFeedbackState)
    .map(([page, note]) => [page, (note || '').trim()])
    .filter(([, note]) => note);
  if (feedbackRows.length) {
    feedbackRows.forEach(([, a]) => mark(a));
    groups.push({ title: 'Testing feedback (from the tester)', rows: feedbackRows });
  }

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
    areaRows = getWheelValues().map((a) => [a.label, `Fulfilment ${a.fulfillment}/5`]);
  } catch (_e) {
    (typeof AREAS !== 'undefined' ? AREAS : []).forEach(([key, label]) =>
      areaRows.push([label, `Fulfilment ${answers['fulfillment_' + key] ?? '?'}/5`]));
  }
  if (areaRows.length) { areaRows.forEach(([, a]) => mark(a)); groups.push({ title: 'Life areas — all 10, with ratings', rows: areaRows, subNumbered: true }); }

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
    '_why_threads', '_acts_values_continue', '_omits_groups',
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

// Shown in place of the full Authenticity Map while the assessment is still
// being tested — Dan reviews answers via the notification email himself and
// follows up directly, rather than the page revealing results on the spot.
function renderTestingThankYou() {
  const el = document.getElementById("assessment-result");
  if (!el) return;
  el.hidden = false;
  el.innerHTML = `
    <div class="result-panel">
      <span class="eyebrow"><span class="dot"></span>Thank you</span>
      <h2>Thanks for testing this with me.</h2>
      <p class="lede">I've got your answers — you'll hear from me soon.</p>
    </div>`;
}

// ---- Testing-phase page feedback widget ----
// Figures out a human-readable label for whichever screen is currently
// visible, so a tester's note can be tied back to the exact page it was
// written on. Works for the main sections (fulfillment/urgency/focus/you)
// and for every deeper-question and fit-signals sub-page, since both share
// the .deeper-subpage / .deeper-page-title markup.
function currentFeedbackPageLabel() {
  const activeSection = document.querySelector(".assessment-section.active");
  if (!activeSection) return "Assessment";
  const activeSub = activeSection.querySelector(".deeper-subpage:not([hidden])");
  if (activeSub) {
    const area = (activeSub.dataset.area || "").trim();
    const pageTitle = (activeSub.querySelector(".deeper-page-title")?.textContent || "").trim();
    return [area, pageTitle].filter(Boolean).join(" — ") || activeSub.id || "Assessment";
  }
  const areaCard = (activeSection.querySelector(".deeper-area-name")?.textContent || "").trim();
  const heading = (activeSection.querySelector("h2, .focus-reveal-title")?.textContent || "").trim();
  return [heading, areaCard].filter(Boolean).join(" — ") || "Assessment";
}

function initPageFeedbackWidget() {
  const widget = document.getElementById("page-feedback-widget");
  const toggle = document.getElementById("page-feedback-toggle");
  const panel = document.getElementById("page-feedback-panel");
  const textarea = document.getElementById("page-feedback-text");
  if (!widget || !toggle || !panel || !textarea) return;

  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) textarea.focus();
  });
  textarea.addEventListener("input", () => {
    _pageFeedbackState[currentFeedbackPageLabel()] = textarea.value;
  });

  function refresh() {
    widget.hidden = false;
    textarea.value = _pageFeedbackState[currentFeedbackPageLabel()] || "";
  }

  const origUpdateProgress = window.updateAssessmentProgress;
  window.updateAssessmentProgress = function () {
    if (origUpdateProgress) origUpdateProgress();
    refresh();
  };
}
initPageFeedbackWidget();

window.submitAssessment = async function submitAssessment(form, submitButton) {
  const answers = collectAnswers(form);

  // Fit signals live in _fsState (plain JS object, not form fields) — derive scoring signals here
  const q2 = _fsState['fs_q2'] || '';
  const q5 = typeof _fsState['fs_q5'] === 'number' ? _fsState['fs_q5'] : 3;
  const q7 = _fsState['fs_q7'] || '';
  const q6items = dedupedForSubmit((_fsState['fs_q6_items'] || []).filter(i => i.what?.trim()), (i) => i.what);

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

  if (window.stopStopwatch) window.stopStopwatch();
  renderTestingThankYou();
  document.getElementById("assessment-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
  submitButton.disabled = true;
  submitButton.classList.add("is-loading");
  try {
    await fetch("/api/assessment-submit", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(answers),
    });
  } catch {
    /* thank-you page doesn't depend on the response; the submission itself still went out */
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
