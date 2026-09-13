// Shared logic for the repo-wide change-approval gate. Used by:
//   - functions/deploy-succeeded.js  (event fn: fires when a build finishes)
//   - functions/change-gate.js       (the Approve / Reject links)
//
// Guarantee: the site's production deploy is LOCKED (auto-publishing stopped), so
// every push to main BUILDS but never goes live until a human approves it here.
// Mirrors the Telegram bot's gate, but for EVERY change from any source.
const crypto = require("node:crypto");
const { changeGateStore } = require("./blobs");
const { headlineFrom, plainEnglishFor } = require("./release-headline");
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
  const token = process.env.DAN_GITHUB_TOKEN_WEBSITE_REPO;
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

// Returns { message, diff, subjects } for `sha`, diffed against `base` when given.
// `subjects` is every commit in the range, so the email can show the whole batch
// rather than leaning on one line being the right one.
async function commitDetails(sha, base) {
  let message = "", files = [], subjects = [], plain = null;
  try {
    if (base && base !== sha) {
      const cmp = await github(`/repos/${REPO}/compare/${base}...${sha}`);
      files = cmp.files || [];
      const picked = headlineFrom(cmp.commits);
      message = picked.headline;
      subjects = picked.subjects;
      plain = plainEnglishFor(cmp.commits);
    } else {
      const c = await github(`/repos/${REPO}/commits/${sha}`);
      message = c.commit ? c.commit.message : "";
      files = c.files || [];
      subjects = [String(message).split("\n")[0]].filter(Boolean);
      plain = plainEnglishFor([c]);
    }
  } catch { /* best effort — email still goes out with whatever we have */ }
  const diff = files
    .map((f) => `diff --git ${f.filename}\n@@ ${f.status} ${f.filename} @@\n${f.patch || "(binary or too large to show)"}`)
    .join("\n").slice(0, 60000);
  return { message, diff, subjects, fileCount: files.length, plain };
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

// Map a raw git committer name/email to a friendly "who made the change" label.
// Named people win over the agent pattern (a commit can be "Reece via Claude").
function friendlyName(raw) {
  const s = String(raw || "").toLowerCase();
  if (!s) return "";
  if (/(reece|rainer)/.test(s)) return "Reece";
  if (/(daniel|tiwari)/.test(s)) return "Daniel";
  if (/(claude|agent|\bbot\b|github-?actions|noreply)/.test(s)) return "an agent on Reece's behalf";
  // Netlify reports the committer as the GitHub org, so Daniel was reading
  // "Change by rr-ventures", which means nothing to him.
  if (/(rr-?ventures|spareday)/.test(s)) return "Reece's team";
  return raw; // unknown — show as-is rather than guess
}

// Best "who made this change" label: prefer an explicit "Requested by <name>" in
// the commit message (the Telegram-style trailer), else the git committer. Daniel's
// edits arrive via Telegram and auto-publish, so an email-gated change is almost
// always Reece's side — we say that plainly instead of a vague "automated update".
function whoMadeChange(message, committer) {
  const m = String(message || "").match(/requested by\s+([a-z]+)/i);
  if (m) { const n = friendlyName(m[1]); if (n) return n; }
  return friendlyName(committer || "") || "an agent on Reece's behalf";
}

// Short human relative time for the "already approved … ago" messages.
function relTime(iso) {
  const ms = Date.now() - Date.parse(iso || "");
  if (!Number.isFinite(ms)) return "";
  const m = Math.round(ms / 60000);
  if (m < 1) return " just now";
  if (m < 60) return ` ${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return ` ${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return ` ${d} day${d === 1 ? "" : "s"} ago`;
}

// The page shown when someone opens an approve/reject link that was already
// resolved — names who did it and the outcome, instead of "already published".
function resolvedMessage(done) {
  const subj = escapeHtml((done.subject || "").slice(0, 120));
  const tail = subj ? `<br><br><b>${subj}</b>` : "";
  const by = done.by ? escapeHtml(done.by) : "Someone";
  const when = relTime(done.at);
  if (done.outcome === "approved")
    return `${by} already approved this change${when}. It is live on danieltiwari.com — nothing else is needed.${tail}`;
  if (done.outcome === "rejected")
    return `${by} already rejected this change${when}. Nothing was published and the site is unchanged.${tail}`;
  if (done.outcome === "already-live")
    return `This one is already on the site, along with everything that came after it. Nothing was changed.${tail}`;
  return "This change was already handled.";
}

function approvalEmail({ subject, who, sha, diff, approve, reject, subjects, fileCount, plain }) {
  // When a deploy carries several commits, list every one. Picking a headline is a
  // guess; showing the whole batch is not.
  const rest = (subjects || []).filter((t) => t && t !== String(subject || "").split("\n")[0]);
  const alsoHtml = rest.length
    ? `<p style="margin:14px 0 4px;font-size:13px;color:#444;text-transform:uppercase;letter-spacing:.05em">Everything in this release (${(subjects || []).length} change${(subjects || []).length === 1 ? "" : "s"}${fileCount ? `, ${fileCount} file${fileCount === 1 ? "" : "s"}` : ""})</p>
       <ul style="margin:0;padding-left:20px;font-size:14px;color:#333">${rest.map((t) => `<li style="margin:2px 0">${escapeHtml(t)}</li>`).join("")}</ul>`
    : "";
  // Written for Daniel, who is not a developer. He should be able to read the top
  // of this email and know what it does for him and what it risks, without opening
  // the diff (Reece, 13 September 2026: "the error messages are so vague and
  // unuseful that he has no idea what the changes are and I'm approving them").
  // Kept, but back in the plainer house style of the original email rather than the
  // soft, over-reassuring rewrite (Reece, 14 September 2026: "make the approval
  // email sound a bit more like it did before").
  const plainHtml = plain
    ? `<div style="background:#f6f8fa;border-left:3px solid #137333;padding:12px 16px;border-radius:6px;margin:0 0 4px">
         <p style="margin:0 0 8px;font-size:15px"><b>What changes:</b> ${escapeHtml(plain.what)}</p>
         ${plain.why ? `<p style="margin:0 0 8px;font-size:15px"><b>Why it helps:</b> ${escapeHtml(plain.why)}</p>` : ""}
         ${plain.risk ? `<p style="margin:0;font-size:15px;color:#444"><b>Risk:</b> ${escapeHtml(plain.risk)}</p>` : ""}
       </div>`
    : `<div style="background:#f6f8fa;border-left:3px solid #c9a227;padding:12px 16px;border-radius:6px;margin:0 0 4px">
         <p style="margin:0;font-size:15px">Nobody wrote a plain explanation of this one, so the technical note below is all there is to go on. Reply and ask before approving it if it is not clear.</p>
       </div>`;

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#15140f;line-height:1.55;max-width:46rem">
    <h2 style="font-weight:600;font-size:19px;margin-bottom:6px">Approve this change to danieltiwari.com?</h2>
    <p style="margin:0 0 8px"><span style="display:inline-block;background:#eef1f4;border-radius:999px;padding:3px 13px;font-size:13px;font-weight:600;color:#15140f">Change by ${escapeHtml(who || "an agent on Reece's behalf")}</span></p>
    <p style="color:#666;margin-top:0">It has been built, but <b>will not go live</b> until it is approved.</p>
    ${plainHtml}
    <p style="margin:30px 0 6px">
      <a href="${approve}" style="background:#137333;color:#fff;padding:13px 26px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px">✓ Approve &amp; publish</a>
      &nbsp;&nbsp;&nbsp;<a href="${reject}" style="color:#888;font-size:14px">Reject</a>
    </p>
    <h3 style="font-size:13px;color:#444;margin:26px 0 8px;text-transform:uppercase;letter-spacing:.05em">The technical note</h3>
    <div style="background:#f6f8fa;border-left:3px solid #15140f;padding:12px 16px;border-radius:6px;font-size:15px">${escapeHtml((subject || "(no commit message)").split("\n")[0])}</div>
    ${alsoHtml}
    <h3 style="font-size:13px;color:#444;margin:26px 0 8px;text-transform:uppercase;letter-spacing:.05em">Exactly what changed (${escapeHtml((sha || "").slice(0, 7))})</h3>
    ${diffTable(diff)}
    <p style="color:#999;font-size:13px;margin-top:18px">Green = added, red = removed. Either Daniel or Reece can approve, whoever clicks first publishes it. If the other person already approved or rejected it, you will see exactly that when you click, so there is no harm in being second. Nothing is live until someone clicks Approve; the site updates about a minute after.</p>
  </div>`;
}

// Each recipient gets their own approve/reject link tagged with who they are,
// so a later click can report "Reece already approved this" by name.
function recipients() {
  return [
    { email: process.env.DAN_NOTIFY_EMAIL || "email@danieltiwari.com", who: "Daniel" },
    { email: process.env.REECE_NOTIFY_EMAIL || "reece.j.rainer@gmail.com", who: "Reece" },
  ].filter((r) => r.email);
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

  const { message, diff, subjects, fileCount, plain } = await commitDetails(sha, published);

  // Telegram-approved changes already passed a human gate → publish, no email.
  if (/via Telegram/i.test(message || deploy.title || "")) {
    try { const d = await publishCommit(sha); await store.setJSON(`seen:${sha}`, { autoPublished: d.id }); return "auto-published"; }
    catch (e) { if (e.message !== "STILL_BUILDING" && e.message !== "NO_DEPLOY") return `auto-publish-failed:${e.message}`; }
  }

  const token = crypto.randomBytes(18).toString("base64url");
  const subject = (message || deploy.title || "").split("\n")[0];
  const who = whoMadeChange(message, deploy.committer);
  await store.setJSON(token, { sha, subject, who, createdAt: new Date().toISOString() });
  await store.setJSON(`seen:${sha}`, { token, createdAt: new Date().toISOString() });

  // One personalised email per recipient so the approve link carries who they
  // are (?by=Daniel / ?by=Reece). Whoever clicks first publishes; the other sees
  // "<name> already approved this" instead of a confusing "already published".
  const { from } = mailConfig();
  let lastErr;
  for (const r of recipients()) {
    const approve = `${SELF}?approve=${token}&by=${encodeURIComponent(r.who)}`;
    const reject = `${SELF}?reject=${token}&by=${encodeURIComponent(r.who)}`;
    const mail = await sendResendEmail({
      from, to: [r.email],
      // Say HOW MANY changes when it is a batch, so a release never reads as one
      // small thing because of whichever commit happened to be last.
      // The subject is the first thing he sees, so it is the plain-English line
      // when someone wrote one, never the commit subject (Reece 13 Sep 2026).
      // The original shape ("Approve a change to danieltiwari.com: ..."), but the
      // tail is the plain-English line when someone wrote one, so it is still
      // readable rather than a commit subject.
      subject: `Approve ${(subjects || []).length > 1 ? `${subjects.length} changes` : "a change"} to danieltiwari.com: ${((plain && plain.what) || subject || sha).slice(0, 60)}`,
      html: approvalEmail({ subject, who, sha, diff, approve, reject, subjects, fileCount, plain }),
      tags: [{ name: "source", value: "change_gate" }],
    }).catch((e) => ({ error: e.message }));
    if (mail && mail.error) lastErr = mail.error;
  }
  return lastErr ? `email-failed:${lastErr}` : "staged";
}

// Is `sha` already contained in what is live? An approval email sits in an inbox
// forever, and clicking an old one used to publish that old commit and roll the
// site BACKWARDS — the newest work silently disappearing off the live site
// (found 2026-09-13: six unclicked emails were each a loaded gun). Anything the
// live site already contains is a no-op now, not a rollback.
async function alreadyLive(sha) {
  let published = "";
  try {
    published = (await netlify(`/sites/${SITE}`)).published_deploy?.commit_ref || "";
  } catch {
    return false; // can't tell → behave as before rather than block a real approval
  }
  if (!published) return false;
  if (published === sha || sha.startsWith(published) || published.startsWith(sha)) return true;
  try {
    const cmp = await github(`/repos/${REPO}/compare/${sha}...${published}`);
    // "ahead" = live is in front of this commit, so this change is already in.
    return cmp.status === "ahead" || cmp.status === "identical";
  } catch {
    return false;
  }
}

async function approve(token, by) {
  const store = changeGateStore();
  const rec = await store.get(token, { type: "json" }).catch(() => null);
  if (!rec) {
    // Already approved/rejected (or expired). Tell them who, by name.
    const done = await store.get(`resolved:${token}`, { type: "json" }).catch(() => null);
    if (done) return { ok: true, msg: resolvedMessage(done) };
    return { ok: false, msg: "This change has expired or was already handled. Nothing else is needed." };
  }
  if (await alreadyLive(rec.sha)) {
    await store.delete(token);
    await store.delete(`seen:${rec.sha}`).catch(() => {});
    await store.setJSON(`resolved:${token}`, { outcome: "already-live", by: by || "", subject: rec.subject || "", at: new Date().toISOString() }).catch(() => {});
    return { ok: true, msg: `This one is already on the site, along with everything that came after it. Nothing was changed.<br><br><b>${escapeHtml((rec.subject || "").slice(0, 120))}</b>` };
  }
  const d = await publishCommit(rec.sha); // may throw STILL_BUILDING / NO_DEPLOY
  await store.delete(token);
  await store.delete(`seen:${rec.sha}`).catch(() => {});
  await store.setJSON(`resolved:${token}`, { outcome: "approved", by: by || "", subject: rec.subject || "", at: new Date().toISOString() }).catch(() => {});
  const byTxt = by ? ` by ${escapeHtml(by)}` : "";
  return { ok: true, msg: `Approved${byTxt}. Publishing now: <b>${escapeHtml((rec.subject || "").slice(0, 120))}</b><br><br>It will be live on danieltiwari.com within ~1 minute.<br><span style="color:#999;font-size:13px">Deploy ${escapeHtml((d.id || "").slice(0, 8))}</span>` };
}

async function reject(token, by) {
  const store = changeGateStore();
  const rec = await store.get(token, { type: "json" }).catch(() => null);
  if (!rec) {
    const done = await store.get(`resolved:${token}`, { type: "json" }).catch(() => null);
    if (done) return resolvedMessage(done);
    return "This change was already handled or has expired.";
  }
  await store.delete(token);
  await store.delete(`seen:${rec.sha}`).catch(() => {});
  await store.setJSON(`resolved:${token}`, { outcome: "rejected", by: by || "", subject: rec.subject || "", at: new Date().toISOString() }).catch(() => {});
  const byTxt = by ? ` by ${escapeHtml(by)}` : "";
  return `Change rejected${byTxt}. Nothing was published — the site stays exactly as it was.`;
}

module.exports = { onDeploySucceeded, approve, reject, publishCommit };
