# Decisions

### 2026-08-15 — Phase 4: browser verification with Playwright, caught and fixed a real MOCK_MODE price mismatch
Context: the Inspector's on-screen rendering hadn't been verified since the original build session
(a throwaway Playwright pass, not part of the repo). Needed to actually drive the UI, not re-read
the code — Phase 1's own AI note already flagged that reading the code wasn't enough to catch the
204-body bug in the original build.
Choice: throwaway Playwright scripts (`npm install --no-save playwright` in the scratchpad only —
not added to the project's `package.json`, consistent with CLAUDE.md's "no unused dependencies in
the final state"), driving the real dev server via Chromium. Covered: US market opt-in end to end
including the cancellation flow, CA market decline, a market/quantity combination with no
recorded MOCK_MODE fixture (GB × qty 3), a market/quantity combination that *does* have one (US ×
qty 3), and — separately, with `.env` temporarily pointed at a broken host (backed up first,
restored and `diff`-verified after, same discipline as Phase 1) — the unreachable-host and
timeout failure paths from Phase 1. Checked `console --errors` after every run: none, across all
of it.
**Found a real bug this way, not by re-reading Phase 2's code**: confirming any plan in
MOCK_MODE showed the one static `confirm-offer.json` fixture's price ($1321.95) regardless of
which plan/market was actually offered and selected — visible in a screenshot as "Protection
confirmed... US$1321.95" immediately under an offer that had shown $585.85. This is the exact
market/quantity contradiction Phase 2 fixed for Create Offer, one step later in the flow, that
Phase 2 didn't catch because it never drove the actual confirm step against a Phase-2-selected
offer. Fixed: `findMarketProductById` (`server/src/fixtures.ts`) searches every recorded market
fixture for the product id being confirmed and `mockedConfirmOffer`
(`server/src/xcoverClient.ts`) overrides just the price/currency fields on the static booking
template with the matched product's real recorded price — re-verified via the same Playwright
script afterward, screenshot now shows the correct $585.85. Left the nested `tax`/`total_premium`/
`commission` breakdown fields as the static fixture's original (now slightly inconsistent)
figures rather than recomputing them proportionally — recalculating a tax breakdown from a price
would cross into "reimplementing rating logic," which Phase 2's own brief explicitly ruled out;
noted here as a stated, deliberate residual limitation rather than left silent.
Did not browser-test the malformed-body/500 failure paths from Phase 1 specifically — those were
verified server-side with curl in Phase 1, and the frontend's rendering code doesn't branch by
failure *cause*, only by `networkError` vs `status >= 400` (already exercised by every 4xx
captured throughout this project) vs a thrown exception (exercised by the unreachable-host
browser test) — a third browser round-trip through the identical rendering branch wouldn't add
information, so time went to the DNS-failure and timeout paths instead, which are genuinely
distinct UX (the 10s wait, the loading-state-stays-disabled behavior) and hadn't been visually
confirmed before.
Alternatives rejected: adding `@playwright/test` as a real devDependency — rejected, this is
verification tooling for this session, not a test suite CLAUDE.md asked for (the one required
unit test, the HMAC vector, already exists); a committed E2E suite would be a legitimate future
addition but is scope beyond what was asked here.
AI note: the confirm-offer price bug is a good example of a defect that only exists at the
*integration* of two otherwise-correct pieces (Phase 2's market-aware Create Offer, the
untouched static Confirm Offer) — neither Phase 2's own testing (curl against Create Offer in
isolation) nor a code read of either file in isolation would surface it, only actually clicking
through Create Offer -> select a plan -> confirm and looking at the resulting screen.

