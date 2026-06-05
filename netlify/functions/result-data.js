const { resultsStore } = require("../lib/blobs");

// GET /api/result-data?id=<id>
// Returns the stored answers for a hosted Authenticity Map so result.html can
// recompute and render it with the shared assessment-core logic.
exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const id = (event.queryStringParameters || {}).id || "";
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(id)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid id" }) };
  }

  try {
    const store = resultsStore();
    const record = await store.get(id, { type: "json" });
    if (!record) {
      return { statusCode: 404, body: JSON.stringify({ error: "Not found" }) };
    }
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
      body: JSON.stringify({ answers: record.answers, createdAt: record.createdAt }),
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
