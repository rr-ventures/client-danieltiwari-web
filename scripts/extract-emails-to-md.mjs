// ONE-TIME migration: read the current BRANCH_A / BRANCH_B arrays out of
// netlify/lib/sequence.js and write one editable Markdown file per email under
// content/emails/<branch>/. After this, the .md files are the source of truth
// and scripts/build-emails.mjs bakes them back to netlify/lib/emails.generated.json.
// Run: node scripts/extract-emails-to-md.mjs
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { BRANCH_A, BRANCH_B } = require(join(root, "netlify/lib/sequence.js"));

function toMarkdown(email) {
  const fm = [
    "---",
    `day: ${email.day}`,
    `subject: ${JSON.stringify(email.subject)}`,
    `preview: ${JSON.stringify(email.preview)}`,
    "---",
  ].join("\n");
  // each body paragraph separated by a blank line; preserved verbatim
  return `${fm}\n\n${email.body.join("\n\n")}\n`;
}

async function writeBranch(branch, dir) {
  const out = join(root, "content/emails", dir);
  await mkdir(out, { recursive: true });
  let i = 0;
  for (const email of branch) {
    i += 1;
    const name = `${String(i).padStart(2, "0")}-day${email.day}.md`;
    await writeFile(join(out, name), toMarkdown(email), "utf8");
    console.log("wrote", join("content/emails", dir, name));
  }
}

await writeBranch(BRANCH_A, "branch-a");
await writeBranch(BRANCH_B, "branch-b");
console.log("done");