### 2026-08-15 — Phase 3: resolved x-idempotency-key and the two-step cancellation flow, live; ported both to Postman; app not rewired
Context: two carried-over questions from the brief. (1) The double-confirm 422 finding (Session
1.5) was observed *without* an idempotency key — docs describe different behavior with one
(`offers/api/idempotency-keys.md`: 409 returning a cached original result, 423 while still
processing, 48h retention) that was never tested. (2) The Postman collection's Cancel (Confirm)
posts to `/cancel` again rather than the documented two-step
`bookings/{id}/confirm_cancellation/{cancellation_id}/`.
Choice: tested both live before writing anything. `x-idempotency-key`: confirmed a repeat
confirm with the identical key+body returns `409` with the *same* booking in the body (not a new
one), matching the docs exactly (`fixtures/probe/idempotency-key-first.json`,
`idempotency-key-repeat.json`); `423` (the documented concurrent-race case) wasn't reproduced —
the two calls were sequential, not concurrent, and reproducing a genuine race deliberately felt
like more engineering than the question warranted, so it's logged as documented-not-tested in
`docs/API-NOTES.md` rather than asserted. `confirm_cancellation`: confirmed the documented
two-step flow works end-to-end on this account — `preview:true` has *always* returned a real
`cancellation_id` in every capture this project has made (including the original Session 1.5
probe, not previously followed up on), and calling `confirm_cancellation` with it actually
finalizes the cancellation with real refund figures (`fixtures/probe/cancel-twostep-preview.json`,
`cancel-twostep-confirm.json`). Also verified `include_content`/`extra_fields` (documented query
params, not body fields) live — `extra_fields=tax,commission,benefits,surcharge` is the only way
`commission.total_amount` comes back non-null in any capture in this repo
(`fixtures/probe/extra-fields-test.json`), relevant to the settlement out-of-scope item in
`docs/ARCHITECTURE.md`. Ported all four (idempotency key, two-step cancel, extra_fields,
include_content) into `postman/xcover-realcheap.postman_collection.json` as new folders, plus a
Runner-drivable market-matrix request (`postman/market-matrix.postman_data.json`, 7 markets + 1
quantity variant) — verified every new request via Newman against live, not just written and
assumed correct (folder 4: 2/2 pass; folder 5: 2/2 pass, one live 429 hit and retried
successfully as part of verification, not a flake worked around; folder 6: 16/16 pass across 8
Runner iterations).
**Deliberately did not rewire the app** to use either mechanism, even though both are the "more
correct" documented behavior. The top-level brief for this session is explicit: "Do not rebuild
anything that works. Do not restructure the codebase." Both of `App.tsx`'s current mechanisms
(the 422-with-booking-ID double-confirm guard, the single-call `preview:false` cancel) are
demonstrated working against live and already covered by Phase 1's error-surfacing work — neither
is broken, so touching them would be scope creep against an explicit instruction, not hardening.
Recorded here per the brief's own instruction to record deliberate non-fixes with reasoning
rather than just doing them silently.
Alternatives rejected: reproducing the `423` race condition with concurrent requests — would
need real parallelism (e.g. `Promise.all` with two truly simultaneous calls) for a documented
edge case that doesn't affect this build either way; not worth the added live-API load for a
fact that's already stated plainly enough in the docs to trust without independent verification,
unlike the SHA-512/SHA-256 and `context`-schema ambiguities which *did* warrant empirical
resolution because guessing wrong there would have silently broken the whole integration.
AI note: capturing the `extra_fields` test surfaced that `commission.total_amount` had been
`null` in literally every prior capture in this repo (all of Session 1.5's fixtures, the
original build fixtures) — not a bug, just a query param nobody had passed, caught by trying it
rather than by re-reading old fixtures and wondering why the field was always null.

