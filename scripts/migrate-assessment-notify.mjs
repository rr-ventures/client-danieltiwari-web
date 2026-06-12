// ONE-TIME migration: copy all entries from the assessment-notify blob store
// into newsletter-subscribers. Skips anyone already in the newsletter list.
// Run: BLOBS_SITE_ID=xxx BLOBS_TOKEN=xxx node scripts/migrate-assessment-notify.mjs
import { getStore } from "@netlify/blobs";

const siteID = process.env.BLOBS_SITE_ID;
const token = process.env.BLOBS_TOKEN;

if (!siteID || !token) {
  console.error("Missing BLOBS_SITE_ID or BLOBS_TOKEN env vars.");
  process.exit(1);
}

const notifyStore = getStore({ name: "assessment-notify", siteID, token });
const subscribersStore = getStore({ name: "newsletter-subscribers", siteID, token });

const { blobs } = await notifyStore.list();
console.log(`Found ${blobs.length} entries in assessment-notify.`);

let migrated = 0;
let skipped = 0;

for (const { key } of blobs) {
  const entry = await notifyStore.get(key, { type: "json" });
  if (!entry || !entry.email) { skipped++; continue; }

  const email = String(entry.email).trim().toLowerCase();
  const subscriberKey = encodeURIComponent(email);

  const existing = await subscribersStore.get(subscriberKey, { type: "json" }).catch(() => null);
  if (existing) {
    console.log(`  skip (already exists): ${email}`);
    skipped++;
    continue;
  }

  const nameParts = String(entry.name || "").trim().split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";
  const ts = entry.signedUpAt || new Date().toISOString();

  await subscribersStore.set(subscriberKey, JSON.stringify({
    email,
    firstName,
    lastName,
    source: "assessment-coming-soon",
    status: "confirmed",
    createdAt: ts,
    confirmedAt: ts,
    notifiedAt: null,
  }));

  console.log(`  migrated: ${email}`);
  migrated++;
}

console.log(`\nDone. Migrated: ${migrated}, Skipped: ${skipped}.`);
