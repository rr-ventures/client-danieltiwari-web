// Who may read a result page, and who may write one.
//
// Two separate doors, deliberately:
//   VIEWER  — the prospect. Proves they own the email they submitted with, by
//             typing a 6-digit code sent to it. Then they hold a signed pass for
//             30 days (Reece's call 2026-09-12: code once, remembered a month).
//   AUTHOR  — Daniel, writing their result. Same code flow against HIS address,
//             plus a standing bearer token so his own assistant can write a page
//             without a human retyping a code.
//
// Passes are HMAC-signed strings, not database rows: nothing to expire-sweep and
// nothing an attacker can enumerate. RESULT_PASS_SECRET signs them.
const crypto = require("node:crypto");

const VIEWER_DAYS = 30;
const AUTHOR_HOURS = 12;
const CODE_TTL_MIN = 15;
const MAX_CODE_ATTEMPTS = 6;

function secret() {
  const s = process.env.RESULT_PASS_SECRET;
  if (!s) throw new Error("RESULT_PASS_SECRET not set");
  return s;
}

const b64 = (buf) => Buffer.from(buf).toString("base64url");

function sign(payload) {
  const body = b64(JSON.stringify(payload));
  const mac = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

// Returns the payload, or null for anything tampered with, malformed or expired.
function verify(pass) {
  if (typeof pass !== "string" || !pass.includes(".")) return null;
  const [body, mac] = pass.split(".");
  let expected;
  try {
    expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  } catch { return null; }
  const a = Buffer.from(mac || "");
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { return null; }
  if (!payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

function issueViewerPass(id) {
  return sign({ role: "viewer", id, exp: Date.now() + VIEWER_DAYS * 864e5 });
}
function issueAuthorPass() {
  return sign({ role: "author", exp: Date.now() + AUTHOR_HOURS * 36e5 });
}

// A viewer pass is valid only for the one result it was issued for.
function viewerOf(pass, id) {
  const p = verify(pass);
  return p && p.role === "viewer" && p.id === id ? p : null;
}

// Daniel's assistant authenticates with a standing token instead of a code, so it
// can write a page unattended. Compared in constant time; absent token = no door.
function isAuthorToken(value) {
  const want = process.env.RESULTS_AUTHOR_TOKEN;
  if (!want || typeof value !== "string") return false;
  const a = Buffer.from(value);
  const b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isAuthor(event) {
  const h = event.headers || {};
  const bearer = String(h.authorization || h.Authorization || "").replace(/^Bearer\s+/i, "");
  if (isAuthorToken(bearer) || isAuthorToken(h["x-author-token"])) return true;
  const p = verify(passFromRequest(event));
  return Boolean(p && p.role === "author");
}

// The pass travels in a header (the pages send it) or a cookie (so a bookmarked
// link still works after the browser is closed).
function passFromRequest(event) {
  const h = event.headers || {};
  const direct = h["x-result-pass"] || h["X-Result-Pass"];
  if (direct) return String(direct);
  const cookie = String(h.cookie || h.Cookie || "");
  const m = cookie.match(/(?:^|;\s*)dt_result_pass=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

function passCookie(pass, days) {
  return `dt_result_pass=${encodeURIComponent(pass)}; Path=/; Max-Age=${Math.round(days * 86400)}; HttpOnly; Secure; SameSite=Lax`;
}

// ---- one-time codes ----
const newCode = () => String(crypto.randomInt(0, 1e6)).padStart(6, "0");
const hashCode = (code, id) =>
  crypto.createHmac("sha256", secret()).update(`${id}:${code}`).digest("hex");

function codeRecord(code, id) {
  return { codeHash: hashCode(code, id), expiresAt: Date.now() + CODE_TTL_MIN * 60000, attempts: 0 };
}

// Returns "ok" | "expired" | "locked" | "wrong". Never says which part was wrong
// beyond that, and burns an attempt every time.
function checkCode(record, code, id) {
  if (!record) return "expired";
  if (Date.now() > record.expiresAt) return "expired";
  if ((record.attempts || 0) >= MAX_CODE_ATTEMPTS) return "locked";
  const a = Buffer.from(hashCode(String(code || "").trim(), id));
  const b = Buffer.from(record.codeHash || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? "ok" : "wrong";
}

// Should publishing this email them? Only when it is crossing INTO published for
// the first time, and only when Daniel has not muted it for a quiet correction.
// Pulled out as its own function so it can be tested without a mail server.
function shouldNotify({ previous, next, notify }) {
  if (notify === false) return false;
  if (next !== "published") return false;
  return !previous || previous.status !== "published";
}

const normEmail = (v) => String(v || "").trim().toLowerCase();

module.exports = {
  VIEWER_DAYS, AUTHOR_HOURS, CODE_TTL_MIN, MAX_CODE_ATTEMPTS,
  issueViewerPass, issueAuthorPass, verify, viewerOf, isAuthor,
  passFromRequest, passCookie, newCode, codeRecord, checkCode, normEmail, shouldNotify,
};
