// Who can read whose result, and who can write one. Run by check-results-feature.sh.
import { createRequire } from "node:module";
const a = createRequire(import.meta.url)("../netlify/lib/result-access.js");

const results = [];
const t = (name, cond) => results.push([name, Boolean(cond)]);

const vp = a.issueViewerPass("abc123");
t("viewer pass opens its own result", a.viewerOf(vp, "abc123"));
t("viewer pass refused on another result", !a.viewerOf(vp, "zzz999"));
t("tampered pass refused", !a.viewerOf(vp.slice(0, -1) + "X", "abc123"));
t("garbage refused", !a.viewerOf("nonsense", "abc123"));
t("empty pass refused", !a.viewerOf("", "abc123"));

const ap = a.issueAuthorPass();
t("author pass is not a viewer pass", !a.viewerOf(ap, "abc123"));
t("author pass recognised", a.isAuthor({ headers: { "x-result-pass": ap } }));
t("viewer cannot write", !a.isAuthor({ headers: { "x-result-pass": vp } }));
t("assistant bearer token recognised", a.isAuthor({ headers: { authorization: "Bearer tok123" } }));
t("wrong bearer refused", !a.isAuthor({ headers: { authorization: "Bearer nope" } }));
t("no credentials refused", !a.isAuthor({ headers: {} }));

const code = a.newCode();
const rec = a.codeRecord(code, "abc123");
t("code is six digits", /^[0-9]{6}$/.test(code));
t("code never stored in the clear", !JSON.stringify(rec).includes(code));
t("right code accepted", a.checkCode(rec, code, "abc123") === "ok");
t("wrong code rejected", a.checkCode(rec, "000001", "abc123") === "wrong");
t("code cannot be replayed on another result", a.checkCode(rec, code, "other1") === "wrong");
t("expired code rejected", a.checkCode({ ...rec, expiresAt: Date.now() - 1 }, code, "abc123") === "expired");
t("locks out after six tries", a.checkCode({ ...rec, attempts: 6 }, code, "abc123") === "locked");
t("missing code record rejected", a.checkCode(null, code, "abc123") === "expired");

t("cookie is HttpOnly and Secure", a.passCookie(vp, 30).includes("HttpOnly") && a.passCookie(vp, 30).includes("Secure"));
t("cookie reads back", a.passFromRequest({ headers: { cookie: "x=1; dt_result_pass=" + encodeURIComponent(vp) } }) === vp);

// Publishing must email them exactly once: on the way in, never on an edit.
t("first publish emails them", a.shouldNotify({ previous: null, next: "published" }) === true);
t("publishing a saved draft emails them", a.shouldNotify({ previous: { status: "draft" }, next: "published" }) === true);
t("editing an already-live page does not email again", a.shouldNotify({ previous: { status: "published" }, next: "published" }) === false);
t("saving a draft never emails", a.shouldNotify({ previous: { status: "draft" }, next: "draft" }) === false);
t("unpublishing never emails", a.shouldNotify({ previous: { status: "published" }, next: "draft" }) === false);
t("a quiet correction can mute it", a.shouldNotify({ previous: null, next: "published", notify: false }) === false);
t("re-publishing after an unpublish emails again", a.shouldNotify({ previous: { status: "draft" }, next: "published" }) === true);

// The approval email must never be headlined by the tidy-up commit that happened
// to be last. Reece, 2026-09-12: a whole assessment rebuild went out labelled
// "Keep local verification screenshots out of the repo".
const rel = createRequire(import.meta.url)("../netlify/lib/release-headline.js");
const commit = (subject, merge) => ({ commit: { message: subject }, parents: merge ? [1, 2] : [1] });

let r = rel.headlineFrom([commit("Assessment: hand-written results"), commit("Fix two defects"), commit("Keep local verification screenshots out of the repo")]);
t("housekeeping landing last no longer becomes the headline", r.headline === "Assessment: hand-written results");
t("every commit in the release is still listed", r.subjects.length === 3);

r = rel.headlineFrom([commit("Add a thing"), commit("Merge: the whole assessment rebuild", true), commit("chore: tidy")]);
t("a merge message wins, it describes the whole batch", r.headline === "Merge: the whole assessment rebuild");

r = rel.headlineFrom([commit("wip: poking"), commit("chore: lint")]);
t("an all-housekeeping release still gets a headline", r.headline === "wip: poking");

t("a single commit is left alone", rel.headlineFrom([commit("Rebuild the homepage")]).headline === "Rebuild the homepage");
t("no commits at all does not throw", rel.headlineFrom([]).headline === "");
t("'bump deps' counts as housekeeping", rel.CHORE.test("bump deps"));
t("a real change does not", !rel.CHORE.test("Open the assessment to everyone"));

for (const [name, pass] of results) console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
const passed = results.filter(([, p]) => p).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
