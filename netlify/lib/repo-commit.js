// Commit a multi-file changeset atomically via the GitHub Git Data API (one
// commit for the whole approved change), plus a compact line-diff renderer for
// the approval message. Used by the Telegram agent's approval flow.
const { gh, REPOS, splitRepoPath } = require("./github-edit");

// Commit one repo's files (paths here are repo-RELATIVE, no prefix).
async function commitToRepo(repo, items, message, branch = "main") {
  const ref = await gh("GET", `/repos/${repo}/git/ref/heads/${branch}`);
  const baseCommitSha = ref.object.sha;
  const baseCommit = await gh("GET", `/repos/${repo}/git/commits/${baseCommitSha}`);
  const baseTreeSha = baseCommit.tree.sha;

  const tree = [];
  for (const c of items) {
    if (c.after == null) {
      tree.push({ path: c.rel, mode: "100644", type: "blob", sha: null }); // delete
    } else {
      const blob = await gh("POST", `/repos/${repo}/git/blobs`, {
        content: Buffer.from(c.after, "utf8").toString("base64"), encoding: "base64",
      });
      tree.push({ path: c.rel, mode: "100644", type: "blob", sha: blob.sha });
    }
  }

  const newTree = await gh("POST", `/repos/${repo}/git/trees`, { base_tree: baseTreeSha, tree });
  const commit = await gh("POST", `/repos/${repo}/git/commits`, {
    message, tree: newTree.sha, parents: [baseCommitSha],
  });
  await gh("PATCH", `/repos/${repo}/git/refs/heads/${branch}`, { sha: commit.sha });
  return commit.sha;
}

// changes: [{ path (web/.. or db/..), before|null, after|null }]. Groups by repo
// and makes one commit per repo touched. Returns [{ key, repo, sha }].
async function commitChangeset(changes, message) {
  const groups = {};
  for (const c of changes) {
    const { key, repo, rel } = splitRepoPath(c.path);
    (groups[key] ||= { repo, items: [] }).items.push({ rel, after: c.after });
  }
  const results = [];
  for (const key of Object.keys(groups)) {
    const sha = await commitToRepo(groups[key].repo, groups[key].items, message);
    results.push({ key, repo: groups[key].repo, sha });
  }
  return results;
}

// Minimal LCS line diff -> array of "+ "/"- " lines (changed lines only).
function lineDiff(before, after, maxLines = 36) {
  const cap = 500;
  const a = String(before == null ? "" : before).split("\n").slice(0, cap);
  const b = String(after == null ? "" : after).split("\n").slice(0, cap);
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push("- " + a[i++]);
    else out.push("+ " + b[j++]);
  }
  while (i < n) out.push("- " + a[i++]);
  while (j < m) out.push("+ " + b[j++]);
  if (out.length <= maxLines) return out.join("\n");
  return out.slice(0, maxLines).join("\n") + `\n… (+${out.length - maxLines} more changed lines)`;
}

// A human-readable summary of a whole changeset for the approval message.
function describeChangeset(changes) {
  return changes.map((c) => {
    const kind = c.before == null ? "NEW FILE" : c.after == null ? "DELETED" : "edited";
    const diff = lineDiff(c.before, c.after);
    return `• ${c.path} (${kind})\n${diff}`;
  }).join("\n\n");
}

module.exports = { commitChangeset, lineDiff, describeChangeset };
