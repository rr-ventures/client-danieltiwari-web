// GitHub edit engine — the core of the Telegram editing feature.
// Resolves a friendly email id (e.g. "a3") to its content/emails/*.md file,
// reads it, applies a subject/preview/body change, and commits to a branch via
// the GitHub Contents API. No local clone needed. Used by the telegram-bot
// function; isolated here so it can be unit-tested without Telegram.
const REPO = process.env.GH_REPO || "rr-ventures/client-danieltiwari-web";
const API = "https://api.github.com";

function token() {
  const t = process.env.GITHUB_RW_PAT || process.env.GITHUB_TOKEN;
  if (!t) throw new Error("GITHUB_RW_PAT not set");
  return t;
}
function headers() {
  return { Authorization: `Bearer ${token()}`, Accept: "application/vnd.github+json", "User-Agent": "dan-funnel-bot" };
}
async function gh(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method, headers: { ...headers(), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GitHub ${method} ${path} -> ${res.status}: ${json.message || ""}`);
  return json;
}

function branchDir(id) {
  const m = String(id).trim().toLowerCase().match(/^([ab])(\d+)$/);
  if (!m) throw new Error(`bad email id "${id}" (use a1..a6 or b1..b7)`);
  return { dir: m[1] === "a" ? "branch-a" : "branch-b", index: Number(m[2]) };
}

// list the .md files for a branch (sorted) and pick the Nth
async function resolvePath(id) {
  const { dir, index } = branchDir(id);
  const items = await gh("GET", `/repos/${REPO}/contents/content/emails/${dir}`);
  const files = items.filter((i) => i.type === "file" && i.name.endsWith(".md")).map((i) => i.path).sort();
  if (index < 1 || index > files.length) throw new Error(`${id}: only ${files.length} emails in ${dir}`);
  return files[index - 1];
}

function parseMd(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const fm = {};
  if (m) {
    for (const line of m[1].split("\n")) {
      const i = line.indexOf(":");
      if (i === -1) continue;
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      try { v = JSON.parse(v); } catch { v = v.replace(/^["']|["']$/g, ""); }
      fm[k] = v;
    }
  }
  // strip the leading newline left by the frontmatter fence + trailing whitespace,
  // so serializeMd round-trips byte-identically (matches the extract format)
  const body = (m ? m[2] : raw).replace(/^\n+/, "").replace(/\s+$/, "");
  return { fm, body };
}
function serializeMd(fm, body) {
  return `---\nday: ${fm.day}\nsubject: ${JSON.stringify(fm.subject)}\npreview: ${JSON.stringify(fm.preview)}\n---\n\n${body.replace(/\s+$/, "")}\n`;
}

async function getEmail(id, ref) {
  const path = await resolvePath(id);
  const data = await gh("GET", `/repos/${REPO}/contents/${path}${ref ? `?ref=${ref}` : ""}`);
  const raw = Buffer.from(data.content, "base64").toString("utf8");
  return { path, sha: data.sha, raw, ...parseMd(raw) };
}

// field: "subject" | "preview" | "body". Returns {before, after, commit}.
async function applyEdit(id, field, value, opts = {}) {
  const branch = opts.branch || "main";
  const cur = await getEmail(id, branch);
  const fm = { ...cur.fm };
  let body = cur.body;
  if (field === "subject") fm.subject = value;
  else if (field === "preview") fm.preview = value;
  else if (field === "body") body = String(value);
  else throw new Error(`unknown field "${field}"`);
  const next = serializeMd(fm, body);
  if (next === cur.raw) return { unchanged: true, path: cur.path };
  const commit = await gh("PUT", `/repos/${REPO}/contents/${cur.path}`, {
    message: opts.message || `Edit ${id} ${field} via Telegram bot`,
    content: Buffer.from(next, "utf8").toString("base64"),
    sha: cur.sha,
    branch,
  });
  return {
    path: cur.path,
    before: field === "body" ? cur.body : cur.fm[field],
    after: field === "body" ? body : fm[field],
    commitSha: commit.commit?.sha,
  };
}

module.exports = { resolvePath, getEmail, applyEdit, parseMd, serializeMd, branchDir, gh, REPO };
