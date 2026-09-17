// Scheduled (daily) nurture drip — Model B.
//
// DISABLED (Daniel, 2026-09-17): the nurture sequence was torn out — every
// email under content/emails/* was deleted and he's rebuilding it from
// scratch. This is a hard stop so nothing can go out to a lead left over
// from before this was turned off. The real implementation (reads
// emails.generated.json via buildBranch, sends whatever is due per lead from
// the drip store) is in git history on this file — restore it once real
// content exists again.
//
// Schedule is configured in netlify.toml: [functions."nurture-drip"] schedule = "@daily".
exports.handler = async () => {
  return { statusCode: 200, body: JSON.stringify({ ok: true, disabled: true, processed: 0, sent: 0, completed: 0, warnings: [] }) };
};
