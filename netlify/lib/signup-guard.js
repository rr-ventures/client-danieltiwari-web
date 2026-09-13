// Stops the newsletter form being used as a spam cannon.
//
// Found live 2026-09-13: the subscribers store held 1,131 records, roughly 1,020
// of them bot signups that were never confirmed — gmail dot-variants of the same
// mailbox, SMS-to-email gateways, throwaway domains. Every one of them made
// danieltiwari.com send a "Confirm your e-mail." message to a stranger who never
// asked for it, from the same sending domain that has to land the assessment
// emails in a prospect's inbox. That is how a domain earns a spam reputation.
//
// The honeypot field alone did not stop it, because these bots POST straight at
// the function and never see the form. Three cheap layers that a real person
// never notices:
//   1. one address is one address — gmail ignores dots and +tags, so 500
//      dot-variants collapse to a single identity for counting purposes
//   2. a hard per-identity and per-network limit inside a rolling hour
//   3. a refusal for address shapes that are never a newsletter reader
const { subscribersStore } = require("./blobs");

const HOUR_MS = 60 * 60 * 1000;
const MAX_PER_IDENTITY_PER_HOUR = 2;
const MAX_PER_NETWORK_PER_HOUR = 5;

// Address shapes that are never someone signing up to read an essay.
const BLOCKED_DOMAINS = new Set([
  // carrier SMS-to-email gateways — used to bomb phone numbers
  "vtext.com", "tmomail.net", "txt.att.net", "messaging.sprintpcs.com",
  "vzwpix.com", "mms.att.net", "pm.sprint.com", "msg.fi.google.com",
  // throwaway inboxes
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "yopmail.com",
  "sharklasers.com", "temp-mail.org", "trashmail.com", "getnada.com",
  "dispostable.com", "maildrop.cc", "fakeinbox.com", "tempmail.com",
]);

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

// One person, one identity: gmail delivers to the same mailbox whatever dots or
// +tags are in the address, which is exactly what the bots were exploiting.
function identityOf(rawEmail) {
  const email = String(rawEmail || "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1) return email;
  let local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (GMAIL_DOMAINS.has(domain)) local = local.replaceAll(".", "");
  return `${local}@${domain}`;
}

function domainOf(rawEmail) {
  const email = String(rawEmail || "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  return at < 1 ? "" : email.slice(at + 1);
}

// A /24 stands in for "the same machine" without storing a full address.
function networkOf(ip) {
  const raw = String(ip || "").split(",")[0].trim();
  if (!raw) return "";
  const v4 = raw.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}`;
  return raw.split(":").slice(0, 4).join(":"); // IPv6 /64
}

function clientIp(event) {
  const h = event.headers || {};
  return h["x-nf-client-connection-ip"] || h["x-forwarded-for"] || h["client-ip"] || "";
}

// Rolling-hour counter kept in the same store, under a prefix that the exporter
// and the cleanup both know to ignore.
async function bump(store, key) {
  const now = Date.now();
  let hits = [];
  try {
    const rec = await store.get(`rate:${key}`, { type: "json" });
    if (rec && Array.isArray(rec.hits)) hits = rec.hits;
  } catch { /* first time, or storage hiccup — treat as empty */ }
  hits = hits.filter((t) => now - t < HOUR_MS);
  const count = hits.length;
  hits.push(now);
  try { await store.setJSON(`rate:${key}`, { hits: hits.slice(-20), at: new Date(now).toISOString() }); } catch { /* not fatal */ }
  return count; // how many there were BEFORE this one
}

// Returns null when the signup should go ahead, or { reason } when it should be
// silently accepted and dropped. Never throws: a guard that falls over must not
// take the signup form down with it.
async function shouldDrop(event, email) {
  try {
    const domain = domainOf(email);
    if (!domain || BLOCKED_DOMAINS.has(domain)) return { reason: "blocked-domain" };

    const store = subscribersStore();
    const identity = identityOf(email);
    if ((await bump(store, `id:${identity}`)) >= MAX_PER_IDENTITY_PER_HOUR) {
      return { reason: "identity-rate" };
    }
    const network = networkOf(clientIp(event));
    if (network && (await bump(store, `net:${network}`)) >= MAX_PER_NETWORK_PER_HOUR) {
      return { reason: "network-rate" };
    }
    return null;
  } catch {
    return null;
  }
}

module.exports = { shouldDrop, identityOf, domainOf, networkOf, BLOCKED_DOMAINS };
