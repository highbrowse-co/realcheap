# RealCheap × XCover

A prototype embedding Cover Genius's XCover protection into a mock checkout for **RealCheap**,
a fictional marketplace selling discounted electronics across US, CA, GB, IT, FR, ES, DE. Built
for a Cover Genius Client Solutions Engineer interview panel — see `CLAUDE.md` for the brief.

**Start here if you're reviewing this**: `docs/DEMO-SCRIPT.md` (the click path), `docs/PANEL-QA.md`
(the hardest questions, answered honestly), `docs/CODE-TOUR.md` (what to read and in what order),
`docs/WEAKEST-POINTS.md` (blunt, ranked). `docs/DECISIONS.md` and `docs/OPEN-QUESTIONS.md` are the
running record of every non-obvious choice and every real ambiguity; `docs/ARCHITECTURE.md` has
the one integration diagram; `docs/SANDBOX-CAPABILITIES.md` and `docs/API-NOTES.md` cover what
this specific sandbox account can do and the exact signing construction; `docs/WHY.md` covers
decisions a different engineer would reasonably have made differently.

## Requirements

- Node.js 20+ (developed against Node 24)
- npm 10+

## Setup

```bash
git clone <this repo> realcheap
cd realcheap
npm install
cp .env.example .env
```

By default `.env` runs in **MOCK_MODE** (`MOCK_MODE=true`), which serves recorded responses
from `/fixtures` and needs no real credentials — you can leave `XCOVER_API_KEY` /
`XCOVER_API_SECRET` as the placeholder values in `.env.example` and everything still works.

To hit the live XCover sandbox instead, fill in the real `XCOVER_API_KEY` and
`XCOVER_API_SECRET` in `.env` and set `MOCK_MODE=false`. No code changes needed either way —
see `docs/DECISIONS.md` for why it's built this way.

## Run

```bash
npm run dev
```

Starts the Express server (`http://localhost:3001`) and the Vite dev server
(`http://localhost:5173`) together. Open `http://localhost:5173` — the Vite dev server proxies
`/api/*` to the Express server, so the browser only ever talks to `localhost:5173`.

Walk through the checkout: pick a market and quantity, "Get protection offer," opt in or
decline, and — if you opted in — try the cancellation demo at the bottom of the confirmation
card. The Inspector panel on the right shows every call made to XCover: method, URL, headers
(API key and signature redacted), request body, status, latency, and response body.

## Test

```bash
npm run test
```

Runs the server's unit tests, including the HMAC-SHA512 signing test against an
independently-computed (OpenSSL, not this codebase) test vector — see
`server/src/signing.test.ts`.

## Lint

```bash
npm run lint
```

## Re-probing the live sandbox

`server/scripts/probe-schema.ts` is the tool used to discover XCover's undocumented offer
schema against the live sandbox (see `docs/OPEN-QUESTIONS.md`). To reuse it:

```bash
cd server
npx tsx scripts/probe-schema.ts <METHOD> <path-after-partner-code> [body]
# e.g.
npx tsx scripts/probe-schema.ts POST offers/ '{"customer":{"currency":"USD","language":"en","country":"US"},"partner":{},"context":{"purchase_date":"2026-08-13","product":{"retail_value":1200,"quantity":1}}}'
```

Requires real credentials in `.env` regardless of `MOCK_MODE` (it always calls the live API
directly, bypassing the mock switch). `scripts/probe/probe.ts` at the repo root is the same
pattern, used for the broader Session 1.5/Phase 3/5 capability probes — see its usage comment.

## Postman collection

`postman/xcover-realcheap.postman_collection.json` covers the full offer/booking lifecycle
(create, confirm, opt-out, cancel), idempotency-key behavior, the two-step
preview/confirm-cancellation flow, extended query params, a Runner-drivable market matrix, and
reference requests for real captured error shapes — all HMAC-signed by a collection-level
pre-request script. Import it plus `postman/xcover-realcheap.postman_environment.example.json`
(duplicate, rename, fill in real credentials — never commit the filled-in copy; it's gitignored
by the exact filename `xcover-realcheap.postman_environment.json`). Verified end-to-end via
Newman against the live sandbox, not just imported and assumed correct.

## Project layout

```
/server         Express + TypeScript. Signs and proxies XCover calls, captures request/response.
/web            Vite + React. Mock RealCheap product page and checkout, with the Inspector panel.
/fixtures       Real recorded sandbox responses — /markets is the 35-combination MOCK_MODE
                matrix (7 markets x quantities 1-5); /probe is raw Session 1.5/Phase 3/5 captures.
/postman        A Postman collection covering the full lifecycle plus idempotency, two-step
                cancellation, and a Runner-drivable market matrix — verified via Newman.
/scripts/probe  Throwaway script for re-probing the live sandbox directly (signs and calls
                XCover, bypassing MOCK_MODE entirely).
/docs           DECISIONS.md, OPEN-QUESTIONS.md, ARCHITECTURE.md, API-NOTES.md,
                SANDBOX-CAPABILITIES.md, DEMO-SCRIPT.md, PANEL-QA.md, CODE-TOUR.md, WHY.md,
                WEAKEST-POINTS.md
```
