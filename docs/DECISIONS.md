# Decisions

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
