// Who can see what, on the REAL site. Run this after any release that touches the
// assessment, the result pages or the results workspace.
//
//   node scripts/check-live-exposure.mjs [https://danieltiwari.com]
//
// It only ever READS. It never submits, never publishes and never emails anyone,
// so it is safe to run against production at any time.
//
// The one thing it cannot prove is the half that needs Daniel's own credentials:
// publishing a result and the person being emailed the link. That is covered by
// the unit checks in check-results-feature.sh and, in the end, by Daniel doing it.
const BASE = (process.argv[2] || "https://danieltiwari.com").replace(/\/$/, "");
const UA = { "User-Agent": "exposure-check/1.0" };

// A real submission id, and one that cannot exist. The real one is only ever used
// to prove that holding it opens NOTHING.
const REAL_ID = process.env.CHECK_REAL_ID || "scrnOPXmQuWF";
const FAKE_ID = "aaaaaaaaaaaa";

async function hit(path, { method = "GET", body, headers } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...UA, ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  return { status: res.status, text: (await res.text()).slice(0, 400) };
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `   [${detail}]` : ""}`);
};

// --- private routes must refuse a stranger -------------------------------
let r = await hit("/api/result-admin?action=list");
check("stranger cannot list submissions", r.status === 401, `HTTP ${r.status}`);

r = await hit(`/api/result-admin?action=get&id=${REAL_ID}`);
check("stranger cannot read one person's answers", r.status === 401, `HTTP ${r.status}`);

r = await hit("/api/result-admin", { method: "POST", body: { action: "publish", id: REAL_ID } });
check("stranger cannot publish a result", r.status === 401, `HTTP ${r.status}`);

r = await hit(`/api/result-data?id=${REAL_ID}`);
check("a real result link alone shows nothing", r.status === 401, `HTTP ${r.status}`);

r = await hit(`/api/result-data?id=${REAL_ID}`, { headers: { "X-Result-Pass": "forged.pass" } });
check("a forged pass is refused", r.status === 401, `HTTP ${r.status}`);

// --- the login must not reveal which emails exist ------------------------
const a = await hit("/api/result-login", { method: "POST", body: { action: "request", id: REAL_ID, email: "nobody@example.com" } });
const b = await hit("/api/result-login", { method: "POST", body: { action: "request", id: FAKE_ID, email: "nobody@example.com" } });
check("a real and a made-up result answer identically",
  a.status === 200 && b.status === 200 && a.text === b.text,
  `${a.status}/${b.status} identical=${a.text === b.text}`);

r = await hit("/api/result-login", { method: "POST", body: { action: "verify", id: REAL_ID, code: "000000" } });
check("a guessed code is refused", r.status === 401, `HTTP ${r.status}`);

// --- public routes that must keep working --------------------------------
r = await hit("/assessment");
check("the assessment is open to everyone", r.status === 200, `HTTP ${r.status}`);

r = await hit("/");
check("the homepage still loads", r.status === 200, `HTTP ${r.status}`);

r = await hit("/results");
const leaks = ["RESULTS_AUTHOR_TOKEN", "RESULT_PASS_SECRET", "@spareday.ai", "icloud.com", "mailfence"]
  .filter((w) => r.text.includes(w));
check("the workspace page carries no data or key", r.status === 200 && !leaks.length,
  `HTTP ${r.status}${leaks.length ? ` leaks=${leaks}` : ""}`);

// --- nothing internal on a public path -----------------------------------
for (const p of ["/.env", "/netlify.toml", "/docs/writing-assessment-results.md", "/scripts/check-results-feature.sh"]) {
  const x = await hit(p);
  check(`${p} is not served`, [301, 302, 404].includes(x.status), `HTTP ${x.status}`);
}

const passed = results.filter((x) => x.ok).length;
console.log(`\n${passed}/${results.length} passed against ${BASE}`);
process.exit(passed === results.length ? 0 : 1);
