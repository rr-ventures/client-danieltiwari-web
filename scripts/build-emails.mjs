// Bake the editable Markdown email files (content/emails/<branch>/*.md) into
// netlify/lib/emails.generated.json, which sequence.js require()s at runtime
// (esbuild inlines the JSON into the function bundle — no build step needed).
//
//   node scripts/build-emails.mjs           # parse + validate + write JSON
//   node scripts/build-emails.mjs --check    # parse + validate, FAIL on drift, write nothing
//   node scripts/build-emails.mjs --verify    # also assert output deep-equals legacy sequence.js arrays
//
// The GitHub Action runs --check on PRs and commits the regenerated JSON on merge,
// so a content typo fails CI before it can reach the live funnel.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = join(root, "content/emails");
const OUT = join(root, "netlify/lib/emails.generated.json");

const ALLOWED_FIELDS = new Set(["{{first_name}}", "{{top_focus_area}}", "{{authenticity_stage}}"]);
const ALLOWED_TOKENS = new Set(["[MAP]", "[BOOK]"]);

const errors = [];

function parseFrontmatter(raw, file) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) { errors.push(`${file}: missing or malformed frontmatter`); return null; }
  const fm = {};
  for (const line of m[1].split("\n")) {
    if (!line.trim()) continue;
    const idx = line.indexOf(":");
    if (idx === -1) { errors.push(`${file}: bad frontmatter line "${line}"`); continue; }
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    try { val = JSON.parse(val); } catch { val = val.replace(/^["']|["']$/g, ""); } // lenient for hand edits
    fm[key] = val;
  }
  // body: split on blank lines, paragraphs preserved verbatim (trim only the block edges)
  const body = m[2].replace(/\s+$/, "").split(/\n{2,}/).map((p) => p.replace(/^\n+|\n+$/g, "")).filter((p) => p.length);
  return { fm, body };
}

function validateEmail(email, file) {
  if (email.day === undefined || email.day === "" || Number.isNaN(Number(email.day)))
    errors.push(`${file}: 'day' missing or not a number`);
  if (!email.subject) errors.push(`${file}: 'subject' missing`);
  if (!email.preview) errors.push(`${file}: 'preview' missing`);
  if (!email.body.length) errors.push(`${file}: empty body`);
  const text = [email.subject, email.preview, ...email.body].join("\n");
  for (const tok of text.match(/\{\{[^}]*\}\}/g) || [])
    if (!ALLOWED_FIELDS.has(tok)) errors.push(`${file}: unknown merge field ${tok} (allowed: ${[...ALLOWED_FIELDS].join(" ")})`);
  for (const line of email.body)
    if (/^\[[A-Z]+\]$/.test(line.trim()) && !ALLOWED_TOKENS.has(line.trim()))
      errors.push(`${file}: unknown token ${line.trim()} (allowed: ${[...ALLOWED_TOKENS].join(" ")})`);
}

async function loadBranch(dir) {
  const files = (await readdir(join(CONTENT, dir))).filter((f) => f.endsWith(".md")).sort();
  const out = [];
  for (const f of files) {
    const parsed = parseFrontmatter(await readFile(join(CONTENT, dir, f), "utf8"), `${dir}/${f}`);
    if (!parsed) continue;
    const email = { day: Number(parsed.fm.day), subject: parsed.fm.subject, preview: parsed.fm.preview, body: parsed.body };
    validateEmail(email, `${dir}/${f}`);
    out.push(email);
  }
  for (let i = 1; i < out.length; i += 1)
    if (out[i].day < out[i - 1].day) errors.push(`${dir}: emails out of day order at index ${i} (day ${out[i].day} after ${out[i - 1].day})`);
  return out;
}

const branchA = await loadBranch("branch-a");
const branchB = await loadBranch("branch-b");

if (errors.length) {
  console.error("EMAIL VALIDATION FAILED:\n  " + errors.join("\n  "));
  process.exit(1);
}

const baked = { branchA, branchB };
const json = JSON.stringify(baked, null, 2) + "\n";

if (process.argv.includes("--verify")) {
  const require = createRequire(import.meta.url);
  const { BRANCH_A, BRANCH_B } = require(join(root, "netlify/lib/sequence.js"));
  const strip = (arr) => arr.map((e) => ({ day: e.day, subject: e.subject, preview: e.preview, body: e.body }));
  const same = JSON.stringify(strip(BRANCH_A)) === JSON.stringify(branchA) && JSON.stringify(strip(BRANCH_B)) === JSON.stringify(branchB);
  console.log(same ? "VERIFY OK: baked .md is byte-identical to legacy sequence.js arrays" : "VERIFY FAILED: drift between .md and legacy arrays");
  if (!same) process.exit(1);
}

if (process.argv.includes("--check")) {
  let current = "";
  try { current = await readFile(OUT, "utf8"); } catch {}
  if (current !== json) { console.error(`CHECK FAILED: ${OUT} is stale — run: node scripts/build-emails.mjs`); process.exit(1); }
  console.log("CHECK OK: emails.generated.json is up to date");
} else {
  await writeFile(OUT, json, "utf8");
  console.log(`wrote ${OUT} (branchA: ${branchA.length}, branchB: ${branchB.length} emails)`);
}
