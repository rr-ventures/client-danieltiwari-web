const { resultsStore, resultPagesStore } = require("../lib/blobs");
const { viewerOf, isAuthor, passFromRequest } = require("../lib/result-access");

// Same 10 areas assessment-submit.js scores against — kept local here too since
// nothing in this codebase shares it across functions yet.
const AREAS = [
  ["career", "Career"],
  ["relationships", "Relationships"],
  ["friendships", "Friendships"],
  ["family", "Family"],
  ["health", "Health"],
  ["attractiveness", "Attractiveness"],
  ["money", "Money / Finances"],
  ["lifestyle", "Lifestyle"],
  ["environment", "Environment"],
  ["fun_adventure", "Fun & Adventure"],
];

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// The wheel chart on their page reads scores only — never the open-text answers
// underneath a score, those stay out of this response same as everything else here.
function wheelOf(answers) {
  return AREAS.map(([key, label]) => ({
    key,
    label,
    score: numeric((answers && answers[`fulfillment_${key}`]), 0),
  }));
}

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
        wheel: wheelOf(record.answers),
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
