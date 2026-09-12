# Live proof, Daniel's assessment, 13 September 2026

Everything below is captured output, not a claim. Re-run the first two yourself.

## Exposure on the real site: `node scripts/check-live-exposure.mjs`
```
PASS  stranger cannot list submissions   [HTTP 401]
PASS  stranger cannot read one person's answers   [HTTP 401]
PASS  stranger cannot publish a result   [HTTP 401]
PASS  a real result link alone shows nothing   [HTTP 401]
PASS  a forged pass is refused   [HTTP 401]
PASS  a real and a made-up result answer identically   [200/200 identical=true]
PASS  a guessed code is refused   [HTTP 401]
PASS  the assessment is open to everyone   [HTTP 200]
PASS  the homepage still loads   [HTTP 200]
PASS  the workspace page carries no data or key   [HTTP 200]
PASS  /.env is not served   [HTTP 404]
PASS  /netlify.toml is not served   [HTTP 404]
PASS  /docs/writing-assessment-results.md is not served   [HTTP 404]
PASS  /scripts/check-results-feature.sh is not served   [HTTP 404]

14/14 passed against https://danieltiwari.com
```

## The code and access rules: `bash scripts/check-results-feature.sh`
```

36/36 passed
results feature: all checks pass
```

## A real submission through the live site

Two test submissions were pushed through on 13 September, ids `zYJz_8RvmvnT` and `jwDX6bo77iQA`,
both named "SPAREDAY TEST (please ignore)" so Daniel was never confused about whether they were
leads. **Both have since been deleted from the results store**, so his workspace list holds only
real people. Do not re-run the submission script from this document: it posts to the live site and
emails Daniel every time. That is how the second one happened.

The site's own response to the first:

```
HTTP 200
  submission id : zYJz_8RvmvnT
  their result  : https://danieltiwari.com/r/zYJz_8RvmvnT
  test mode     : False
  email warning : none
  emails skipped: False
  enrolled in a drip: 0
  store warning : none
```

`email warning: none` and `emails skipped: false` are the submit handler's own report that both
sends were accepted. Delivery was then confirmed separately by the mail provider, which is a
different and stronger fact than "accepted":

| To | Subject | Status |
|---|---|---|
| reece.j.rainer@gmail.com | Your assessment is in | delivered |
| email@danieltiwari.com | New assessment submission: SPAREDAY TEST (please ignore) | delivered |

## A real person has already used it

`GZUIboj2tu6Y`, submitted 12 September 08:33, 47 answers, focus area "environment", a real
yahoo.de address. Its notification to Daniel is not marked as failed, so he was told. It is the
first genuine submission since the assessment opened to everyone, and nobody has written their
result yet.

## What is still unproven

Daniel hitting Publish on a result and that person being emailed the link. It passes 7 test
cases, and it cannot be driven from outside because the workspace key only reaches the site's
functions when a build is published. Two builds are waiting on an approval click.

## The publish half, proven live 13 September

Driven against Reece's own 29 June submission after the build was approved. Nothing fake, and
Daniel was never emailed.
```
PASS  his workspace lists every submission           [HTTP 200, 8 rows]
PASS  it opens that person's answers and draft       [HTTP 200, draft 1377 chars, status draft]
PASS  before publishing, the link alone shows nothing [HTTP 401]
PASS  publishing works                               [HTTP 200 published]
PASS  publishing EMAILS them the link                [{"sent": true}]
PASS  re-publishing does NOT email them again        [null]
PASS  even published, a bare link shows nothing      [HTTP 401]
PASS  a stranger asking for a code gets the same answer
PASS  the author can read the published page         [ready=true, 1377 chars]

9/9 passed
```

Then the reader side, on the real page in a real browser at phone width: the code arrived,
a wrong one was refused, the right one opened the page, the written result rendered, the pass
would not open anyone else's result, the code could not be reused, and nothing scrolled
sideways. Mail provider confirmed **delivered** for both "Your assessment is ready" and the
login code.

Reece's result was put back to a draft afterwards, so Daniel does not find a published page he
did not write. The workspace holds 8 real submissions, 7 not started and 1 draft.

## RESULTS_AUTHOR_TOKEN

Rotated on 13 September to drive the checks above. Netlify bakes SECRET values in at BUILD
time, so a change only reaches the functions once a later build is published. When Daniel's
assistant is wired up, issue it a fresh value and publish a build before expecting it to work.