### 2026-08-15 — Phase 2: MOCK_MODE fixture selection by market/quantity, replacing the single static fixture
Context: the original `fixtures/create-offer.json` was one static capture, always returned
regardless of request — a known, previously-documented limitation (2026-08-13 web-checkout
entry). In a fallback demo (sandbox down, forced into MOCK_MODE live) that becomes a visible
contradiction: switching markets in the UI would change the *request* shown in the Inspector but
never the *response*, always showing identical USD pricing.
Choice: promoted the Session 1.5 probe's 7 real market captures
(`fixtures/probe/market-{CC}.json`) into `fixtures/markets/create-offer-{CC}.json`, trimmed to
just the response body, plus one fresh live quantity variant
(`create-offer-US-qty3.json`) captured for this phase specifically rather than reusing the
2-day-old Session 1.5 numbers — pricing had already been observed to drift over time for
identical inputs (`docs/SANDBOX-CAPABILITIES.md` Probe 3), so a fresh capture is a more honest
"this is what MOCK_MODE shows" than a stale one. `xcoverClient.ts`'s new `mockedCreateOffer`
selects by `${country}` or `${country}-qty${quantity}`, reading the fixture directory live via
`listFixtureKeys` rather than hardcoding the list (can't drift from what's actually on disk).
Deleted the now-dead `fixtures/create-offer.json` and its one call site — CLAUDE.md's "no dead
code" applies to fixtures the same as source.
This is still "recording captured traffic," not a rating engine, per the brief's explicit
instruction — 8 fixed files, no interpolation or estimation between them. A request for any
other market/quantity combination gets an honest `capture.mockNote` explaining exactly what's
missing and what *is* recorded, and `offer: null` rather than a fabricated price — the frontend
routes this through the same fail-open path Phase 1 built (`decision: "unprotected"` /
"Continue without protection"), which already existed for a very similar situation (offer
unavailable), so no new UI branch was needed, just a new reason to reach the existing one.
Alternatives rejected: interpolating between recorded quantities/markets to approximate a
missing combination — explicitly what the brief warns against ("do not build a rating engine"),
and CLAUDE.md hard constraint 2 (never invent) applies just as much to a fabricated price as an
invented field name. Silently falling back to the nearest recorded fixture — rejected because
that's exactly the "serve a wrong one" the brief says not to do; a demoer who doesn't notice the
mockNote could present a fabricated price as real.
AI note: capturing the fresh qty=3 fixture surfaced a new, unprompted finding: at quantity 1,
every market except Italy prices its 2-year plan above its 3-year plan (Probe 3); at quantity 3
in the US specifically, that ordering flips too (2yr $1139.94 < 3yr $1244.48, vs 2yr $585.85 >
3yr $532.29 at quantity 1). Not investigated further — same reasoning as the Italy anomaly, and
explicitly out of scope to reverse-engineer XCover's rating curve — but logged in
`docs/OPEN-QUESTIONS.md` #5 rather than left as a number nobody would notice.

### 2026-08-15 — Phase 1 hardening: fail-open error handling, after confirming the process actually crashed
Context: Session 2's brief opened by asserting "a network failure to XCover currently kills the
Node process" — rather than take that on faith, reproduced it first: `MOCK_MODE=false` with
`XCOVER_API_DOMAIN` pointed at an unresolvable host, hit `/api/offers`. Server log showed an
uncaught `TypeError: fetch failed` and the process died; the client got a connection reset, not
an HTTP error. Confirmed the premise before writing any fix.
Choice: three-layer fix, one per failure class (`docs/ARCHITECTURE.md` "Failure handling" has the
full breakdown). (1) `xcoverClient.ts`'s `request()` now catches fetch failures and timeouts
itself and returns `capture.status: 0, capture.networkError: <reason>` instead of throwing —
this is the failure class that used to crash the process, so it gets handled at the source
rather than caught further up. (2) A 10s `AbortController` timeout — no published SLA exists (checked
`offers/api/reference.md` directly), so this is `// ASSUMPTION:` marked in code and logged in
OPEN-QUESTIONS.md, justified by ~230ms-2.8s observed live latency giving >3x headroom. (3)
`JSON.parse(text)` guarded — a non-JSON body (e.g. an HTML error page from an intermediate
gateway) now degrades to a raw-text capture instead of throwing. (4) `asyncHandler` wraps every
route as defense-in-depth for anything not already caught by (1)-(3), feeding a terminal Express
error middleware instead of an uncaught exception; `process.on("unhandledRejection", ...)` is the
last-resort net beneath that. (5) Frontend: `handleOptIn`/`handleDecline`/`handleCancel` gained
try/catch and a visible `actionError` — previously a failed call did nothing observable at all,
which is arguably worse than a crash for a demo (a silent no-op looks like the click didn't
register). (6) `decision: "unprotected"` + "Continue checkout without protection" button: the
actual fail-open behavior CLAUDE.md's principle requires — Create Offer failing for any reason no
longer blocks the purchase. (7) `ErrorBoundary` class component wraps `<App />` in `main.tsx` for
render-time crashes, a different failure class from anything XCover-related.
Alternatives rejected: reaching for `express-async-errors` (a one-line fix, but an added
dependency for something four short route handlers don't need — CLAUDE.md's "no unused
dependencies" and "boring explicit code" both point at writing the ~8-line `asyncHandler.ts`
instead). Retrying failed XCover calls automatically — rejected for this prototype: a demo
benefits from a failure being visible and immediate (the fail-open button), not silently retried
and delayed; a real integration might retry, but that's product behavior beyond this scope.
Verification: broke it four ways for real, not just read the fix and assumed it worked —
unresolvable host (`ENOTFOUND`, via `.cause` unwrapping added after the first attempt returned
the unhelpful generic "fetch failed"), a non-routable `192.0.2.1` address (confirmed the 10s
timeout fires at ~10.0s exactly), a real HTTPS host returning HTML instead of JSON
(`example.com`), and a real `500` from a local throwaway HTTP server. All four returned a clean
`200` proxy response with the failure captured, and `/api/health` stayed reachable after each —
the process never went down again. `.env` was backed up before any of this and restored
byte-for-byte afterward (`diff` confirmed), and all throwaway processes were killed.
AI note: the first attempt at the unresolvable-host test produced `networkError: "fetch failed"`
— technically correct but useless for actually debugging a real outage, since Node's `fetch`
puts the real reason (`ENOTFOUND`, etc.) in `err.cause`, not `err.message`. Caught by reading the
Inspector-facing output of my own test, not by reading MDN's fetch docs first — fixed by
unwrapping `err.cause` when present. This is exactly the kind of gap that only running the
failure surfaces; the code would have "worked" (not crashed) with the unhelpful message too.

