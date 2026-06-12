// Approve / Reject links for the repo-wide change gate. The email sent by
// deploy-succeeded.js points here. All logic lives in ../lib/change-gate.js.
const { approve, reject } = require("../lib/change-gate");
const { escapeHtml } = require("../lib/telegram");

const page = (msg) =>
  `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:Georgia,serif;max-width:34rem;margin:16vh auto;padding:0 1.2rem;color:#15140f;line-height:1.6;text-align:center"><h1 style="font-weight:normal;font-size:1.4rem">danieltiwari.com</h1><p>${msg}</p></div>`;
const html = (body) => ({ statusCode: 200, headers: { "Content-Type": "text/html" }, body });

exports.handler = async (event) => {
  const qs = event.queryStringParameters || {};
  try {
    if (qs.reject) return html(page(await reject(qs.reject, qs.by)));
    if (qs.approve) {
      const r = await approve(qs.approve, qs.by);
      return html(page(r.msg));
    }
  } catch (err) {
    if (err.message === "STILL_BUILDING") return html(page("This change is still building on Netlify (~1–2 minutes). Please click Approve again shortly."));
    if (err.message === "NO_DEPLOY") return html(page("No matching build was found yet. If you just pushed, wait a minute and click Approve again."));
    return html(page(`Could not complete that: ${escapeHtml(err.message)}`));
  }
  return html(page("Nothing to do."));
};
