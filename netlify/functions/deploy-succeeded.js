// Netlify event-triggered function: fires when a build finishes. Because the
// site's production deploy is LOCKED (auto-publishing stopped), the finished
// build is NOT live yet — this stages it and emails Dan + Reece an
// Approve/Reject link (or auto-publishes if the Telegram bot already approved it).
// All logic in ../lib/change-gate.js. See that file for the full design.
const { onDeploySucceeded } = require("../lib/change-gate");

exports.handler = async (event) => {
  let payload;
  try {
    const body = JSON.parse(event.body || "{}");
    payload = body.payload || body; // Netlify wraps the deploy in { payload }
  } catch {
    return { statusCode: 200, body: "no-body" };
  }
  try {
    const result = await onDeploySucceeded(payload);
    return { statusCode: 200, body: String(result) };
  } catch (err) {
    console.error("change-gate deploy-succeeded error:", err);
    return { statusCode: 200, body: `error: ${err.message}` }; // never fail the deploy
  }
};
