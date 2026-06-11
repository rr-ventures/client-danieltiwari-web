// Shared logic for the repo-wide change-approval gate. Used by:
//   - functions/deploy-succeeded.js  (event fn: fires when a build finishes)
//   - functions/change-gate.js       (the Approve / Reject links)
//
// Guarantee: the site's production deploy is LOCKED (auto-publishing stopped), so
// every push to main BUILDS but never goes live until a human approves it here.
// Mirrors the Telegram bot's gate, but for EVERY change from any source.
const crypto = require("node:crypto");
const { changeGateStore } = require("./blobs");
const { sendResendEmail, mailConfig } = require("./send");
const { escapeHtml } = require("./telegram");

const NETLIFY_API = "https://api.netlify.com/api/v1";
const SITE = process.env.SITE_ID || "d840f88f-717e-4b43-bc21-63522c048198";
const SITE_URL = (process.env.URL || "https://danieltiwari.com").replace(/\/$/, "");
const SELF = `${SITE_URL}/.netlify/functions/change-gate`;
const REPO = process.env.GATE_REPO || "rr-ventures/client-danieltiwari-web";

// ---- Netlify API ----------------------------------------------------------
async function netlify(path, method = "GET") {
  const token = process.env.NETLIFY_API_TOKEN;
  if (!token) throw new Error("NETLIFY_API_TOKEN not configured");
  const res = await fetch(`${NETLIFY_API}${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Netlify ${method} ${path} → ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return res.json().catch(() => ({}));
}

// Publish the built-but-unpublished deploy for `sha`, then re-lock so the gate
// stays armed. Throws STILL_BUILDING / NO_DEPLOY when the build isn't ready.
async function publishCommit(sha) {
  const deploys = await netlify(`/sites/${SITE}/deploys?per_page=40`);
  const matches = (d) => d.commit_ref && (d.commit_ref === sha || sha.startsWith(d.commit_ref) || d.commit_ref.startsWith(sha));
  const ready = deploys.find((d) => matches(d) && d.state === "ready");
  if (!ready) {
    if (deploys.some(matches)) throw new Error("STILL_BUILDING");
    throw new Error("NO_DEPLOY");
  }
  await netlify(`/sites/${SITE}/deploys/${ready.id}/restore`, "POST"); // publish this exact deploy
  await netlify(`/deploys/${ready.id}/lock`, "POST");                  // keep auto-publish off
  return ready;
}

// ---- GitHub API (read the commit message + diff for the email) ------------
async function github(path) {
  const token = process.env.GITHUB_RW_PAT;
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "danieltiwari-change-gate",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${path} → ${res.status}`);
  return res.json();
}

// Returns { message, diff } for `sha`, diffed against `base` when given.
async function commitDetails(sha, base) {
  let message = "", files = [];
  try {
    if (base && base !== sha) {
      const cmp = await github(`/repos/${REPO}/compare/${base}...${sha}`);
      files = cmp.files || [];
      const head = (cmp.commits && cmp.commits[cmp.commits.length - 1]) || {};
      message = head.commit ? head.commit.message : "";
    } else {
      const c = await github(`/repos/${REPO}/commits/${sha}`);
      message = c.commit ? c.commit.message : "";
      files = c.files || [];
    }
  } catch { /* best effort — email still goes out with whatever we have */ }
  const diff = files
    .map((f) => `diff --git ${f.filename}\n@@ ${f.status} ${f.filename} @@\n${f.patch || "(binary or too large to show)"}`)
    .join("\n").slice(0, 60000);
  return { message, diff };
}

// ---- Email ----------------------------------------------------------------
function diffTable(diff) {
  const all = String(diff || "").split("\n");
  const rows = all.slice(0, 400).map((line) => {
    const add = /^\+(?!\+\+)/.test(line), del = /^-(?!--)/.test(line), hunk = /^@@/.test(line), meta = /^diff /.test(line);
    const bg = add ? "#e6ffed" : del ? "#ffeef0" : hunk ? "#f1f8ff" : "#fff";
    const col = add ? "#137333" : del ? "#b3261e" : hunk ? "#0550ae" : meta ? "#999" : "#444";
    return `<tr><td style="font-family:monospace;font-size:12px;padding:1px 8px;white-space:pre-wrap;color:${col};background:${bg}">${escapeHtml(line) || "&nbsp;"}</td></tr>`;
  }).join("");
  const more = all.length > 400 ? `<p style="color:#999;font-size:12px;margin-top:6px">…diff truncated (${all.length - 400} more lines)…</p>` : "";
  return `<table style="border-collapse:collapse;width:100%;border:1px solid #eee;border-radius:6px;overflow:hidden">${rows}</table>${more}`;
}