### 2026-08-15 — Session 1.5 sandbox capability probe, run retroactively against an already-built app
Context: the Session 1.5 probe prompt is written to run *before* any application code exists —
it explicitly says "do not build any application code this session." By the time it was run,
`/server`, `/web`, fixtures, and all four docs already existed (2026-08-13 commits). Rather than
silently ignore the mismatch, it's recorded here: most of Probes 1/2/4/5(partial) were already
answered empirically during the build and are cited from `docs/OPEN-QUESTIONS.md` /
`docs/DECISIONS.md` rather than re-run from scratch. This session's actual new work closed the
real gaps: the other 6 markets (only US had been tested), quote TTL/expiry, idempotent
re-confirm, cancellation reversibility, and real captured failure shapes — plus the two
deliverables that didn't exist yet: the Postman collection and `docs/SANDBOX-CAPABILITIES.md`.
No application code (`/server`, `/web`) was touched.
Choice: throwaway probe script at `scripts/probe/probe.ts` (root level, separate from the
committed `server/scripts/probe-schema.ts` dev tool — this one reimplements signing inline with
zero dependency on the app's build graph, matching the brief's "throwaway" framing), dumping
every captured request/response to `fixtures/probe/`. ~30 live calls made against
`api.xcover-staging.com`; all test bookings created during probing were cancelled afterward to
leave the sandbox clean.
Two real findings surfaced that weren't expected going in: (1) confirming the same offer twice
returns a 422 referencing the existing booking ID rather than silently succeeding or creating a
duplicate — confirms the build's existing double-click handling assumption was right without
ever having tested it; (2) Opt Out Offer returns 204 even when called on an offer that was
already Confirmed in the same run — not expected, reproduced twice (manually and via Newman),
now flagged in `docs/OPEN-QUESTIONS.md` #4 as a question for Cover Genius rather than a build
change, since the built checkout's linear flow can't trigger this sequence today.
Alternatives rejected: re-running Probes 1/2/4 from a blank slate to match the letter of the
"before the build" framing — rejected as wasted live-API calls against findings that were
already correct and already cited with evidence; the honest move was to flag the sequencing
mismatch (done above and to the user directly) and spend the session on the actual gaps.
AI note: the Postman collection's first draft asserted (in a request description) that "an
already-confirmed offer cannot be opted out" — a plausible-sounding assumption written before
testing it. Running the collection end-to-end via Newman falsified that assumption immediately
(the Opt Out request returned 204 against an already-confirmed offer_id in the same run) — caught
by actually executing the artifact being built, not by re-reading it, which is exactly the kind
of thing CLAUDE.md's hard constraint 2 (never invent behavior, verify) is warning against. The
description was corrected and the finding promoted into `docs/OPEN-QUESTIONS.md` #4. Also caught:
`probe.ts`'s save-to-file path did `JSON.parse(body)` on the raw request body for the saved
record, which crashed (uncaught) on the deliberately-malformed-JSON error probe — the response
itself printed fine to stdout, but the file never got written. Worked around by hand-writing that
one capture (`fixtures/probe/err-malformed.json`) rather than fixing the throwaway script, since
it's not reused elsewhere and fixing it wasn't worth the scope.

