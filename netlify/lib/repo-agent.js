// The brain: a real Claude agent (Sonnet 4.6 via OpenRouter) that can read and
// edit the WHOLE danieltiwari.com repo in response to a plain-English message —
// "Claude Code over Telegram". It reads/writes files through the GitHub API and
// STAGES every change in memory; nothing is committed during the loop, so a human
// approves the full changeset before it lands (see telegram-agent-background.js).
//
// Model is pinned (AGENT_MODEL, default anthropic/claude-sonnet-4.6) so all spend
// on that model is cleanly attributable to this bot and billable to the client.
const { gh, REPO } = require("./github-edit");

const MODEL = process.env.AGENT_MODEL || "anthropic/claude-sonnet-4.6";
const MAX_STEPS = Number(process.env.AGENT_MAX_STEPS || 30);
const MAX_FILE_BYTES = 220 * 1024;

const TOOLS = [
  { type: "function", function: {
    name: "read_file",
    description: "Read a UTF-8 text file from the repo at its current state on main (or your own staged version if you already edited it this turn).",
    parameters: { type: "object", properties: { path: { type: "string", description: "repo-relative path, e.g. content/emails/branch-a/01-welcome.md" } }, required: ["path"] } } },
  { type: "function", function: {
    name: "write_file",
    description: "Create or overwrite a text file with its FULL new contents. The change is staged for approval, not committed. Always read_file first unless creating a brand-new file.",
    parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string", description: "the complete new file contents" } }, required: ["path", "content"] } } },
  { type: "function", function: {
    name: "delete_file",
    description: "Delete a file. Staged for approval, not committed.",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
];

async function repoTree() {
  const t = await gh("GET", `/repos/${REPO}/git/trees/main?recursive=1`);
  return (t.tree || [])
    .filter((n) => n.type === "blob")
    .map((n) => n.path)
    .filter((p) => !p.startsWith("node_modules/"));
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
  const data = await gh("GET", `/repos/${REPO}/contents/${path.split("/").map(encodeURIComponent).join("/")}`);
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

const SYSTEM = (files) => `You are the site agent for danieltiwari.com — Daniel Tiwari's coaching website and its email funnel. Dan (the coach) or Reece (his agency) message you in plain English; you make the change to the repository.

ABOUT DAN — apply this whenever you write or edit his copy:
Dan coaches high-performing people stuck in identity and belief patterns that more discipline, information, or strategy won't fix. Closest reference point: Peter Crone — high-depth, high-status, relationship-first. He is a clarifier, not a salesperson; the entry point is a private diagnostic conversation, not a sales call; the offer is a 6-month private container, 8–10 clients. His writing is calm, unhurried, personal, and mechanism-level — it names the non-obvious thing underneath the obvious one. He despises generic mainstream coaching language, hype, filler, exclamation-mark energy, and being treated like a content machine. So his copy: substance first, no clichés, no hype, measured and personal, high-status restraint. NEVER use em dashes in copy.

YOUR OWN REPLY STYLE (how you talk back in Telegram):
- Succinct: one or two sentences. No preamble, no narrating your steps.
- Extremely clear about exactly what you did or are about to do, and which file or page it touches.
- Calm, grounded, lightly warm — a voice adjacent to Dan's, but you are his assistant, not Dan. Never write as if you are him.
- If anything is ambiguous or risky, make NO edits and say plainly what you need.

REPO: ${REPO} (deploys to danieltiwari.com via Netlify on every commit to main).
Key areas:
- content/emails/branch-a/*.md and content/emails/branch-b/*.md — the nurture email funnel copy (Markdown frontmatter: day, subject, preview). Branch A = diagnostic/high-fit leads, Branch B = nurture/everyone else. Body supports **bold**, {{first_name}} / {{top_focus_area}} / {{authenticity_stage}} merge fields, and [MAP] / [BOOK] link tokens.
- Everything else is the website (pages, components, styles, Netlify functions).

HOW YOU WORK:
- Read before you write. Make the SMALLEST change that fully satisfies the request. Preserve surrounding structure, formatting, and voice.
- Never touch secrets, tokens, .env files, anything under .netlify, or your own machinery (netlify/functions/telegram-*.js, netlify/lib/repo-agent.js, repo-commit.js, telegram.js).
- Do not invent content the user didn't ask for.
- Finish with ONE plain-English sentence stating exactly what you changed (no code, no file dumps). A non-technical person reads it to approve.

Current repo files:
${files.join("\n")}`;

// Runs the agent for one user message. Returns { reply, changes, assistantSummary }.
// changes: [{ path, before|null, after|null }] — staged, not committed.
async function runAgent({ text, history }) {
  const files = await repoTree();
  const staged = new Map();   // path -> { content } | { deleted:true }
  const original = new Map(); // path -> { content, sha }

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
    { role: "system", content: SYSTEM(files) },
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
          if (name === "read_file") {
            const c = await current(args.path);
            result = c == null ? `ERROR: ${args.path} not found` : c;
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
        messages.push({ role: "tool", tool_call_id: tc.id, content: String(result).slice(0, 14000) });
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
