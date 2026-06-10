/* ============================================================
   Dan, post-quiz nurture sequence (content + render)
   Source copy (Dan's voice, v1 draft, pending Dan's voice pass):
   vault .../dan-resend-nurture-build/dan-nurture-sequence-copy.md
     Branch A, diagnostic / high-fit · 6 emails / 12 days
     Branch B, nurture / everyone else · 7 emails / 21 days
   Merge fields: {{first_name}} {{top_focus_area}} {{authenticity_stage}}
   Tokens:  [MAP]  -> link to the hosted Authenticity Map (A1/B1 only)
            [BOOK] -> booking link (Calendly placeholder for now)
   Email 1 (A1/B1, day 0) is the result-link email, sent instantly.
   ============================================================ */

// Each email: { day, subject, preview, body }. body = array of paragraphs.
// Email content is the editable Markdown under content/emails/<branch>/*.md.
// scripts/build-emails.mjs bakes those into emails.generated.json (esbuild inlines
// this JSON into the function bundle — no build step required). Edit the .md, not this.
const { branchA: BRANCH_A, branchB: BRANCH_B } = require("./emails.generated.json");

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

// **bold** -> <strong>, applied AFTER escaping.
function inlineFormat(text) {
  return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function fillMerge(text, fields) {
  return text
    .replaceAll("{{first_name}}", fields.first_name || "there")
    .replaceAll("{{top_focus_area}}", fields.top_focus_area || "the area you flagged")
    .replaceAll("{{authenticity_stage}}", fields.authenticity_stage || "where you are");
}

// Render one email's body paragraphs into light, text-forward HTML.
function renderBody(paragraphs, fields) {
  const linkStyle = "color:#15140f;border-bottom:1px solid #15140f;text-decoration:none;";
  const blocks = paragraphs.map((raw) => {
    if (raw === "[MAP]") {
      if (!fields.map_url) return "";
      return `<p style="margin:1.3rem 0;"><a href="${escapeHtml(fields.map_url)}" style="font-size:1.05rem;${linkStyle}">Open your Authenticity Map &rarr;</a></p>`;
    }
    if (raw === "[BOOK]") {
      return `<p style="margin:1.3rem 0;"><a href="${escapeHtml(fields.book_url)}" style="font-size:1.05rem;${linkStyle}">Book a private conversation &rarr;</a></p>`;
    }
    const filled = inlineFormat(escapeHtml(fillMerge(raw, fields)));
    return `<p style="margin:0 0 1rem;">${filled}</p>`;
  });
  return `<div style="font-family:Georgia,serif;color:#15140f;line-height:1.65;font-size:16px;max-width:32rem;">${blocks.join("")}</div>`;
}

// Build the full set of emails for an audience, with merge fields resolved.
// Returns [{ day, subject, html }] for the requested branch.
function buildBranch(route, fields) {
  const branch = route === "diagnostic" ? BRANCH_A : BRANCH_B;
  return branch.map((email) => ({
    day: email.day,
    subject: fillMerge(email.subject, fields),
    preview: fillMerge(email.preview, fields),
    html: renderBody(email.body, fields),
  }));
}

module.exports = { BRANCH_A, BRANCH_B, buildBranch };