function approvalEmail({ subject, author, sha, diff, approve, reject }) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#15140f;line-height:1.55;max-width:46rem">
    <h2 style="font-weight:600;font-size:19px;margin-bottom:4px">Approve this change to danieltiwari.com?</h2>
    <p style="color:#666;margin-top:0">A change was pushed to the site${author ? ` by <b>${escapeHtml(author)}</b>` : ""}. It has been built, but <b>will not go live</b> until you approve it.</p>
    <div style="background:#f6f8fa;border-left:3px solid #15140f;padding:12px 16px;border-radius:6px;font-size:15px">${escapeHtml((subject || "(no commit message)").split("\n")[0])}</div>
    <p style="margin:30px 0 6px">
      <a href="${approve}" style="background:#137333;color:#fff;padding:13px 26px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px">✓ Approve &amp; publish</a>
      &nbsp;&nbsp;&nbsp;<a href="${reject}" style="color:#888;font-size:14px">Reject</a>
    </p>
    <h3 style="font-size:13px;color:#444;margin:26px 0 8px;text-transform:uppercase;letter-spacing:.05em">Exactly what changed (${escapeHtml((sha || "").slice(0, 7))})</h3>
    ${diffTable(diff)}
    <p style="color:#999;font-size:13px;margin-top:18px">Green = added, red = removed. Either Dan or Reece can approve. Nothing is live until someone clicks Approve; the site updates ~1 minute after.</p>
  </div>`;
}

function recipients() {
  return [
    process.env.DAN_NOTIFY_EMAIL || "email@danieltiwari.com",
    process.env.REECE_NOTIFY_EMAIL || "reece.j.rainer@gmail.com",
  ].filter(Boolean);
}

// ---- Entry points ---------------------------------------------------------
// Called by the deploy-succeeded event function with the deploy payload.
async function onDeploySucceeded(deploy) {
  if (!deploy || !deploy.commit_ref) return "no-commit";
  const sha = deploy.commit_ref;
  // Production only. Branch deploys / Deploy Previews never touch the live domain.
  const isProd = deploy.context === "production" || deploy.branch === "main";
  if (!isProd) return "not-production";

  const store = changeGateStore();

  // Self-arm: make sure auto-publishing is OFF so every future deploy is gated.
  // On the FIRST run after this function ships, the just-built deploy is still
  // auto-published (live) — we lock it here, which arms the gate from then on.
  let published = "";
  try {
    const pub = (await netlify(`/sites/${SITE}`)).published_deploy;
    published = pub?.commit_ref || "";
    if (pub?.id && !pub.locked) await netlify(`/deploys/${pub.id}/lock`, "POST");
  } catch { /* best effort */ }

  // Skip the deploy that is already the live one (the first build / a re-publish),
  // and de-dupe repeat events for the same commit.
  if (published && (published === sha || sha.startsWith(published) || published.startsWith(sha))) return "already-live";
  if (await store.get(`seen:${sha}`).catch(() => null)) return "already-staged";

  const { message, diff } = await commitDetails(sha, published);

  // Telegram-approved changes already passed a human gate → publish, no email.
  if (/via Telegram/i.test(message || deploy.title || "")) {
    try { const d = await publishCommit(sha); await store.setJSON(`seen:${sha}`, { autoPublished: d.id }); return "auto-published"; }
    catch (e) { if (e.message !== "STILL_BUILDING" && e.message !== "NO_DEPLOY") return `auto-publish-failed:${e.message}`; }
  }

  const token = crypto.randomBytes(18).toString("base64url");
  const subject = (message || deploy.title || "").split("\n")[0];
  const author = deploy.committer || "";
  await store.setJSON(token, { sha, subject, author, createdAt: new Date().toISOString() });
  await store.setJSON(`seen:${sha}`, { token, createdAt: new Date().toISOString() });

  const { from } = mailConfig();
  const mail = await sendResendEmail({
    from, to: recipients(),
    subject: `Approve a change to danieltiwari.com — ${subject.slice(0, 60) || sha.slice(0, 7)}`,
    html: approvalEmail({ subject, author, sha, diff, approve: `${SELF}?approve=${token}`, reject: `${SELF}?reject=${token}` }),
    tags: [{ name: "source", value: "change_gate" }],
  }).catch((e) => ({ error: e.message }));
  return mail && mail.error ? `email-failed:${mail.error}` : "staged";
}

async function approve(token) {
  const store = changeGateStore();
  const rec = await store.get(token, { type: "json" }).catch(() => null);
  if (!rec) return { ok: false, msg: "This change was already published, rejected, or has expired." };
  const d = await publishCommit(rec.sha); // may throw STILL_BUILDING / NO_DEPLOY
  await store.delete(token);
  await store.delete(`seen:${rec.sha}`).catch(() => {});
  return { ok: true, msg: `Approved and publishing now. <b>${escapeHtml((rec.subject || "").slice(0, 120))}</b><br><br>It will be live on danieltiwari.com within ~1 minute.<br><span style="color:#999;font-size:13px">Deploy ${escapeHtml((d.id || "").slice(0, 8))}</span>` };
}

async function reject(token) {
  const store = changeGateStore();
  const rec = await store.get(token, { type: "json" }).catch(() => null);
  if (rec) { await store.delete(token); await store.delete(`seen:${rec.sha}`).catch(() => {}); }
  return rec ? "Change rejected. Nothing was published — the site stays exactly as it was." : "This change was already handled or has expired.";
}

module.exports = { onDeploySucceeded, approve, reject, publishCommit };
