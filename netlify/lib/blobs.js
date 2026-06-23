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

// Newsletter subscribers (the homepage "Words Worth Writing" form). One blob
// per subscriber keyed by email: { email, firstName, lastName, confirmedAt }.
function subscribersStore() {
  const siteID = process.env.BLOBS_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  return siteID && token
    ? getStore({ name: "newsletter-subscribers", siteID, token })
    : getStore("newsletter-subscribers");
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

// Staged-but-not-yet-approved REPO-WIDE pushes (any change to main from any
// source — direct push, another agent, fleet autosave). The GitHub Action posts
// the commit + diff here keyed by an unguessable token; the approve link
// publishes the matching (built-but-unpublished, because the site is locked)
// Netlify deploy, the reject link discards it. Mirrors the Telegram gate but for
// every change, not just the bot's.
function changeGateStore() {
  const siteID = process.env.BLOBS_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  return siteID && token
    ? getStore({ name: "change-gate", siteID, token })
    : getStore("change-gate");
}


// Per-user session accumulator: staged changes queued across multiple Telegram
// messages, held until Dan signals done/publish. One blob per user id:
// { changes: [{path, before, after}], summaries: [string], createdAt, lastUpdated }
function sessionStore() {
  const siteID = process.env.BLOBS_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  return siteID && token
    ? getStore({ name: "agent-sessions", siteID, token })
    : getStore("agent-sessions");
}

module.exports = { resultsStore, sessionStore, dripStore, subscribersStore, pendingEditsStore, changesetStore, threadStore, changeGateStore };
