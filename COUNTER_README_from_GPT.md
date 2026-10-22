# Brooklyn Challenger survey counter — implementation handoff

Prepared October 22, 2026. This is counter infrastructure to integrate into the existing website, not a deployed survey or a replacement campaign site. No live respondent data has been accessed. Local synthetic-data tests cover the counting logic and proxy allow-list; Google deployment, real Sheet headers, browser rendering and network behavior still need staging verification.

## Recommended architecture

Private Google Form → private response Sheet → Apps Script scheduled aggregate → public JSON containing counts only → same-origin Netlify function → website.

Apps Script recomputes every five minutes and saves one aggregate snapshot in Script Properties. Public GET requests do not read the Sheet. Netlify caches its validated response for up to two minutes; the browser polls every three minutes while the page is visible. Advertise “updated periodically,” not instant/live to the second. Real-world delay may exceed five minutes due to scheduling, cache and polling.

The Netlify function avoids browser-to-Google CORS and authentication-redirect problems. It follows ContentService redirects server-side, validates the schema and returns an explicit allow-list. Its URL is /.netlify/functions/counter. Public responses include no email, name, row ID, individual timestamp, raw response, ZIP-by-opinion table or arbitrary query capability. The aggregate generatedAt timestamp is safe to show.

The response Sheet and Google Form response summaries must NOT be public. Do not publish raw CSV, even if the website claims to ignore personal columns. Do not expose API keys or OAuth credentials in browser code. The Apps Script URL need not be secret: it serves aggregates only. Never add JSONP or use fetch mode no-cors; an opaque response cannot supply a readable counter.

## Counting definitions (publish before launch)

- `participants`: earliest eligible, complete response per lowercased, trimmed email, in the collection window, with an allowed connection/opinion, a five-digit ZIP and nonblank activities. Email normalization does not strip dots or plus-address suffixes. This is email deduplication, not one-human verification.
- `supporters`: only participants answering Support or Strongly support. Do not say every participant “asked Parks for courts.” Signatures on a letter are a third metric requiring explicit consent; this code does not count signatures.
- `residentsSelfReported`: says “I live here” and supplies one of 11211, 11222, 11249, 11206, 11237. These are selected reporting ZIPs, NOT a CD1 boundary definition. The two partly overlapping ZIPs are not automatically treated as verified district residents. No resident status is verified by this code.
- `sportsVisitors`: chooses the exact sports-visitor option, regardless of ZIP. Tell residents to choose “I live here” first even if they also play sports. Other nonresidents choose their primary connection. One selection avoids overlapping audiences but does not capture every role a person has.
- `workStudy`, `otherVisitors`, `residenceNeedsReview`: remaining mutually exclusive categories. A self-described resident with a ZIP outside the list is retained in total responses, labeled for classification review, not recategorized as a visitor or discarded.
- `selectedZipParticipants`: a separate, overlapping marginal count of all unique participants with listed ZIPs; never add it to audience counts and never label it “CD1 residents.”
- `modes`: paper/online according to the earliest eligible response. This deduplicates across modes. Retain a private ledger of all paper entries and duplicates for the final report.
- Earliest eligible response wins to avoid silently overwriting an earlier answer with an unverified later email submission. For an authenticated correction/withdrawal, document it privately and mark the superseded row with an exclusion reason. Do not delete raw rows. Apply neutral, documented exclusion criteria equally to every viewpoint.

This design meets the brief's no-sign-in constraint, but does not verify email ownership. Multiple addresses, mistyped addresses, shared addresses and impersonation remain possible. If stronger identity assurance is required, add email confirmation before counting through a separate submission/verification workflow and disclose the additional step. Do not claim this code already provides it.

## Google Form and Sheet setup