### 2026-08-13 — Excluded the assignment brief PDF from version control
Context: the original case-study brief (`CSE Interview Candidate Case Study - Retail China.pdf`)
was sitting in the repo root, predating this session's work.
Choice: gitignored rather than committed — it's Cover Genius's own document about the interview
process, not project source, and doesn't belong in an artifact the panel will read as code.
Confirmed against the actual brief text that the built prototype's scope matches what's asked
for: retrieve/visualize a laptop's coverage, opt-in/decline, and expose live request/response
data on the frontend are exactly the three bulleted "should" requirements: everything else in
the brief's "Technical Considerations" (eligibility engine, webhook claims, full settlement)
is context, not a requirement, and CLAUDE.md's decision to diagram-rather-than-build those
matches the 12-hour scope note in the brief.
AI note: reading the actual brief (rather than working only from CLAUDE.md's paraphrase of it)
surfaced two dead hyperlinks lost in the PDF export — the presentation slide template and the
"developer hub" docs link both render as plain text with no URL. Flagged to the user rather
than guessing at a URL, consistent with hard constraint 2.

### 2026-08-13 — README.md, verified against an actual clean clone
Context: CLAUDE.md calls out README run instructions as "an explicit submission requirement and
it will be tested" — so it needs to actually work, not just read plausibly.
Choice: `git clone` → `npm install` → `cp .env.example .env` → `npm run dev`, with MOCK_MODE
explained as the reason it works with zero real credentials out of the box. Also documented
`server/scripts/probe-schema.ts` as a reusable tool (not just a one-off), since a panelist
asking "how did you find the schema" deserves a runnable answer, not just a description.
Verification: actually ran `git clone` of the local repo into `/tmp` and walked through the
README's exact commands against that clean checkout — not just re-reading the steps. First
attempt failed instructively: cloned before committing README.md itself, so the clone didn't
have it — a reminder that "I wrote a file" and "the file is verifiable from a clean clone" are
different claims, and only the second one satisfies this constraint.

### 2026-08-13 — docs/ARCHITECTURE.md for the explicitly out-of-scope items
Context: CLAUDE.md lists four things to give "an architecture diagram and a verbal answer, not
code" — the eligibility rules engine, the claims webhook receiver, settlement/reconciliation,
and auth/persistence/order management.
Choice: one doc with a Mermaid flowchart of what's actually built (browser → proxy → XCover,
with the MOCK_MODE fixture branch shown explicitly) and a sequence diagram of the real request
flow, then a section per out-of-scope item explaining what it would do, why it's out of scope
for *this* prototype specifically (not scope in general), and where it would plug into the
existing pieces. The webhook section also gets a small sequence diagram since "where does
verification/idempotency/the booking-ID mapping happen" is exactly the kind of question a
technical panel would ask and a diagram answers faster than prose.
Alternatives rejected: a generic "this is out of scope" one-liner per item — CLAUDE.md asks for
enough to answer panel questions verbally, which means the reasoning has to actually be present,
not just the conclusion.
AI note: Mermaid diagrams are plain text in the markdown file, so nothing to verify by running
code here — verified by re-reading each diagram against the actual route/field names already
confirmed live (e.g. `partner.transaction_id`, `commission.partner_commission` are real fields
from the captured fixtures, not invented ones, since the settlement section references them as
where reconciliation would hook in).

