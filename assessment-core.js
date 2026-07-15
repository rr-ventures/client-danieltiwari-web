/* ============================================================
   Daniel Tiwari — assessment core (shared scoring + Authenticity Map render)
   Single source of truth used by BOTH:
     - assessment.js   (the live quiz: inline render on submit)
     - result.html     (the polished, persistent, shareable hosted map)
   Loaded as a plain (non-module) <script defer> BEFORE its consumers, so
   these top-level bindings are visible to the scripts that follow.
   ============================================================ */
const AREAS = [
  ["career", "Work & Vocation", "How fulfilled you feel by the work you do and the path you're on."],
  ["relationships", "Intimate Relationships", "Your romantic relationship, or how satisfied you are with your dating life."],
  ["friendships", "Friendships", "The quality and depth of your close friendships."],
  ["family", "Family", "Your relationship with your parents, siblings, or children."],
  ["health", "Health & Vitality", "Your physical health, energy levels, and fitness."],
  ["attractiveness", "Attractiveness & Appearance", "How you feel about the way you look and present yourself."],
  ["money", "Finances", "Your income, savings, and overall financial security."],
  ["lifestyle", "Lifestyle", "How your day-to-day life is structured, and how much you enjoy it."],
  ["environment", "Environment", "The people, places, and spaces you spend your time in."],
  ["fun_adventure", "Fun & Adventure", "How much play, excitement, and new experience is in your life."],
];

const CALENDLY = "https://cal.eu/danieltiwari/connect";

// Per-stage reading: a literary diagnosis, what the stage is, what's next, and a 30-day move.
const AUTH_INSIGHT = {
  1: { label: "Conditioned", short: "you're still living inside a story you were handed",
       tension: "You're working hard at a life you never quite chose — and a part of you is starting to feel the seam.",
       means: "You've absorbed a definition of a good life and you're running it faithfully. There's nothing wrong with you; the map you were given simply isn't yours. The first work is noticing where it stops fitting.",
       next: "The next move isn't a bigger push. It's letting yourself feel where the life you're performing and the life you'd actually choose pull apart.",
       move: "This month, catch yourself once a day doing something purely because it's expected. Don't change it yet — just name it." },
  2: { label: "Draining", short: "the old path is costing more than it returns",
       tension: "You can still force it, and forcing it is exactly what's wearing you down.",
       means: "The fatigue you feel isn't weakness — it's honest feedback. Something you've been carrying has become heavier than it's worth, even if you can't yet name what.",
       next: "Next comes naming it: not 'I need more discipline' but 'this specific thing isn't mine.'",
       move: "This month, notice what you feel lighter after — and what you brace yourself for. The pattern in that is the thread to pull." },
  3: { label: "Questioning", short: "you can feel something is off, but it isn't fully named",
       tension: "You're past pretending everything's fine, and not yet sure what the truth underneath is.",
       means: "You're at the threshold most people never cross — admitting the doubt out loud to yourself. The narrative is cracking; that's not a breakdown, it's the beginning of clarity.",
       next: "Next is precision: moving from 'something's wrong' to naming exactly which parts of your life were never actually yours.",
       move: "This month, finish this sentence honestly, on paper: 'The part of my life I've stopped believing in is ___.'" },
  4: { label: "Breaking Point", short: "you've named the thing, and can't fully un-see it",
       tension: "You've admitted the life isn't yours — which is a relief and a disturbance at the same time.",
       means: "You've said the quiet thing out loud. Most people spend years avoiding this exact moment. It's uncomfortable because it's real, and it's where lasting change actually starts.",
       next: "Next is a decision — not a plan, a decision — to live from what you now know, even before the path is clear.",
       move: "This month, make one small choice that your old, performed self wouldn't have made. Let it be evidence." },
  5: { label: "Returning", short: "you've decided, and you're building the structure to hold it",
       tension: "You know the direction; the work now is making a life that can actually carry it.",
       means: "You've chosen honesty over comfort, even with the path still forming. This is the stage where the right structure and the right reflection compound fastest.",
       next: "Next is consolidation — turning a decision into a life that runs on it, not just intends it.",
       move: "This month, build one durable structure (a boundary, a practice, a relationship) around the choice you've made." },
  6: { label: "Building", short: "you're constructing a life around what's actually yours",
       tension: "The hardest part is behind you; the question now is whether what you're building matches the full size of what's in you.",
       means: "You're past the breaking and the deciding. You're constructing. The risk at this stage isn't collapse — it's settling, building something good that's still a little smaller than you're capable of.",
       next: "Next is refinement and reach — making sure the life you're building is honest all the way up, not just safe and sincere.",
       move: "This month, find the one place you're playing slightly small 'to be realistic,' and test what happens if you don't." },
};

