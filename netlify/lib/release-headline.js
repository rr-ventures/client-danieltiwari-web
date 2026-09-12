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


module.exports = { headlineFrom, CHORE };