1. Keep the Form and response Sheet access restricted to authorized organizers. Turn OFF participant access to response summaries. Use responder-entered email if Google sign-in is not wanted.
2. Configure ZIP validation as five digits and email as an email address. Require connection, opinion and activities. Q5 remains optional. Validate checkbox selections at most two for Q5. Put letter opt-in and conditional name in separate fields; never conflate signing with responding. Name fields are never read by this counter.
3. In the response Sheet, add administrator-only columns named `Collection mode` and `Exclude reason`, protect them from unauthorized editing, and keep those titles unique. Blank mode means online. For paper entries enter `paper`. Unknown modes cause the row to fail validation, rather than silently becoming online.
4. Transcribe paper forms before the closing deadline and mark their modes promptly, before the next aggregate refresh. During a bulk paper-entry session, pause the counter trigger and resume after classification. Preserve paper originals securely. If paper collected before closure must be entered later, extend this code with an audited collection-time field; do not alter Google submission timestamps or silently relax the cutoff. Non-email paper feedback may be collected separately but cannot be counted as email-deduplicated participants under this policy.
5. Open Extensions → Apps Script from the Sheet. Paste Code.gs. Set `CFG.sheet` and every `CFG.headers` value to the exact actual Sheet column title; do not rely on fuzzy matching. Change the answer strings too if you change the Form wording. The default strings reflect the supplied brief.
6. Project Settings → Script Properties: create `SPREADSHEET_ID` using the ID between /d/ and /edit in the response Sheet URL. Set project timezone to America/New_York. Date parsing uses real Sheet date cells. Do not replace timestamps with locale-dependent strings.
7. Run `rebuildCounter`, authorize access, and inspect PUBLIC_SNAPSHOT and PRIVATE_AUDIT in Script Properties. Before Oct 24, production-window entries correctly count as zero. For a staging test, use a separate Sheet/project with test window dates; never leave test dates in production.
8. Run `installCounterTrigger` once. It schedules the five-minute aggregation. Inspect Executions for errors and configure failure notifications. A missing header preserves the last snapshot and raises an error rather than publishing a zero.
9. Deploy → New deployment → Web app. Execute as Me; access Anyone (without sign-in). Use the deployed /exec URL, not /dev. Open it in a signed-out/private browser and verify only aggregate JSON is visible. If organizational policy prohibits public web apps, do not bypass it; use an approved server-side integration or a manually published aggregate JSON fallback.
10. When you edit deployed code, update the web-app deployment to the new version. Trigger runs use the project code; keep trigger and deployed endpoint behavior compatible.

## Website deployment

1. Move the current HTML site from the constrained artifact environment to Netlify. Use Git integration or the Netlify CLI so the function is deployed, not just a drag-and-drop static upload. The supplied netlify.toml assumes static assets in public/; merge paths with the actual project rather than overwriting its configuration blindly.
2. Put the campaign HTML at public/index.html and its assets in public/. Insert counter-snippet.html's section and styles into the page and place counter.js alongside it. Use the actual Google Form link in the page's existing CTA. This package has no invented form URL or fake respondent counts.
3. Add netlify/functions/counter.mjs. Set the server environment variable COUNTER_UPSTREAM to the Apps Script /exec URL, available to Functions. Redeploy.
4. The browser calls the same website origin; no permissive CORS headers are needed. Google ContentService redirects to googleusercontent.com; the server fetch follows that redirect. Do not send browser credentials to Google.
5. Keep a pinned, tested version of model-viewer and lazy-load the model after the survey CTA. Counter failure must not disable the survey or the rest of the page.
6. Test the endpoint signed out. Check desktop Safari/Chrome and iPhone Safari, loading/error states, disabled localStorage, and an unavailable upstream. A returning browser retains its last genuine aggregate with a visible timestamp; a first-time visitor sees “temporarily unavailable,” never an invented zero. Optional: deploy a dated genuine snapshot as a static fallback for first-time visitors, with its original timestamp and a stale label. No static snapshot is fabricated in this package.
7. The sample shows all totals from zero onward with the same policy. Do not hide low counts and reveal them only when favorable. A loading dash means unknown, not zero. If you decide to publish audited counts daily instead, establish that cadence before launch.

## Closure and report

Window: Oct 24, 2026 00:00 EDT to Nov 10, 2026 21:00 EST (exclusive). Note the DST change. Close the Form separately at the deadline; this code filters late rows but does not disable Form submissions. Use Google's supported scheduling option if available or assign a staff member to close it. Confirm deadline copy on all paper forms and pages.

On Nov 11 reconcile duplicates, documented exclusions, paper classifications and all five opinion categories. Export a private immutable audit and a public aggregate report. Run finalizeCounter only after that review. It freezes the public snapshot. If a later correction is needed, preserve the previous report and document the change before unfreezing FINALIZED.

Provide dates, instrument/version, sponsor, recruitment methods, N by collection mode and audience, counts of Support/Strongly support/No opinion/Oppose/Strongly oppose, resident support numerator and denominator, and exclusions/limitations. Do not claim a representative sample or comparative community size. An anonymized row-level CSV is not automatically safe: timestamps plus ZIP and uncommon answers can identify people. Offer aggregate tables with small-cell suppression where needed, not raw participant records. Letter signatures are shared only under their separate consent.

## Verification

Run `node test-counter.mjs`. Tests use synthetic data, not respondents. They verify duplicates/case/whitespace, first-response rule, opponent inclusion, partial-ZIP handling, connection partitions, source totals, invalid/excluded/late/future rows, leading-zero ZIP handling, schema failures, no email in output, proxy allow-list and cutoff status. Production Google authorization, triggers and browser deployment are not testable until connected and must not be represented as already tested.

## Primary implementation references

- Apps Script ContentService and redirects: https://developers.google.com/apps-script/guides/content
- Apps Script web-app deployment: https://developers.google.com/apps-script/guides/web
- Installable triggers: https://developers.google.com/apps-script/guides/triggers/installable
- Netlify Functions: https://docs.netlify.com/build/functions/overview/
- model-viewer camera controls: https://modelviewer.dev/examples/stagingandcameras/