// Per-area reading: what a wide gap here tends to look like, and the first honest shift.
const AREA_READ = {
  career:       { looks: "work that quietly runs your days without ever feeling like yours", shift: "name the one part of your work you'd keep if money were no object — and the part you're only tolerating." },
  relationships:{ looks: "being present in body but not fully in truth with someone close", shift: "say one true thing you've been carefully managing around." },
  friendships:  { looks: "people around you, and a quiet sense of going unmet by them", shift: "reach for one person you can be completely unedited with this week." },
  family:       { looks: "slipping into old roles that no longer fit who you've become", shift: "notice where you perform the version of yourself your family still expects." },
  health:       { looks: "a body you negotiate with rather than actually inhabit, with energy that doesn't match the life you're trying to live", shift: "pick the one basic you keep abandoning — sleep, movement, food — and protect it for a week." },
  attractiveness:{ looks: "a gap between how you present and how you feel underneath it", shift: "tend to one thing that's for you, not for being seen." },
  money:        { looks: "numbers quietly driving decisions you wouldn't otherwise make", shift: "separate what you actually need from what you're trying to prove." },
  lifestyle:    { looks: "days that run on autopilot, full on paper but thin on anything you'd actually call alive", shift: "put one thing on the calendar this week you'd genuinely look forward to, not just get through." },
  environment:  { looks: "living in a place chosen by circumstance rather than by design, a home or city that doesn't reflect who you're becoming", shift: "change one thing about the physical space you spend the most time in, so it actually matches the direction you're heading." },
  fun_adventure: { looks: "a life managed so tightly there's no room left for surprise, risk, or anything you haven't already approved of in advance", shift: "do one thing this week you can't fully predict the outcome of." },
};

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function wheelData(answers) {
  return AREAS.map(([key, label]) => ({
    key, label,
    fulfillment: numeric(answers[`fulfillment_${key}`], 3),
    urgency: numeric(answers[`urgency_${key}`], 0),
  }));
}

// Urgency is a flag (up to 3 picked on the urgency step), not a full 1-11
// rank, so it's weighted as a flat boost rather than summed as a rank.
const URGENCY_BOOST = 8;

