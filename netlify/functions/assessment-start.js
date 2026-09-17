// Somebody has given their name and email and is about to begin.
//
// Before this existed, name and email were the LAST thing asked, so a person who
// stopped halfway left nothing behind at all and Daniel could not tell that anyone
// had even started (Reece 2026-09-13). This writes the person down at the FIRST
// click, and the full submit later fills in the same record with their answers.
//
// Deliberately quiet: it emails nobody. Daniel hears about a finished assessment,
// not about everyone who opened one. Their row simply sits in his workspace as
// "started", and turns into a real submission if they finish.
const { resultsStore } = require("../lib/blobs");
const crypto = require("node:crypto");

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

const shortId = () => crypto.randomBytes(9).toString("base64url");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" } };
  }
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Bad request" }); }

  const firstName = String(body.first_name || "").trim().slice(0, 80);
  const email = String(body.email || "").trim().slice(0, 200);
  if (!firstName) return json(400, { error: "Please give your first name." });
  if (!email.includes("@") || !email.includes(".")) return json(400, { error: "Please give a real email address." });

  const id = shortId();
  const startedAt = new Date().toISOString();
  try {
    await resultsStore().setJSON(id, {
      answers: { first_name: firstName, name: firstName, email },
      createdAt: startedAt,
      startedAt,
      // the tell that they have not finished. assessment-submit overwrites this
      // whole record when they do, so it can never be left behind wrongly.
      started: true,
    });
  } catch (error) {
    // Never block someone from starting because storage hiccuped. They still
    // finish normally, and the submit writes the full record anyway.
    return json(200, { ok: true, id: null, storeWarning: error.message });
  }

  return json(200, { ok: true, id });
};
