const { getStore } = require("@netlify/blobs");

// Open the results store. Git/Netlify-managed deploys auto-inject the Blobs
// context, but manual CLI deploys (`netlify deploy`) do not — so when
// BLOBS_SITE_ID + BLOBS_TOKEN are present we configure the store explicitly.
// Falls back to zero-config for git-built deploys (env vars can then be removed).
function resultsStore() {
  const siteID = process.env.BLOBS_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  return siteID && token
    ? getStore({ name: "assessment-results", siteID, token })
    : getStore("assessment-results");
}

// Per-lead nurture progress (Model B daily drip). One blob per lead:
// { email, branch, mergeFields, name, startedAt, sentDays: [int], done }.
// The scheduled nurture-drip function reads these to send each lead's next
// due email from the CURRENT copy, so repo edits reach everyone still in-flight.
function dripStore() {
  const siteID = process.env.BLOBS_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  return siteID && token
    ? getStore({ name: "nurture-drip", siteID, token })
    : getStore("nurture-drip");
}

// Staged-but-not-yet-approved Telegram edits, keyed by an unguessable token.
// The bot writes a pending edit + emails Dan an approve link; the approve
// handler reads it back, commits it, and deletes the blob.
function pendingEditsStore() {
  const siteID = process.env.BLOBS_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  return siteID && token
    ? getStore({ name: "pending-edits", siteID, token })
    : getStore("pending-edits");
}

// Staged-but-not-yet-approved AGENT changesets (whole-repo edits proposed by the
// Telegram Claude agent), keyed by an unguessable token. Holds the full
// {changes, summary, requestedBy, chatId} until someone approves or discards.
function changesetStore() {
  const siteID = process.env.BLOBS_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  return siteID && token
    ? getStore({ name: "agent-changesets", siteID, token })
    : getStore("agent-changesets");
}

// Short per-user conversation memory so follow-ups ("now make it shorter") work.
// One blob per Telegram user id: [{role, content}, ...] (trimmed).
function threadStore() {
  const siteID = process.env.BLOBS_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  return siteID && token
    ? getStore({ name: "agent-threads", siteID, token })
    : getStore("agent-threads");
}

module.exports = { resultsStore, dripStore, pendingEditsStore, changesetStore, threadStore };