function topFocusAreas(wheel) {
  return wheel
    .map((a) => ({ ...a, score: (6 - a.fulfillment) * 2 + (a.urgency ? URGENCY_BOOST : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
}

function authenticityStage(answers) {
  const stage = Math.min(Math.max(numeric(answers.path_signal, 3), numeric(answers.decision_signal, 1)), 6);
  return { stage, ...(AUTH_INSIGHT[stage] || AUTH_INSIGHT[3]) };
}

function buyerStage(answers) {
  const score = Math.round((numeric(answers.previous_attempts, 1) + numeric(answers.help_openness, 1)
    + numeric(answers.change_timeline, 1) + numeric(answers.investment_readiness, 1)) / 4);
  const labels = { 1: "Problem aware", 2: "Learning", 3: "Trying to solve it yourself", 4: "Considering help", 5: "Ready to invest" };
  const s = Math.min(Math.max(score, 1), 5);
  return { stage: s, label: labels[s], score };
}

function rebelFactor(answers) {
  const score = Math.round((numeric(answers.vision_scale, 3) + numeric(answers.truth_directness, 3)
    + numeric(answers.conformity_signal, 3) + numeric(answers.potential_signal, 3)) / 4);
  const label = score <= 2 ? "Low" : score === 3 ? "Moderate" : score === 4 ? "Strong" : "Very strong";
  return { label, score };
}

function fulfilmentScore(wheel) {
  const avg = wheel.reduce((s, a) => s + a.fulfillment, 0) / wheel.length;
  const pct = Math.round((avg - 1) / 4 * 100);
  const tier = pct < 35 ? "Quietly depleted" : pct < 55 ? "Holding it together"
    : pct < 70 ? "Capable but unfulfilled" : pct < 85 ? "Coming into alignment" : "Largely aligned";
  return { pct, tier };
}

function wheelShape(wheel) {
  const top = [...wheel].sort((a, b) => b.fulfillment - a.fulfillment)[0];
  const bottom = [...wheel].sort((a, b) => a.fulfillment - b.fulfillment)[0];
  return { top, bottom };
}

function combinationRead(stage, buyer, rebel) {
  const rebelPhrase = rebel.score >= 4
    ? "You think bigger than the life you're currently living, and you've little patience for a borrowed script."
    : "You're still weighing how far you're willing to step outside the familiar — which is its own honest question.";
  const buyerPhrase = buyer.stage >= 4
    ? "And you're at the point where you can feel that an outside perspective would move things; you're past trying to think your way out alone."
    : "And for now you're mostly working this out on your own, which is exactly right for where you are.";
  return `${rebelPhrase} At the ${stage.label} stage, ${stage.short}. ${buyerPhrase}`;
}

function calculateResult(answers) {
  const wheel = wheelData(answers);
  const focusAreas = topFocusAreas(wheel);
  const authenticity = authenticityStage(answers);
  const buyer = buyerStage(answers);
  const rebel = rebelFactor(answers);
  const score = fulfilmentScore(wheel);
  const shape = wheelShape(wheel);
  const signals = [authenticity.stage >= 4, buyer.stage >= 4, rebel.score >= 4].filter(Boolean).length;
  const highFit = signals >= 2;
  return { wheel, focusAreas, authenticity, buyer, rebel, score, shape, route: highFit ? "diagnostic" : "nurture" };
}

/* ---------- Wheel of Life radar (inline SVG) ---------- */
function renderWheel(wheel) {
  const size = 320, c = size / 2, R = 120, n = wheel.length;
  const ang = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i, r) => [c + Math.cos(ang(i)) * r, c + Math.sin(ang(i)) * r];
  let rings = "";
  [0.25, 0.5, 0.75, 1].forEach((f) => {
    rings += `<polygon points="${wheel.map((_, i) => pt(i, R * f).map((v) => v.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="var(--hair)" stroke-width="1"/>`;
  });
  let axes = "", labels = "";
  wheel.forEach((a, i) => {
    const [x, y] = pt(i, R);
    axes += `<line x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--hair)" stroke-width="1"/>`;
    const [lx, ly] = pt(i, R + 22);
    const anchor = Math.abs(lx - c) < 8 ? "middle" : lx < c ? "end" : "start";
    labels += `<text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" text-anchor="${anchor}" font-size="10" fill="var(--muted)" font-family="Alegreya SC, serif" letter-spacing="0.04em">${a.label}</text>`;
  });
  const poly = wheel.map((a, i) => pt(i, R * (a.fulfillment / 5)).map((v) => v.toFixed(1)).join(",")).join(" ");
  const dots = wheel.map((a, i) => { const [x, y] = pt(i, R * (a.fulfillment / 5)); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="var(--ink)"/>`; }).join("");
  return `<svg viewBox="-72 -4 ${size + 144} ${size + 8}" class="wheel-svg" role="img" aria-label="Your Wheel of Life">
    ${rings}${axes}
    <polygon points="${poly}" fill="rgba(28,26,20,.12)" stroke="var(--ink)" stroke-width="1.5"/>
    ${dots}${labels}
  </svg>`;
}

function rankAllAreas(wheel) {
  return wheel
    .map((a) => ({ ...a, score: (6 - a.fulfillment) * 2 + (a.urgency ? URGENCY_BOOST : 0) }))
    .sort((a, b) => b.score - a.score);
}

function renderPieChart(wheel) {
  const size = 300, c = size / 2, R = 108, n = wheel.length;
  const slice = (Math.PI * 2) / n;
  let bg = '', fill = '', labels = '';
  wheel.forEach((area, i) => {
    const a0 = slice * i - Math.PI / 2;
    const a1 = slice * (i + 1) - Math.PI / 2;
    const x0 = (c + Math.cos(a0) * R).toFixed(1), y0 = (c + Math.sin(a0) * R).toFixed(1);
    const x1 = (c + Math.cos(a1) * R).toFixed(1), y1 = (c + Math.sin(a1) * R).toFixed(1);
    bg += `<path d="M${c},${c} L${x0},${y0} A${R},${R} 0 0,1 ${x1},${y1} Z" fill="var(--bg2)" stroke="var(--bg)" stroke-width="2"/>`;
    const fr = Math.max(R * (area.fulfillment / 5), 2);
    const fx0 = (c + Math.cos(a0) * fr).toFixed(1), fy0 = (c + Math.sin(a0) * fr).toFixed(1);
    const fx1 = (c + Math.cos(a1) * fr).toFixed(1), fy1 = (c + Math.sin(a1) * fr).toFixed(1);
    fill += `<path d="M${c},${c} L${fx0},${fy0} A${fr.toFixed(1)},${fr.toFixed(1)} 0 0,1 ${fx1},${fy1} Z" fill="var(--ink)" opacity="0.72" stroke="var(--bg)" stroke-width="2"/>`;
    const ma = a0 + slice / 2;
    const lx = (c + Math.cos(ma) * (R + 22)).toFixed(1);
    const ly = (c + Math.sin(ma) * (R + 22) + 4).toFixed(1);
    const anchor = Math.abs(Math.cos(ma)) < 0.15 ? 'middle' : Math.cos(ma) < 0 ? 'end' : 'start';
    labels += `<text x="${lx}" y="${ly}" text-anchor="${anchor}" font-size="9" fill="var(--muted)" font-family="Alegreya SC,serif" letter-spacing=".04em">${area.label}</text>`;
  });
  return `<svg viewBox="-64 -24 ${size + 128} ${size + 48}" class="wheel-svg" role="img" aria-label="Your fulfilment across all areas">${bg}${fill}${labels}</svg>`;
}

function renderWheelPrint(wheel) {
  const size = 320, c = size / 2, R = 120, n = wheel.length;
  const ang = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt  = (i, r) => [c + Math.cos(ang(i)) * r, c + Math.sin(ang(i)) * r];
  let labels = "";
  wheel.forEach((a, i) => {
    const [lx, ly] = pt(i, R + 24);
    const anchor = Math.abs(lx - c) < 8 ? "middle" : lx < c ? "end" : "start";
    labels += `<text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" text-anchor="${anchor}" font-size="10" fill="#7a7268" font-family="Alegreya SC, serif" letter-spacing="0.05em">${a.label}</text>`;
  });
  const poly = wheel.map((a, i) => pt(i, R * (a.fulfillment / 5)).map((v) => v.toFixed(1)).join(",")).join(" ");
  const dots = wheel.map((a, i) => {
    const [x, y] = pt(i, R * (a.fulfillment / 5));
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#1c1a14"/>`;
  }).join("");
  return `<svg viewBox="-80 -8 ${size + 160} ${size + 16}" style="width:100%;max-width:440px;height:auto;display:block;margin:0 auto" role="img" aria-label="Wheel of Life">
    <polygon points="${poly}" fill="rgba(28,26,20,.11)" stroke="#1c1a14" stroke-width="1.5"/>
    ${dots}${labels}
  </svg>`;
}

function renderPrintResult(result) {
  const el = document.getElementById("print-result");
  if (!el) return;
  el.innerHTML = `
    <div class="pr-page">
      <div class="pr-wheel-section">
        <p class="pr-eyebrow">Your Wheel of Life</p>
        <div class="pr-wheel-wrap">${renderWheelPrint(result.wheel)}</div>
      </div>
    </div>`;
}

function renderResult(result, emailState = "pending") {
  const el = document.getElementById("assessment-result");
  if (!el) return;
  const a = result.authenticity;

  const focusList = result.focusAreas.map((f) => {
    const read = AREA_READ[f.key] || {};
    return `
    <li>
      <strong>${f.label}</strong>
      <span class="nums">fulfilment ${f.fulfillment}/5${f.urgency ? " · flagged urgent" : ""}</span>
      <p class="read">${read.looks ? `It can look like ${read.looks}.` : ""} <em>First shift —</em> ${read.shift || ""}</p>
    </li>`;
  }).join("");

  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
  const monthMove = cap((a.move || "").replace(/^this month,\s*/i, ""));
  const roadmap = [
    `<li><span class="step sc">This week</span><p>Start with <strong>${result.focusAreas[0]?.label}</strong> — ${(AREA_READ[result.focusAreas[0]?.key] || {}).shift || ""}</p></li>`,
    `<li><span class="step sc">This month</span><p>${monthMove}</p></li>`,
    `<li><span class="step sc">When you're ready</span><p>Bring your map to a private conversation, and we read it together — what it's showing, and the one thread worth pulling first.</p></li>`,
  ].join("");

  const emailCopy = {
    pending: "Sending your Authenticity Map to your inbox… If it doesn't show up shortly, check your spam folder.",
    sent: "A copy of your Authenticity Map is on its way to your inbox. If you don't see it soon, check your spam folder.",
    skipped: "Your map is ready here. (Email delivery isn't configured in this preview.)",
    warning: "Your map is ready here. We couldn't confirm the email — check back shortly, and check your spam folder too.",
    viewed: "This is your saved Authenticity Map — yours to revisit any time.",
  }[emailState] || "";

  const nextStep = result.route === "diagnostic"
    ? `<p>Your answers suggest you're at a point where an outside perspective tends to help most. The next step is a private conversation — a continuation of this map, not a sales call. In thirty minutes we'd read it together: your widest gap (${result.focusAreas[0]?.label}), the pattern underneath it, and whether working together makes sense — or whether you're better placed to do this on your own right now.</p>
       <a class="btn" href="${CALENDLY}"><span>Read your map with Daniel</span><span class="arrow" aria-hidden="true">→</span></a>`
    : `<p>You can absolutely keep moving on your own from here — your map above is enough to start. If at some point you'd like a clearer reflection from the outside, the door is open, with no pressure and no pitch.</p>
       <a class="btn secondary-btn" href="${CALENDLY}"><span>Book a conversation when you're ready</span><span class="arrow" aria-hidden="true">→</span></a>`;

  el.hidden = false;
  el.innerHTML = `
    <div class="result-panel" id="authenticity-map">
      <span class="eyebrow"><span class="dot"></span>Your Authenticity Map</span>
      <h2>${a.label}</h2>
      <p class="lede tension">${a.tension}</p>

      <div class="result-score">
        <div class="score-num">${result.score.pct}<span>/100</span></div>
        <div class="score-meta"><strong>${result.score.tier}</strong><span>Overall life fulfilment, across the ten areas you rated.</span></div>
      </div>

      <div class="result-block">
        <span class="label">Your Wheel of Life</span>
        <div class="wheel-wrap">${renderWheel(result.wheel)}</div>
        <p class="wheel-read">Your wheel is strongest in <strong>${result.shape.top.label}</strong> — the part of life currently feeding you — and thinnest in <strong>${result.shape.bottom.label}</strong>, where most of the friction is leaking from.</p>
      </div>

      <div class="result-block">
        <span class="label">Where life is asking for attention</span>
        <ol class="result-list deep">${focusList}</ol>
      </div>

      <div class="result-block">
        <span class="label">Where you are</span>
        <p>${a.means}</p>
        <p class="next-stage"><em>What's next —</em> ${a.next}</p>
      </div>

      <div class="result-block">
        <span class="label">What this combination is telling us</span>
        <p>${combinationRead(a, result.buyer, result.rebel)}</p>
      </div>

      <div class="result-block">
        <span class="label">Your next 30 days</span>
        <ol class="roadmap">${roadmap}</ol>
      </div>

      <div class="result-block next">
        <span class="label">Your next step</span>
        ${nextStep}
      </div>

      <div class="result-actions no-print">
        <button type="button" class="ghost-btn sc" onclick="window.print()">Save / print your map</button>
        <p class="form-note"><span class="dot"></span>${emailCopy}</p>
      </div>
    </div>`;
}
