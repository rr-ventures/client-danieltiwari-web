#!/usr/bin/env bash
# Proof that the hand-written-results feature is intact: every function parses,
# the access rules hold under forgery/reuse/expiry, and the pages ship.
set -euo pipefail
cd "$(dirname "$0")/.."
for f in netlify/functions/result-login.js netlify/functions/result-admin.js \
         netlify/functions/result-data.js netlify/functions/assessment-submit.js \
         netlify/functions/telegram-agent-background.js netlify/lib/result-access.js \
         netlify/lib/release-headline.js netlify/lib/change-gate.js netlify/lib/blobs.js; do
  node --check "$f"
done
RESULT_PASS_SECRET=testsecret RESULTS_AUTHOR_TOKEN=tok123 node scripts/test-result-access.mjs
npm run build >/dev/null
test -f dist/results-admin.html
test -f dist/result.html
echo "results feature: all checks pass"
