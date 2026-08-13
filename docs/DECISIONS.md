# Decisions

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
