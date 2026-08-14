# Code tour

A reading order, meant to be read *beside* the actual files open, not instead of them. Each
entry says what to pay attention to and what breaks if that part is wrong — not what the code
does line-by-line; the code already says that.

## If you only read five files, in this order

1. **`server/src/signing.ts`** — everything else is dead on arrival if this is wrong, and it's
   short enough to actually verify by hand against the OpenSSL vector.
2. **`server/src/xcoverClient.ts`** — the largest file, the fail-open logic, and where every
   bug found this session actually lived.
3. **`web/src/App.tsx`** — the entire user-facing flow in one place; if the demo breaks visibly,
   it breaks here.
4. **`web/src/components/Inspector.tsx`** — CLAUDE.md calls this "how the panel validates that
   calls are real"; worth confirming it actually earns that claim.
5. **`server/src/xcoverTypes.ts`** — the fastest way to audit whether any field was invented
   versus taken from a real captured response.

## Full tour

### 1. `server/src/signing.ts`

**Responsible for**: the one function everything else depends on — HMAC-SHA512 signing of the
`Date` header, per XCover's auth scheme.

**Pay attention to**: `.digest("base64")`, not a URL-safe base64 variant — the docs call out
URL-safe base64 as a specific, common mistake that produces a signature XCover silently rejects.
Also the literal signed string: `date: {date}` (lowercase, colon-space, nothing else).

**What breaks if it's wrong**: everything, silently and confusingly. A subtly wrong signature
doesn't error at the call site that's wrong — it produces a `403` on the *next* call, with no
indication which part of the construction was off. This is the one place CLAUDE.md specifically
calls out as needing a test against a known vector, for exactly this reason.

### 2. `server/src/signing.test.ts`

**Responsible for**: proving #1 against an authority independent of itself.

**Pay attention to**: the vector is computed via `openssl dgst -sha512 -hmac` on the command
line, not by calling this codebase's own `createHmac`. If it were computed the same way the
implementation computes it, the test would pass even if both were wrong the same way.

**What breaks if it's wrong**: nothing directly — but a test that passes without actually
constraining the implementation (e.g. asserting only "is a non-empty string") would let a
completely broken signer through unnoticed. Worth checking the assertion is the *exact* expected
signature string, not a shape check.

### 3. `server/src/config.ts`

**Responsible for**: loading `.env`, exposing `config.mockMode` (`MOCK_MODE=false` is the *only*
thing that turns off mocking — check this before assuming a bug is live-API-related).

**Pay attention to**: `required()` throws at import time if an XCover env var is missing — so a
misconfigured `.env` fails at server startup, not on the first request. `apiKey`/`apiSecret`
default to empty string rather than throwing, specifically so MOCK_MODE can run with the
placeholder `.env.example` values and no real credentials.

**What breaks if it's wrong**: either the server won't start (missing required var) or, worse,
it starts in what looks like live mode but with empty credentials — every live call would `403`.

### 4. `server/src/xcoverTypes.ts`

