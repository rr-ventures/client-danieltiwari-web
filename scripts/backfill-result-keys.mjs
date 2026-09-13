// Gives every already-published result the lasting key the new flow needs.
//
// Without this, anyone holding a link from before 13 September 2026 would find
// their page asking for a key that does not exist. Safe to re-run: a result that
// already has one is left alone.
//
//   node scripts/backfill-result-keys.mjs           # report only
//   node scripts/backfill-result-keys.mjs --apply
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

const SITE = "d840f88f-717e-4b43-bc21-63522c048198";
const APPLY = process.argv.includes("--apply");
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const key = () => Array.from({ length: 3 }, () =>
  Array.from({ length: 4 }, () => ALPHABET[crypto.randomInt(0, ALPHABET.length)]).join("")).join("-");

const envs = await (await fetch(`https://api.netlify.com/api/v1/accounts/-/env?site_id=${SITE}`, {
  headers: { Authorization: `Bearer ${process.env.NETLIFY_API_KEY}` },
})).json();
const val = (k) => envs.find((e) => e.key === k)?.values?.[0]?.value;
const opts = { siteID: val("BLOBS_SITE_ID") || SITE, token: val("BLOBS_TOKEN") };
const pages = getStore({ name: "assessment-result-pages", ...opts });
const results = getStore({ name: "assessment-results", ...opts });

const { blobs } = await pages.list();
console.log(`written results: ${blobs.length}`);
for (const b of blobs) {
  const page = await pages.get(b.key, { type: "json" }).catch(() => null);
  if (!page) continue;
  const who = await results.get(b.key, { type: "json" }).catch(() => null);
  const email = who?.answers?.email || "?";
  if (page.accessKey) { console.log(`  ${b.key} | ${email} | already has a key: ${page.accessKey}`); continue; }
  const k = key();
  if (APPLY) await pages.setJSON(b.key, { ...page, accessKey: k });
  console.log(`  ${b.key} | ${email} | ${page.status} | ${APPLY ? "key set" : "would set"}: ${k}`);
}
if (!APPLY) console.log("\nReport only. Re-run with --apply.");
