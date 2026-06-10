// The brain: a real Claude agent (Sonnet 4.6 via OpenRouter) that can read and
// edit the WHOLE danieltiwari.com repo in response to a plain-English message —
// "Claude Code over Telegram". It reads/writes files through the GitHub API and
// STAGES every change in memory; nothing is committed during the loop, so a human
// approves the full changeset before it lands (see telegram-agent-background.js).
//
// Model is pinned (AGENT_MODEL, default anthropic/claude-sonnet-4.6) so all spend
// on that model is cleanly attributable to this bot and billable to the client.
const { gh, REPOS, splitRepoPath } = require("./github-edit");

const MODEL = process.env.AGENT_MODEL || "anthropic/claude-sonnet-4.6";
const MAX_STEPS = Number(process.env.AGENT_MAX_STEPS || 30);
const MAX_FILE_BYTES = 600 * 1024;
const TOOL_RESULT_MAX = 700 * 1024; // must exceed MAX_FILE_BYTES so a full read isn't truncated

// Every path is prefixed with its repo: web/ = the website, db/ = the coaching DB.
const PATH_DESC = "repo-prefixed path, e.g. web/index.html or db/business_plan.md (must start with web/ or db/)";
const TOOLS = [
  { type: "function", function: {
    name: "list_dir",
    description: "List the files and sub-folders directly inside a directory in either repo. Use this to explore the db/ repo (it's large) before reading files.",
    parameters: { type: "object", properties: { path: { type: "string", description: "a directory, e.g. db/dan or web/content/emails" } }, required: ["path"] } } },
  { type: "function", function: {
    name: "read_file",
    description: "Read a UTF-8 text file at its current state on main (or your own staged version if you already edited it this turn).",
    parameters: { type: "object", properties: { path: { type: "string", description: PATH_DESC } }, required: ["path"] } } },
  { type: "function", function: {
    name: "edit_file",
    description: "PREFERRED way to change an existing file: replace one exact snippet with new text (like a find-and-replace). old_string must match the file EXACTLY (including whitespace) and be UNIQUE — include enough surrounding lines to make it unique. Use this for almost all edits; it's safe on large files. Staged, not committed.",
    parameters: { type: "object", properties: { path: { type: "string", description: PATH_DESC }, old_string: { type: "string", description: "exact existing text to replace (unique in the file)" }, new_string: { type: "string", description: "the replacement text" } }, required: ["path", "old_string", "new_string"] } } },
  { type: "function", function: {
    name: "write_file",
    description: "Create a NEW file, or fully overwrite a small file, with its complete contents. For changing part of an existing file, use edit_file instead. Staged, not committed.",
    parameters: { type: "object", properties: { path: { type: "string", description: PATH_DESC }, content: { type: "string", description: "the complete new file contents" } }, required: ["path", "content"] } } },
  { type: "function", function: {
    name: "delete_file",
    description: "Delete a file. Staged for approval, not committed.",
    parameters: { type: "object", properties: { path: { type: "string", description: PATH_DESC } }, required: ["path"] } } },
];

// Fetch both repos' file trees, each path prefixed with its repo key.
async function repoTrees() {
  const byKey = {};
  const all = [];
  for (const key of Object.keys(REPOS)) {
    const t = await gh("GET", `/repos/${REPOS[key]}/git/trees/main?recursive=1`);
    const paths = (t.tree || [])
      .filter((n) => n.type === "blob")
      .map((n) => n.path)
      .filter((p) => !p.startsWith("node_modules/"));
    byKey[key] = paths;
    for (const p of paths) all.push(`${key}/${p}`);
  }
  return { byKey, all };
}

// entries directly under a prefixed directory, from the in-memory tree
function listDir(all, dir) {
  const base = String(dir || "").replace(/\/+$/, "");
  const prefix = base ? base + "/" : "";
  const out = new Set();
  for (const p of all) {
    if (prefix && !p.startsWith(prefix)) continue;
    const rest = p.slice(prefix.length);
    if (!rest) continue;
    const seg = rest.split("/")[0];
    out.add(rest.includes("/") ? seg + "/" : seg);
  }
  return [...out].sort();
}

// Reece's hard rule: no em/en dashes in copy (reads as an AI tell). Models ignore
// the instruction often, so enforce it deterministically on anything written —
// replace a dash used as punctuation with a comma, but keep numeric ranges (9–5).
function deDash(s) {
  return String(s)
    .replace(/\s*[—–]\s*/g, (m, off, str) => {
      const before = str[off - 1] || "", after = str[off + m.length] || "";
      if (/\d/.test(before) && /\d/.test(after)) return m; // keep "9–5"
      return ", ";
    })
    .replace(/ ?, ?, ?/g, ", ")
    .replace(/\s+,/g, ",");
}

