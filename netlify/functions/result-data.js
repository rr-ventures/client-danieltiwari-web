const { resultsStore, resultPagesStore } = require("../lib/blobs");
const { viewerOf, isAuthor, passFromRequest } = require("../lib/result-access");

// GET /api/result-data?id=<id>
// Returns the result page Daniel WROTE for this person — never a machine-written
// one (Reece 2026-09-12: the automatic version is off; his words are the product).
// Requires a pass proving the reader owns the email the assessment came in on,
// so a forwarded link is not a way in.
exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const id = (event.queryStringParameters || {}).id || "";
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(id)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid id" }) };
  }

  // Daniel previewing his own draft is allowed; everyone else needs a pass for
  // this exact result.
  const pass = passFromRequest(event);
  const author = isAuthor(event);
  if (!author && !viewerOf(pass, id)) {
    return { statusCode: 401, body: JSON.stringify({ error: "Sign in to view this." }) };
  }

  try {
    const record = await resultsStore().get(id, { type: "json" });
    if (!record) return { statusCode: 404, body: JSON.stringify({ error: "Not found" }) };

    const page = await resultPagesStore().get(id, { type: "json" }).catch(() => null);
    const ready = Boolean(page && page.status === "published");
    if (!ready && !author) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({ ready: false, firstName: firstNameOf(record.answers) }),
      };
    }

    return {
      statusCode: 200,
      // Never cached: Daniel edits these, and a stale copy would show a prospect
      // an earlier draft of his words.
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({
        ready,
        draft: !ready,
        firstName: firstNameOf(record.answers),
        html: (page && page.html) || "",
        updatedAt: page && page.updatedAt,
        createdAt: record.createdAt,
      }),
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};

function firstNameOf(answers) {
  const n = String((answers && (answers.first_name || answers.name)) || "").trim();
  return n ? n.split(/\s+/)[0] : "";
}
