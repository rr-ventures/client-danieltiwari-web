// Daniel's results workspace, and the door his own assistant writes through.
//
// Reece 2026-09-12: he writes each person's result on a private page of his own
// site (sees their answers, types his words, hits publish) — AND that same thing
// has to be drivable by his assistant, so every action here is a plain JSON call
// with a standing token as an alternative to his emailed code.
//
//   GET  ?action=list                 -> every submission, newest first
//   GET  ?action=get&id=<id>          -> that person's answers + current draft
//   POST {action:"save",   id, html}  -> save a draft (nobody sees it)
//   POST {action:"publish",id, html?} -> publish it; the person can now read it
//   POST {action:"unpublish", id}     -> take it back to a draft
//
// Auth: an author pass (code emailed to DAN_NOTIFY_EMAIL) or
// `Authorization: Bearer <RESULTS_AUTHOR_TOKEN>` for his assistant.
const { resultsStore, resultPagesStore } = require("../lib/blobs");
const { isAuthor, shouldNotify } = require("../lib/result-access");
const { sendResendEmail, mailConfig } = require("../lib/send");

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

const VALID_ID = /^[A-Za-z0-9_-]{6,32}$/;

// The result page is Daniel's writing, rendered as HTML. He is the only author,
// so this is not a sanitiser against him — it is a guard against a stored script
// ever reaching a prospect's browser if something upstream is ever compromised.
function cleanHtml(input) {
  return String(input || "")
    .replace(/<\s*(script|iframe|object|embed|form)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|iframe|object|embed|form)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "")
    .slice(0, 200 * 1024);
}

// The email that tells someone their result exists. Without this, publishing is
// silent: they were promised they would hear, and nothing would ever arrive.
// Found in the red team of Daniel's own list, 2026-09-12.
function readyEmail({ firstName, url }) {
  const hi = firstName ? `${escapeText(firstName)}, your` : "Your";
  return `<div style="font-family:Georgia,serif;color:#15140f;line-height:1.7;max-width:32rem">
    <p style="margin:0 0 1rem">${hi} assessment is ready.</p>
    <p style="margin:0 0 1.4rem">It's here, and it's private to you:</p>
    <p style="margin:0 0 1.4rem"><a href="${escapeText(url)}" style="color:#15140f">${escapeText(url)}</a></p>
    <p style="margin:0 0 1rem">Opening it asks for the email address you used, then sends a 6-digit code to it. That keeps it yours and nobody else's. After the first time your browser remembers you, so you can come back to it whenever you want.</p>
    <p style="margin:0 0 1rem">Take it slowly.</p>
    <p style="margin:0 0 1rem">Daniel</p>
  </div>`;
}

function escapeText(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function firstNameOf(answers) {
  const n = String((answers && (answers.first_name || answers.name)) || "").trim();
  return n ? n.split(/\s+/)[0] : "";
}

function summarise(id, record, page) {
  const a = (record && record.answers) || {};
  return {
    id,
    name: String(a.name || a.first_name || "").trim() || null,
    email: a.email || null,
    submittedAt: record && record.createdAt,
    status: (page && page.status) || "none",
    updatedAt: page && page.updatedAt,
    hasDraft: Boolean(page && page.html),
  };
}

exports.handler = async (event) => {
  if (!isAuthor(event)) return json(401, { error: "Not authorised." });

  const results = resultsStore();
  const pages = resultPagesStore();
  const qs = event.queryStringParameters || {};

  if (event.httpMethod === "GET") {
    if (qs.action === "list") {
      const listing = await results.list();
      const blobs = (listing.blobs || []).map((b) => b.key).filter((k) => VALID_ID.test(k));
      const rows = await Promise.all(blobs.map(async (id) => {
        const [record, page] = await Promise.all([
          results.get(id, { type: "json" }).catch(() => null),
          pages.get(id, { type: "json" }).catch(() => null),
        ]);
        return summarise(id, record, page);
      }));
      rows.sort((x, y) => String(y.submittedAt || "").localeCompare(String(x.submittedAt || "")));
      return json(200, { rows });
    }

    if (qs.action === "get") {
      const id = String(qs.id || "");
      if (!VALID_ID.test(id)) return json(400, { error: "Invalid id" });
      const record = await results.get(id, { type: "json" }).catch(() => null);
      if (!record) return json(404, { error: "Not found" });
      const page = await pages.get(id, { type: "json" }).catch(() => null);
      return json(200, {
        id,
        answers: record.answers,
        submittedAt: record.createdAt,
        html: (page && page.html) || "",
        status: (page && page.status) || "none",
        updatedAt: page && page.updatedAt,
      });
    }

    return json(400, { error: "Unknown action" });
  }

  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Bad request" }); }
  const id = String(body.id || "");
  if (!VALID_ID.test(id)) return json(400, { error: "Invalid id" });

  const exists = await results.get(id, { type: "json" }).catch(() => null);
  if (!exists) return json(404, { error: "No submission with that id" });

  const current = await pages.get(id, { type: "json" }).catch(() => null);
  const now = new Date().toISOString();

  if (body.action === "save" || body.action === "publish") {
    // publish with no html means "publish what is already saved"
    const html = body.html === undefined && body.action === "publish"
      ? (current && current.html) || ""
      : cleanHtml(body.html);
    if (body.action === "publish" && !html.trim()) {
      return json(400, { error: "Nothing to publish yet. Write the result first." });
    }
    const next = {
      html,
      status: body.action === "publish" ? "published" : (current && current.status === "published" ? "published" : "draft"),
      updatedAt: now,
      publishedAt: body.action === "publish" ? now : (current && current.publishedAt) || null,
    };
    await pages.setJSON(id, next);

    // Only on the transition INTO published, and never again on a re-publish of
    // an already-live page: a tweak to one paragraph must not email them twice.
    // `notify: false` turns it off for a correction Daniel does not want announced.
    let notified = null;
    if (shouldNotify({ previous: current, next: next.status, notify: body.notify })) {
      const to = String((exists.answers && exists.answers.email) || "").trim();
      if (to) {
        const { from, replyTo } = mailConfig();
        const site = (process.env.URL || "https://danieltiwari.com").replace(/\/$/, "");
        notified = await sendResendEmail({
          from,
          to: [to],
          reply_to: replyTo,
          subject: "Your assessment is ready",
          html: readyEmail({ firstName: firstNameOf(exists.answers), url: `${site}/r/${id}` }),
          tags: [{ name: "source", value: "assessment_result_ready" }],
        }).then(() => ({ sent: true })).catch((e) => ({ sent: false, error: e.message }));
      } else {
        notified = { sent: false, error: "no email on that submission" };
      }
    }

    return json(200, { ok: true, id, status: next.status, updatedAt: next.updatedAt, notified });
  }

  if (body.action === "unpublish") {
    if (!current) return json(404, { error: "Nothing written for this one yet" });
    await pages.setJSON(id, { ...current, status: "draft", updatedAt: now });
    return json(200, { ok: true, id, status: "draft" });
  }

  return json(400, { error: "Unknown action" });
};