async function readFromMain(path) {
  const { repo, rel } = splitRepoPath(path);
  const data = await gh("GET", `/repos/${repo}/contents/${rel.split("/").map(encodeURIComponent).join("/")}`);
  if (Array.isArray(data)) throw new Error(`${path} is a directory, not a file`);
  if (data.size > MAX_FILE_BYTES) throw new Error(`${path} is too large to read (${data.size} bytes)`);
  return { content: Buffer.from(data.content, "base64").toString("utf8"), sha: data.sha };
}

async function chat(messages) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not set");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://danieltiwari.com",
      "X-Title": "Dan Funnel Agent",
    },
    body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, tool_choice: "auto", temperature: 0.2, max_tokens: 4000 }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(j.error && j.error.message) || JSON.stringify(j).slice(0, 300)}`);
  return j;
}

const SYSTEM = (listing) => `You are Daniel Tiwari's personal agent. Dan (the coach) or Reece (his agency) message you in plain English; you make the change across his TWO repositories. EVERY path you use must start with a repo prefix:

- web/  = client-danieltiwari-web — Dan's public coaching WEBSITE + email funnel. Editing it and getting it approved DEPLOYS to danieltiwari.com.
- db/   = product-dancoaching-db — Dan's PRIVATE coaching-business repo: business_plan.md, his strategy and content and session notes (db/dan/), mentor synthesis (db/dan/mentors/), and Reece's consultant context (db/reece/). It is NOT a website — commits just version it, nothing deploys.

If a request could touch either repo and it's not obvious, ASK which. Rule of thumb: anything about the website, a page, the funnel, or emails => web/. Anything about the business plan, strategy, positioning, offer, content ideas, notes, or research => db/.

ABOUT DAN — apply this whenever you write or edit his copy or content:
Dan coaches high-performing people stuck in identity and belief patterns that more discipline, information, or strategy won't fix. Closest reference point: Peter Crone — high-depth, high-status, relationship-first. He is a clarifier, not a salesperson; the entry point is a private diagnostic conversation, not a sales call; the offer is a 6-month private container, 8–10 clients. His writing is calm, unhurried, personal, and mechanism-level — it names the non-obvious thing underneath the obvious one. He despises generic mainstream coaching language, hype, filler, exclamation-mark energy, and being treated like a content machine. So his copy: substance first, no clichés, no hype, measured and personal, high-status restraint. NEVER use em dashes in copy.

YOUR OWN REPLY STYLE (how you talk back in Telegram):
- Succinct: one or two sentences. No preamble, no narrating your steps.
- Extremely clear about exactly what you did or are about to do, and which file (with its web/ or db/ prefix) it touches.
- Calm, grounded, lightly warm — a voice adjacent to Dan's, but you are his assistant, not Dan. Never write as if you are him.
- If anything is ambiguous or risky, make NO edits and say plainly what you need.