### 2026-08-13 — Web checkout UI, and a real bug caught by driving it in a browser
Context: needed the checkout flow CLAUDE.md describes — product + market/quantity selection,
protection offer, opt-in/decline, Inspector, cancellation demo — as a single-page app talking
only to the `/api` proxy (never XCover directly, never touching credentials).
Choice: one `App.tsx` holding flow state (`offer`, `decision`, `booking`, `cancellation`, an
ordered list of Inspector `entries`) rather than a router or state library — it's a single
linear checkout flow, and CLAUDE.md explicitly excludes styling/architecture beyond what's
needed for legibility. Offer fetching is button-triggered, not an automatic effect on
market/quantity change, so every XCover call is a deliberate, visible user action reflected in
the Inspector — matches the "Inspector is a first-class feature" requirement better than a
debounced auto-fetch would. Policyholder fields are pre-filled but editable, since the panel
scope doesn't include auth/persistence and a blank form add friction without adding anything to
demo.
Verification: no browser available directly, so used a throwaway Playwright script (not part of
the repo — scratchpad only) to actually launch Chromium, click through both the opt-in and
decline paths across two markets, and check `console --errors`. This caught a real bug that
reading the code would not have: **Opt-out Offer's route mirrored XCover's `204` status onto our
own proxy response** (`res.status(capture.status).json(...)`). A 204 response must have no body
per HTTP spec, and Node strips it even when you call `.json()` on it — so the frontend's
`postJson` got an empty body where it expected `{result, capture}` and crashed with
`SyntaxError: Unexpected end of JSON input`. Fixed by decoupling the two: the proxy's own HTTP
status now always reflects "did the proxy call succeed" (stays 200), while the real upstream
status lives in `capture.status`, which the Inspector reads directly. Re-verified live (not just
mocked) that a real XCover 204 now correctly reaches the frontend inside a 200-wrapped envelope.
Also noted, not fixed: in MOCK_MODE, the Create Offer response is a single static fixture, so
switching markets changes the *request* correctly (visible in Inspector) but the mocked
*response* still shows USD regardless of the market selected. This is an inherent limitation of
a hand-recorded fixture, not a bug — building a fixture that dynamically reflects arbitrary
market input would mean re-implementing XCover's rating logic client-side, which is exactly the
"real-time rules engine" CLAUDE.md puts out of scope. Live mode (`MOCK_MODE=false`) doesn't have
this limitation.
Alternatives rejected: mirroring upstream status by only special-casing 204 (e.g. `res.sendStatus(204)`
when capture.status===204, res.status(capture.status).json(...) otherwise) — rejected because it
would have made the Inspector unable to show the opt-out call's capture data at all (no body =
no way to send the `capture` object to the frontend for that one endpoint), which defeats the
entire point of the Inspector being able to show every call.
AI note: The bug above is a good example of why "read the code" isn't enough verification for
UI work — the TypeScript compiler, ESLint, and even the server's own MOCK_MODE curl tests
(task 5/6) all passed with this bug present, because none of them exercised the actual
browser-side fetch/JSON-parse path against a real 204. Only driving the real checkout flow in a
browser surfaced it.

### 2026-08-13 — Server proxy: per-endpoint client functions, MOCK_MODE folded in rather than layered on top
Context: needed the Express routes (create/confirm/opt-out offers, cancel bookings) plus the
MOCK_MODE fixture switch (hard constraint 4) and the Inspector's request/response capture
(architecture requirement) all at once, now that the real schema was known.
Choice: `xcoverClient.ts` exports one function per XCover operation (`createOffer`,
`confirmOffer`, `optOutOffer`, `cancelBooking`), each a 3-line `mockMode ? mocked(...) :
request(...)` branch, rather than a generic path-matching dispatcher. Considered a table-driven
approach (map of regex → fixture name) first but rejected it — CLAUDE.md prefers boring
explicit code over clever abstraction, and four short functions are easier to read than one
regex table. Both `request` (live) and `mocked` (fixture) return the same `{data, capture}`
shape so routes don't care which path was taken. Headers are redacted in the capture object
for *both* modes (mock mode fabricates a plausible-looking redacted header set) so the
Inspector panel looks and behaves identically regardless of MOCK_MODE — the panel shouldn't be
the tell that you're in mock mode. Routes mirror the upstream HTTP status (`res.status(capture.status)`)
rather than always returning 200, so a 422 from XCover surfaces as a 422 from our own API too.
Alternatives rejected: a single generic `callXCover(method, path, body)` with fixture lookup
by regex-matched path — more DRY but more indirect; explicit per-operation functions read
top-to-bottom without needing to mentally execute a matcher.
AI note: Model wrote the client, types, and routes from the real captured schema (previous
decision entry) — no field names invented. Caught one real mismatch while wiring `package.json`:
generated `@types/express@^5.0.0` against `express@^4.21.2` (a version-mismatched types
package, which would have produced confusing incorrect-overload errors down the line rather
than an obvious failure) — corrected to `@types/express@^4.17.21` before it caused problems.
Verified the whole thing by actually running the server in both `MOCK_MODE=true` and
`MOCK_MODE=false` and curling all four routes, not just by reading the code: mock mode returns
the captured fixtures with a correctly-empty-body 204 for opt-out; live mode created a real
offer against the sandbox and the capture object showed the API key/signature genuinely
redacted (`45Bc...a6b0`, not the full key).