**Responsible for**: the request/response shapes this app actually reads — explicitly *not* the
full XCover response (see the file's own header comment: "trimmed to the fields this app
actually reads"). The raw, untrimmed response still reaches the Inspector via
`capture.responseBody: unknown`.

**Pay attention to**: every field here should be traceable to a real captured response in
`fixtures/` — that's the whole point of discovering this schema empirically rather than
guessing. If you're checking whether a field was invented, this is the file to audit against
`docs/OPEN-QUESTIONS.md`'s discovery trace.

**What breaks if it's wrong**: a field that doesn't exist in the real API would compile fine (TS
doesn't know what XCover actually returns) and silently be `undefined` everywhere it's read —
this is exactly the class of bug that only manifests by actually calling the API, never by
reading the type.

### 5. `server/src/fixtures.ts`

**Responsible for**: loading fixture JSON by name, listing fixture keys from disk
(`listFixtureKeys`, so the "recorded combinations" list in error messages can't drift from
what's actually there), and `findMarketProductById` — matching a quote id against every recorded
market fixture, which is what makes MOCK_MODE's Confirm/Cancel responses reflect the plan
actually selected instead of a disconnected static price.

**Pay attention to**: `findMarketProductById` does a linear scan across all 35 market fixtures on
every confirm/cancel call in MOCK_MODE — fine at this scale (a `readdir` + a handful of JSON
parses), would need rethinking if the fixture set ever got much larger.

**What breaks if it's wrong**: this is where the Phase 4/5 bugs actually lived — get the field
mapping wrong here and MOCK_MODE goes back to showing a GBP total next to a `US$` tax figure,
silently, with `mockNote: null` implying everything's fine.

### 6. `server/src/xcoverClient.ts` — the largest, most important file

**Responsible for**: every outbound call (live and mocked), the `Capture` shape the whole
Inspector depends on, and the fail-open error handling (`request()`'s try/catch around `fetch`,
the JSON-parse guard, the 10s timeout).

**Pay attention to**: the difference between `capture.status: 0` + `networkError` set
(unreachable — never got an HTTP response at all) versus a normal `capture.status >= 400`
(XCover responded, just with an error). Conflating these two was the original crash bug (Phase
1). Also: `mockedCreateOffer`/`mockedConfirmOffer`/`mockedCancelBooking` are the only three mock
paths that vary by request — `mocked()` (used for opt-out) is still fully static, which is fine
there (a 204 has no body to get wrong) but would reintroduce the Phase 5 bug class if reused for
anything with real response data.

**What breaks if it's wrong**: either a network failure crashes the server again (this file is
where that fix lives — if it regresses, the crash comes back), or MOCK_MODE quietly shows wrong
numbers again with no error to indicate it (the Phase 4/5 bug class).

### 7. `server/src/asyncHandler.ts`

**Responsible for**: one thing — catching a rejected promise from an Express route and calling
`next(err)` instead of letting it become an uncaught exception. Read it in under a minute; it's
here because of what it prevents, not what it does.

**What breaks if it's wrong**: if this were removed, or a route were added without it, a bug in
that one route could crash the whole process again — the same failure mode Phase 1 exists to
close off.

### 8. `server/src/routes/offers.ts`, `server/src/routes/bookings.ts`

**Responsible for**: the thinnest possible layer between Express and `xcoverClient.ts` — no
logic beyond calling the client and shaping `{offer/booking/result/cancellation, capture}`.

**Pay attention to**: the comment in `offers.ts` explaining why the proxy's own HTTP status is
always 200 regardless of what XCover returned (a `204`'s body gets silently stripped by Node
otherwise, breaking the Inspector for that one call — `docs/DECISIONS.md`, 2026-08-13).

**What breaks if it's wrong**: the Inspector loses data for whichever call's status got mirrored
incorrectly — this already happened once and is exactly why the comment is there.

### 9. `server/src/index.ts`

**Responsible for**: Express bootstrap, `/api/health`, and the last two layers of the fail-open
net — the terminal error middleware and the `process.on("unhandledRejection")` handler.

**Pay attention to**: this is deliberately the *last* line of defense, not the mechanism doing
most of the work (that's `xcoverClient.ts` and `asyncHandler`) — if execution regularly reaches
this file's error handler, something upstream isn't catching what it should be.

**What breaks if it's wrong**: without this, a bug that slips past every earlier layer crashes
the process instead of returning a `500` — the exact failure this whole session's Phase 1 exists
to prevent, at its final boundary.

### 10. `web/src/lib/api.ts`

**Responsible for**: typed fetch wrappers to `/api/*`, and the `Capture`/`OfferResponse`/etc.
types the frontend uses — note `OfferResponse | null` on `createOffer`'s return, which exists
specifically for the MOCK_MODE "no fixture matched" case.

**Pay attention to**: `postJson`'s two separate try/catches — one for the fetch itself failing
(RealCheap's own server unreachable), one for a non-JSON response. Different failure classes,
both normalized into thrown `Error`s the callers in `App.tsx` catch.

**What breaks if it's wrong**: an uncaught exception here propagates into whatever called it —
before `App.tsx`'s handlers had try/catch (Phase 1), this is exactly where a failure would go to
die silently.

### 11. `web/src/lib/markets.ts`, `web/src/lib/product.ts`

**Responsible for**: the 7 hardcoded markets and the one hardcoded laptop. Read in thirty
seconds — the interesting question isn't what's here, it's "what would need to exist for this to
be a second product or an eighth market," and the honest answer is `LAPTOP`/`MARKETS` would need
to become real catalog/config data, which is explicitly out of scope (`docs/ARCHITECTURE.md`,
"eligibility engine").

### 12. `web/src/App.tsx` — the largest frontend file

**Responsible for**: all checkout flow state (market, quantity, offer, decision, booking,
cancellation, Inspector entries) and every handler that calls the API.

**Pay attention to**: the `Decision` type's four states, especially `"unprotected"` — the
fail-open terminal state, reached only when Create Offer fails for any reason. Every handler
(`fetchOffer`, `handleOptIn`, `handleDecline`, `handleCancel`) follows the same shape: try, check
`capture.networkError`, check `capture.status >= 400` (or `mockNote` for `fetchOffer`), set state
or set an error. That repetition is deliberate, not an oversight — see `docs/WHY.md`.

**What breaks if it's wrong**: this is the file most likely to visibly embarrass a demo if it
regresses — it's the entire user-facing flow in one place.

### 13. `web/src/components/Inspector.tsx`

**Responsible for**: rendering every captured call — this is "how the panel validates that calls
are real," per CLAUDE.md, so treat it as load-bearing, not cosmetic.

**Pay attention to**: the three-way status badge (`ok` / `error` / `unreachable`), and the
conditional rendering of `mockNote` and `networkError` sections — both are easy to accidentally
suppress if this component gets refactored without preserving the branch.

**What breaks if it's wrong**: the Inspector could show a call as successful when it wasn't
reachable at all, or hide the one piece of context (`mockNote`) that distinguishes a real
recorded number from a fallback — exactly the class of bug Phase 4/5 found elsewhere in the mock
path.

### 14. `web/src/components/ErrorBoundary.tsx`

**Responsible for**: catching a render-time crash in the checkout UI itself, distinct from any
XCover/network failure (those never reach this far — they're caught in `App.tsx`'s handlers).

**What breaks if it's wrong**: without it, an unexpected response shape reaching a component
that doesn't guard for it blanks the entire page with no explanation, in either MOCK_MODE or live.

### 15. `web/src/main.tsx`

**Responsible for**: mounting `<App />` inside `<ErrorBoundary>` inside `<StrictMode>`. Read it
last, and only to confirm the boundary is actually wired in — thirty seconds, nothing else here.

## Fixtures and probe tooling (skim, don't read line by line)

`fixtures/markets/*.json` — pick two or three (e.g. `create-offer-US.json` and
`create-offer-IT-qty3.json`) and skim the shape; they're all structurally identical, real
captures, differing only in the numbers. `fixtures/probe/*.json` are raw, less-curated captures
from the various probe sessions — useful as primary evidence for a specific claim in
`docs/DECISIONS.md` or `docs/SANDBOX-CAPABILITIES.md`, not meant to be read cover-to-cover.
`scripts/probe/probe.ts` is worth a skim if you want to understand how any of the live findings
in this project were actually produced — it's the same signing logic as `signing.ts`,
reimplemented inline so it has no dependency on the app's build graph.