web/ — BUILD & PUBLISH (so a website change actually goes live):
- The live site is built from the repo ROOT into dist/ by scripts/build-static-site.mjs on every deploy. Every top-level *.html page publishes automatically, so creating web/services.html just works. If you add a NEW non-HTML asset (a .js, .css, image, or folder), you MUST also add its filename to the assetEntries list in web/scripts/build-static-site.mjs or it won't publish.
- Email funnel copy is web/content/emails/*.md (frontmatter: day, subject, preview; body supports **bold**, {{first_name}}/{{top_focus_area}}/{{authenticity_stage}} merge fields, [MAP]/[BOOK] tokens). Edit the .md, never the generated JSON.

db/ — CONVENTIONS:
- Dan's own work goes under db/dan/, Reece's consultant context under db/reece/, locked business state in db/business_plan.md.
- NEVER put secrets, credentials, API keys, or raw chat exports into db/. Summarise sensitive context instead.

HOW YOU WORK:
- Read before you write. Make the SMALLEST change that fully satisfies the request. Preserve surrounding structure, formatting, and voice.
- Never touch secrets, tokens, .env files, anything under web/.netlify, or your own machinery (web/netlify/functions/telegram-*.js, web/netlify/lib/repo-agent.js, repo-commit.js, telegram.js, github-edit.js).
- Do not invent content the user didn't ask for.
- Finish with ONE plain-English sentence stating exactly what you changed and in which repo (no code, no file dumps). A non-technical person reads it to approve.

Files (web/ shown in full; db/ top-level only — use list_dir to explore db/ folders):
${listing}`;

function progressLine(name, path) {
  const p = path ? ` <code>${path}</code>` : "";
  switch (name) {
    case "list_dir": return `🔎 Looking in${p}`;
    case "read_file": return `📖 Reading${p}`;
    case "edit_file": return `✏️ Editing${p}`;
    case "write_file": return `🆕 Writing${p}`;
    case "delete_file": return `🗑️ Removing${p}`;
    default: return `… working${p}`;
  }
}

// Runs the agent for one user message. Returns { reply, changes }.
// changes: [{ path, before|null, after|null }] — staged, not committed.
// onProgress(line) is called before each tool action so the caller can stream
// "what it's doing now" to the user instead of going silent for minutes.
async function runAgent({ text, history, onProgress }) {
  let progressCount = 0;
  const trees = await repoTrees();
  const webList = trees.byKey.web.map((p) => `web/${p}`).join("\n");
  const dbTop = listDir(trees.all, "db").map((e) => `db/${e}`).join("\n");
  const listing = `${webList}\n\n[db/ top-level — use list_dir to go deeper]\n${dbTop}`;
  const staged = new Map();   // prefixed path -> { content } | { deleted:true }
  const original = new Map(); // prefixed path -> { content, sha }

  async function capture(path) {
    if (original.has(path) || staged.has(path)) return;
    try { original.set(path, await readFromMain(path)); } catch { /* new file */ }
  }
  async function current(path) {
    if (staged.has(path)) { const s = staged.get(path); return s.deleted ? null : s.content; }
    try { const r = await readFromMain(path); if (!original.has(path)) original.set(path, r); return r.content; }
    catch { return null; }
  }

  const messages = [
    { role: "system", content: SYSTEM(listing) },
    ...(Array.isArray(history) ? history : []),
    { role: "user", content: text },
  ];

  for (let step = 0; step < MAX_STEPS; step++) {
    const resp = await chat(messages);
    const m = resp.choices[0].message;
    messages.push(m);

    if (m.tool_calls && m.tool_calls.length) {
      for (const tc of m.tool_calls) {
        let result;
        try {
          const args = JSON.parse(tc.function.arguments || "{}");
          const name = tc.function.name;
          if (onProgress && progressCount < 20) {
            progressCount++;
            try { await onProgress(progressLine(name, args.path)); } catch { /* progress is best-effort */ }
          }
          if (name === "list_dir") {
            const base = String(args.path || "").replace(/\/+$/, "");
            const entries = listDir(trees.all, base);
            result = entries.length ? entries.map((e) => `${base}/${e}`).join("\n") : `(empty or not found: ${args.path})`;
          } else if (name === "read_file") {
            const c = await current(args.path);
            result = c == null ? `ERROR: ${args.path} not found` : c;
          } else if (name === "edit_file") {
            const cur = await current(args.path);
            if (cur == null) {
              result = `ERROR: ${args.path} not found. Use write_file to create a new file.`;
            } else {
              const oldS = String(args.old_string);
              const n = oldS ? cur.split(oldS).length - 1 : 0;
              if (n === 0) result = `ERROR: old_string not found in ${args.path}. read_file and copy the exact text (including whitespace).`;
              else if (n > 1) result = `ERROR: old_string appears ${n} times in ${args.path}. Add more surrounding lines so it is unique.`;
              else {
                await capture(args.path);
                // de-dash only the inserted text, so edits stay minimal and don't
                // rewrite unrelated pre-existing content elsewhere in the file.
                staged.set(args.path, { content: cur.replace(oldS, deDash(String(args.new_string))) });
                result = `OK, staged edit to ${args.path}.`;
              }
            }
          } else if (name === "write_file") {
            await capture(args.path);
            const content = deDash(String(args.content));
            staged.set(args.path, { content });
            result = `OK, staged write to ${args.path} (${content.length} chars).`;
          } else if (name === "delete_file") {
            await capture(args.path);
            staged.set(args.path, { deleted: true });
            result = `OK — staged delete of ${args.path}.`;
          } else {
            result = `ERROR: unknown tool ${name}`;
          }
        } catch (e) {
          result = `ERROR: ${e.message}`;
        }
        messages.push({ role: "tool", tool_call_id: tc.id, content: String(result).slice(0, TOOL_RESULT_MAX) });
      }
      continue;
    }

    const changes = [];
    for (const [path, s] of staged) {
      const orig = original.get(path);
      const before = orig ? orig.content : null;
      const after = s.deleted ? null : s.content;
      if (before === after) continue; // no-op edit
      changes.push({ path, before, after });
    }
    return { reply: (m.content || "Done.").trim(), changes };
  }
  return { reply: "I had to stop — that request needed too many steps. Try something more specific.", changes: [] };
}

module.exports = { runAgent, MODEL };
