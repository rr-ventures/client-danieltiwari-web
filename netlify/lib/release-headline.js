// Which line should HEAD the approval email when a deploy carries several commits.
//
// It used to take the NEWEST commit, so a deploy that rebuilt the whole assessment
// went out labelled "Keep local verification screenshots out of the repo" — the last
// tidy-up before the push (Reece, 2026-09-12). Housekeeping is almost always last,
// which makes newest the worst possible choice.
//
// Order: a merge commit's message, because it was written to describe the whole
// batch; then the first commit that is not housekeeping; then anything at all, so
// this never returns nothing.
//
// No dependencies on purpose, so it can be tested without a mail server or a store.
const CHORE = /^(chore|wip|tidy|cleanup|clean up|fixup|fix typo|lint|format|bump|merge branch|keep |remove .*(screenshot|artifact|cache)|ignore )/i;

function headlineFrom(commits) {
  const list = (commits || []).map((c) => ({
    subject: String(c.commit ? c.commit.message : "").split("\n")[0].trim(),
    message: String(c.commit ? c.commit.message : ""),
    merge: (c.parents || []).length > 1,
  })).filter((c) => c.subject);
  if (!list.length) return { headline: "", subjects: [] };

  const merge = list.find((c) => c.merge);
  const real = list.find((c) => !CHORE.test(c.subject));
  const pick = merge || real || list[0];
  return { headline: pick.message, subjects: list.map((c) => c.subject) };
}


// Daniel is not a developer, and a commit subject is written for one. Reece,
// 13 September 2026: "the error messages are so vague and unuseful that he has no
// idea what the changes are and I'm approving them."
//
// So whoever makes a change writes the plain-English version FOR HIM, in the
// commit message, like this:
//
//   For Daniel:
//   What changes: people open their results with a password now, not a code
//   Why it helps: nobody gets locked out waiting for a code to arrive
//   Risk: low, nothing else on the site is touched
//
// This pulls that block out of any commit in the release. If nobody wrote one,
// it returns null and the email says so plainly rather than pretending a commit
// subject is an explanation.
function plainEnglishFor(commits) {
  for (const c of commits || []) {
    const message = String(c && c.commit ? c.commit.message : c || "");
    const start = message.search(/^\s*for daniel\s*:?\s*$/im);
    if (start === -1) continue;
    const after = message.slice(start).split("\n").slice(1);
    const lines = [];
    for (const raw of after) {
      const line = raw.trim();
      if (!line) { if (lines.length) break; continue; }
      if (/^(co-authored-by|signed-off-by)/i.test(line)) break;
      if (/^for daniel\s*:?$/i.test(line)) continue;
      lines.push(line);
    }
    const field = (name) => {
      const hit = lines.find((l) => new RegExp(`^${name}\\s*:`, "i").test(l));
      return hit ? hit.replace(new RegExp(`^${name}\\s*:\\s*`, "i"), "").trim() : "";
    };
    const what = field("what changes") || field("what") || lines[0] || "";
    if (!what) continue;
    return { what, why: field("why it helps") || field("why"), risk: field("risk"), lines };
  }
  return null;
}

module.exports = { headlineFrom, CHORE, plainEnglishFor };
