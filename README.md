# RealCheap × XCover

A prototype embedding Cover Genius's XCover protection into a mock checkout for **RealCheap**,
a fictional marketplace selling discounted electronics across US, CA, GB, IT, FR, ES, DE. Built
for a Cover Genius Client Solutions Engineer interview panel — see `CLAUDE.md` for the brief and
`docs/DECISIONS.md` / `docs/OPEN-QUESTIONS.md` / `docs/ARCHITECTURE.md` for the reasoning behind
what's here.

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
directly, bypassing the mock switch).

## Project layout

```
/server    Express + TypeScript. Signs and proxies XCover calls, captures request/response.
/web       Vite + React. Mock RealCheap product page and checkout, with the Inspector panel.
/fixtures  Real recorded sandbox responses, used in MOCK_MODE and by the fixture loader.
/docs      DECISIONS.md, OPEN-QUESTIONS.md, ARCHITECTURE.md
```
