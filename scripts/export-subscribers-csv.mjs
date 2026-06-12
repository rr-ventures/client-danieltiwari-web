// Export all confirmed newsletter subscribers to a CSV on your Desktop.
// Run: BLOBS_SITE_ID=xxx BLOBS_TOKEN=xxx node scripts/export-subscribers-csv.mjs
//
// On Windows PowerShell:
//   $env:BLOBS_SITE_ID="xxx"; $env:BLOBS_TOKEN="xxx"; node scripts/export-subscribers-csv.mjs

import { getStore } from "@netlify/blobs";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const siteID = process.env.BLOBS_SITE_ID;
const token = process.env.BLOBS_TOKEN;

if (!siteID || !token) {
  console.error("Missing BLOBS_SITE_ID or BLOBS_TOKEN env vars.");
  process.exit(1);
}

const store = getStore({ name: "newsletter-subscribers", siteID, token });
const { blobs } = await store.list();

const rows = [];

for (const { key } of blobs) {
  if (key.startsWith("confirm:")) continue;
  const entry = await store.get(key, { type: "json" }).catch(() => null);
  if (!entry || !entry.email) continue;
  rows.push(entry);
}

// Sort by confirmedAt descending (most recent first), pending at the bottom
rows.sort((a, b) => {
  if (a.confirmedAt && b.confirmedAt) return b.confirmedAt.localeCompare(a.confirmedAt);
  if (a.confirmedAt) return -1;
  if (b.confirmedAt) return 1;
  return 0;
});

function escapeCsv(value) {
  const str = String(value ?? "");
  return str.includes(",") || str.includes('"') || str.includes("\n")
    ? `"${str.replace(/"/g, '""')}"`
    : str;
}

const headers = ["First Name", "Last Name", "Email", "Status", "Source", "Signed Up", "Confirmed"];
const lines = [
  headers.join(","),
  ...rows.map((r) => [
    r.firstName || "",
    r.lastName || "",
    r.email || "",
    r.status || "",
    r.source || "",
    r.createdAt ? r.createdAt.slice(0, 10) : "",
    r.confirmedAt ? r.confirmedAt.slice(0, 10) : "",
  ].map(escapeCsv).join(",")),
];

const timestamp = new Date().toISOString().slice(0, 10);
const filename = `newsletter-subscribers-${timestamp}.csv`;
const outPath = join(homedir(), "Desktop", filename);

writeFileSync(outPath, lines.join("\n"), "utf8");
console.log(`\nExported ${rows.length} subscribers to: ${outPath}`);
console.log(`  Confirmed: ${rows.filter((r) => r.status === "confirmed").length}`);
console.log(`  Pending:   ${rows.filter((r) => r.status === "pending").length}`);
