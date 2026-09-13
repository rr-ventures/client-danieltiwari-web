// Clears bot signups out of the newsletter subscriber store.
//
// Why this exists: on 2026-09-13 the store held 1,131 records and only about 111
// were ever confirmed. The rest were bots — gmail dot-variants, SMS gateways,
// throwaway domains — each of which had made the site send a confirmation email
// to a stranger. netlify/lib/signup-guard.js stops new ones; this clears the
// backlog and can be re-run any time.
//
// What it will NEVER delete: anyone confirmed, and anyone who signed up inside
// the grace window (they may still be about to click their link).
//
//   node scripts/clean-subscriber-spam.mjs            # report only, changes nothing
//   node scripts/clean-subscriber-spam.mjs --apply    # actually delete
//   node scripts/clean-subscriber-spam.mjs --apply --grace-days 14
//
// Needs NETLIFY_API_KEY in the environment (use the secret store, never a paste).
import { getStore } from "@netlify/blobs";

const SITE = "d840f88f-717e-4b43-bc21-63522c048198";
const APPLY = process.argv.includes("--apply");
const graceArg = process.argv.indexOf("--grace-days");
const GRACE_DAYS = graceArg > -1 ? Number(process.argv[graceArg + 1]) : 7;

const res = await fetch(`https://api.netlify.com/api/v1/accounts/-/env?site_id=${SITE}`, {
  headers: { Authorization: `Bearer ${process.env.NETLIFY_API_KEY}` },
});
if (!res.ok) { console.error(`Could not read the site settings (${res.status}).`); process.exit(1); }
const envs = await res.json();
const val = (k) => envs.find((e) => e.key === k)?.values?.[0]?.value || null;
const token = val("BLOBS_TOKEN");
if (!token) { console.error("BLOBS_TOKEN is not set on the site."); process.exit(1); }

const store = getStore({ name: "newsletter-subscribers", siteID: val("BLOBS_SITE_ID") || SITE, token });
const { blobs } = await store.list();

const cutoff = Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000;
const keep = [];
const drop = [];
let rateKeys = 0;

for (const { key } of blobs) {
  if (key.startsWith("rate:")) { rateKeys++; continue; } // the guard's own counters
  let rec = null;
  try { rec = await store.get(key, { type: "json" }); } catch { /* unreadable */ }
  const created = Date.parse(rec?.createdAt || "") || 0;
  const confirmed = Boolean(rec?.confirmedAt);
  const pendingToken = key.startsWith("confirm:");
  if (confirmed) { keep.push(key); continue; }
  if (created && created > cutoff) { keep.push(key); continue; }  // still in grace
  if (!created && !pendingToken) { keep.push(key); continue; }    // no date: leave alone
  drop.push({ key, email: rec?.email || "?", created: rec?.createdAt || "(no date)", pendingToken });
}

console.log(`subscriber store: ${blobs.length} records (${rateKeys} are rate counters)`);
console.log(`confirmed or inside the ${GRACE_DAYS}-day grace window, kept: ${keep.length}`);
console.log(`never confirmed and older than ${GRACE_DAYS} days, ${APPLY ? "deleting" : "would delete"}: ${drop.length}`);
console.log(`  of those, unused confirmation links: ${drop.filter((d) => d.pendingToken).length}`);
console.log("  sample:", drop.slice(0, 5).map((d) => d.email).join(", "));

if (!APPLY) { console.log("\nReport only. Re-run with --apply to delete."); process.exit(0); }

let done = 0, failed = 0;
for (const d of drop) {
  try { await store.delete(d.key); done++; } catch { failed++; }
}
console.log(`\ndeleted ${done}, failed ${failed}`);
const after = await store.list();
console.log(`store now holds ${after.blobs.length} records`);