### 2026-08-13 — Discovered E3CCM's offer schema and confirmed auth against the live sandbox
Context: `context`'s schema for Create Offer is undocumented publicly (docs/OPEN-QUESTIONS.md
#2), and the HMAC algorithm was ambiguous across doc pages (#1). Needed real answers before
building the server routes and fixtures.
Choice: probed the live sandbox directly (`server/scripts/probe-schema.ts`, kept as an `npm
run probe -w server` dev tool rather than deleted, since it's a legitimate way to re-verify
against a live partner config later). Iterated from an empty body through successive 422s to
discover `context: { purchase_date, product: { retail_value, quantity } }`. This confirmed
`E3CCM`'s sandbox runs a custom `cse-interview-retail` offer schema — a two-year/three-year
extended-warranty product built specifically for this interview, not a generic public offer
type (`policy_code: "CSEINTPR"`, underwriter "Acasta European Insurance Company Limited").
Also confirmed SHA-512 is correct (request accepted, no 403) and that `quantity` measurably
changes the rated price ($663.68 at qty 1 vs $1321.95 at qty 3, for the same $1200 retail
value — not linear, some server-side rating curve, which is fine to leave as an API black box).
Ran the full lifecycle live: create → confirm (opt-in) → booking `EWGGB-V2G64-INS`; a second
create → opt-out (204, no body, as documented); cancellation both via preview→confirm and via
immediate cancel with `refund_required:false`. Real, captured responses are now
`fixtures/*.json` for MOCK_MODE, not invented shapes.
Alternatives rejected: inventing a plausible `context` shape from the parcel-shipping vertical
example — explicitly prohibited by hard constraint 2, and would have been wrong anyway (that
vertical has no product/quantity/retail_value fields, since it's a different vertical).
AI note: The `refund_required:false` test (scope item 6, duplicate-refund avoidance) came back
inconclusive rather than confirming the field does what the docs implied — `refund_amount` in
the cancel response was identical whether the flag was `false`, `true`, or omitted, because
`E3CCM` has `xpay_refund_enabled:false` and `automatic_refund_by_xcore:false` (no payout
mechanism wired up regardless of the flag). This is exactly the kind of finding that's tempting
to paper over with a confident-sounding claim; recorded as inconclusive in OPEN-QUESTIONS.md
#3 instead, since asserting the mechanism works based on identical-either-way output would have
been the same mistake as guessing a field name outright.

### 2026-08-13 — HMAC-SHA512 signing implemented with an independently-computed test vector
Context: CLAUDE.md requires the signing function to have a unit test against a known vector,
since a subtle bug here breaks every call. Cover Genius's docs provide worked examples but no
official test vector to assert against.
Choice: implemented `signDate`/`buildAuthorizationHeader` per `authentication.md` exactly —
sign the literal string `"date: {date}"` with HMAC-SHA512, base64 (strict RFC 4648), then
URL-encode. For the test vector, computed the HMAC independently via `openssl dgst -sha512
-hmac` on the command line (not via Node, so the test isn't just asserting the codebase agrees
with itself), then hand-verified the URL-encoding step separately.
Alternatives rejected: asserting only "signature is a non-empty string" (would not catch a
wrong algorithm, wrong signed-string format, or a URL-safe-base64 bug — exactly the failure
mode the docs warn about: "some languages will URL safe base64 encode... this will cause a
'Signature string does not match!' error").
AI note: Model wrote `signing.ts` and the test from the authentication.md excerpt. First draft
of `rfc822Date` included a no-op `.replace("GMT", "GMT")` that did nothing — caught on re-read
before commit and removed rather than left as dead code. The OpenSSL vector was generated and
cross-checked by hand before being pasted into the test, specifically so the test has an
authority independent of the implementation it's checking.

### 2026-08-13 — Logged two doc ambiguities before writing any integration code
Context: CLAUDE.md hard constraint 3 requires stopping and recording ambiguities in
`docs/OPEN-QUESTIONS.md` rather than guessing. Two were found while reading the partner docs:
the HMAC algorithm (`authentication.md` says SHA-512; the offer reference pages say SHA-256 in
passing) and the `context` object schema for Create Offer (documented only as "schema-defined
fields," with no example body anywhere public — the parcel/shipping vertical page, the closest
analogue to shipped goods, explicitly defers to a Customer Success Engineer for examples).
Choice: wrote both up in `docs/OPEN-QUESTIONS.md` before touching `signing.ts` or the offer
routes, then proceeded with a provisional resolution for each (SHA-512; discover `context`
fields by probing the live sandbox and reading 422 errors) so the build isn't blocked, while
flagging both as things to confirm with Cover Genius directly.
Alternatives rejected: guessing silently and moving on — explicitly what CLAUDE.md says not to
do; skipping the sandbox probe and inventing plausible `context` field names — also explicitly
prohibited (hard constraint 2, never invent field names).
AI note: Both ambiguities were caught by actually reading the fetched doc pages side by side,
not assumed. The SHA-512 vs SHA-256 conflict in particular is exactly the kind of thing that's
easy to miss if you stop reading after the first page that mentions an algorithm.

### 2026-08-13 — Repo scaffold: npm workspaces, Express/TS server, Vite/React/TS web
Context: Starting from an empty repo (just `CLAUDE.md`, `.env`, `.env.example`, `.gitignore`).
CLAUDE.md mandates the `/server` (Express+TS) and `/web` (Vite+React) split and a single
`npm run dev` / `npm run test` / `npm run lint` at the root.
Choice: npm workspaces (`server`, `web`) under one root `package.json`, so `npm install` at
the root wires up both without a separate package manager. `tsx watch` for the server dev
loop (fast, no separate build step needed for dev). `vitest` for server unit tests — pairs
naturally with Vite/TS, single test runner. Flat-config ESLint (`eslint.config.js`) with
`typescript-eslint`, since flat config is now the ESLint default and avoids the legacy
`.eslintrc` cascade. `concurrently` to run both dev servers under one `npm run dev`, matching
the command CLAUDE.md specifies verbatim.
Alternatives rejected: pnpm/yarn workspaces (no reason to add a second package manager for a
two-package prototype); Jest for tests (extra config to bridge ESM/TS that vitest gives for
free); a single unified server+web package (would blur the "server never exposes the API
secret" boundary CLAUDE.md calls out as a hard constraint — keeping them as separate packages
makes that boundary a directory boundary, not just a convention).
AI note: Fully generated scaffold (package.json files, tsconfig, eslint config, placeholder
`index.ts`/`App.tsx`/`main.tsx`). Verified by actually running `npm install` and booting both
dev servers (`curl localhost:3001/api/health` → `{"ok":true}`, `curl localhost:5173/` → 200)
rather than assuming the config was correct. `npm audit` flagged esbuild advisories via the
vite/vitest dev-dependency chain (GHSA-67mh-4wv8-2f99) — read the advisory: it's a dev-server
request-handling issue, not a runtime/production risk, so left as-is rather than force-upgrading
into breaking changes. Caught after the fact: the first commit omitted this file, violating
CLAUDE.md's "every commit updates DECISIONS.md" rule — corrected in the very next commit rather
than amending, per the project's own git-safety guidance against amending.
