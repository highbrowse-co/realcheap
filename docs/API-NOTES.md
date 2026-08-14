# API notes — signing and endpoint reference

Precise enough to reimplement from scratch, independent of this repo's TypeScript. Everything
here was confirmed against the live sandbox during the Session 1.5 capability probe
(2026-08-15) — see `docs/SANDBOX-CAPABILITIES.md` for the full probe writeup and
`fixtures/probe/` for raw captures.

## Authentication: HMAC-SHA512 over a fixed date string

Documented in `offers/api/authentication.md`. Confirmed working live (not just per the docs) —
first empirically in the build session (see `docs/DECISIONS.md`, 2026-08-13 entry), reconfirmed
again in this session (`fixtures/probe/market-US.json`, a fresh 200 OK on 2026-08-15).

**Construction, step by step:**

1. Take the current date/time, formatted as an RFC 822 §5.1 date string, e.g.:
   `Thu, 04 Nov 2021 18:07:11 GMT`
   In JavaScript: `new Date().toUTCString()`.
2. Build the literal string to sign: `"date: " + <that date string>` — the literal 5-character
   prefix `date: ` (lowercase, colon, single space), then the date string. Nothing else, no
   trailing newline.
3. Compute `HMAC-SHA512(secret, message)` where `secret` is the raw API secret (not itself
   base64-decoded first) and `message` is the string from step 2. Output the raw digest bytes.
4. Base64-encode the raw digest using **strict RFC 4648** base64 (`+`, `/`, `=` padding) — **not**
   the URL-safe variant (`-`, `_`). This is called out explicitly in the docs as a common mistake:
   "some languages will URL safe base64 encode... this will cause a 'Signature string does not
   match!' error." Using URL-safe base64 here silently produces a signature XCover rejects.
5. URL-encode the base64 string (percent-encode `+`, `/`, `=`, etc. — e.g. JavaScript's
   `encodeURIComponent`) for placement inside the `Authorization` header value.

**Header shape:**

```
Authorization: Signature keyId="<api_key>",algorithm="hmac-sha512",signature="<url-encoded-signature-from-step-5>"
Date: <same RFC 822 date string used in step 1 — must match exactly what was signed>
X-Api-Key: <api_key>
Content-Type: application/json
```

The `Date` header sent with the request must be byte-identical to the string that was signed —
the signature is over that exact string, so any reformatting (e.g. re-deriving the date header
from a `Date` object a second time) risks a mismatch if the two derivations round-trip
differently.

**Reference implementation** (`server/src/signing.ts`, Node.js, `node:crypto`):

```ts
import { createHmac } from "node:crypto";

function signDate(secret: string, date: string): string {
  const digest = createHmac("sha512", secret)
    .update(`date: ${date}`, "utf8")
    .digest("base64");           // strict base64, not base64url
  return encodeURIComponent(digest);
}

function buildAuthorizationHeader(apiKey: string, secret: string, date: string): string {
  const signature = signDate(secret, date);
  return `Signature keyId="${apiKey}",algorithm="hmac-sha512",signature="${signature}"`;
}

function rfc822Date(date: Date): string {
  return date.toUTCString();
}
```

**Postman equivalent** (`postman/xcover-realcheap.postman_collection.json`, collection-level
pre-request script, using the sandbox's built-in `CryptoJS`):

```js
const date = new Date().toUTCString();
const digest = CryptoJS.HmacSHA512(`date: ${date}`, secret).toString(CryptoJS.enc.Base64);
const signature = encodeURIComponent(digest);
```

**Independent test vector**: `server/src/signing.test.ts` asserts against an HMAC computed via
`openssl dgst -sha512 -hmac <secret>` on the command line — an authority independent of the
implementation under test, per CLAUDE.md's requirement for a known vector.

**Doc ambiguity, resolved empirically**: `authentication.md` says SHA-512; the Create/Confirm
Offer reference pages instead say "HMAC-SHA256 signature of canonical request components" in
passing. SHA-512 is what this partner/environment actually accepts (SHA-256 was never tried
live, since SHA-512 worked on the first attempt and CLAUDE.md prioritizes not guessing beyond
what's needed) — flagged to Cover Genius in `docs/OPEN-QUESTIONS.md` rather than silently
resolved.

## Base URL and endpoints used

```
Base:    {XCOVER_API_DOMAIN}{XCOVER_BASE_PATH}{XCOVER_PARTNER_CODE}/
       = https://api.xcover-staging.com/xcover/partners/E3CCM/   (sandbox, this partner)

POST  offers/                                                Create Offer  (quote)
POST  offers/{offer_id}/confirm/                             Confirm Offer (opt in / book)
POST  offers/{offer_id}/opt_out/                              Opt Out Offer (decline) — 204 No Content, no body
POST  bookings/{booking_id}/cancel                           Cancel Booking (single-call, or preview:true)
POST  bookings/{booking_id}/confirm_cancellation/{cancellation_id}/   Confirm a previewed cancellation
```

All take a JSON body and return JSON (opt-out excepted, which returns an empty 204 body). None
of these paths, or any others, were invented — each was taken from the partner docs and
confirmed to return a real response (200/204, or a structured error) against the live sandbox,
including `confirm_cancellation`, added and verified live during Phase 3 (`docs/DECISIONS.md`).

### Create Offer query parameters: `include_content`, `extra_fields`

Documented as query string parameters (not body fields) on Create Offer, confirmed live:

```
POST offers/?include_content=true&extra_fields=tax,commission,benefits,surcharge
```

`extra_fields` accepts `tax`, `commission`, `benefits`, `surcharge` (comma-separated).
`commission.total_amount` is `null` in every response captured in this repo *without*
`extra_fields` — passing it populates real figures (confirmed:
`fixtures/probe/extra-fields-test.json`). Not wired into the app (out of scope — settlement is
explicitly not built, per `docs/ARCHITECTURE.md`), but relevant if that were ever built: this is
how the commission figures it would need actually get returned.

### `x-idempotency-key` on Confirm Offer

Documented at `offers/api/idempotency-keys.md`. A client-supplied header; confirmed live
(`fixtures/probe/idempotency-key-first.json`, `idempotency-key-repeat.json`):

- First confirm with a fresh `x-idempotency-key` + body: normal `200`, real booking created.
- **Identical** key + body resent: `409 Conflict`, body is the **same booking** as the first
  call (cached — not a new booking, not the `422 "Booking already exists"` seen when no
  idempotency key is sent at all, docs/OPEN-QUESTIONS.md #4-adjacent finding). Docs state this
  response is stored for **48 hours** and is meant to be treated by the client as a successful
  response, not an error.
- A `423 Locked` is documented for a genuine race (two identical requests within the same short
  window, before the first has finished processing) — not reproduced here; the two confirms in
  the test were sequential, not concurrent.

This is the *correct* double-click/retry mechanism — cleaner than the app's current behavior
(no idempotency key sent, so a double-click surfaces as a 422 the frontend has to interpret).
Not wired into the app this session (would touch `xcoverClient.ts`/`App.tsx`, and "do not
rebuild anything that works" — the existing 422 handling is a demonstrated working double-click
guard, just not the documented ideal one); logged for a future pass.

### Two-step cancellation: `preview` then `confirm_cancellation`

The single-call path the app uses (`cancel` with `preview:false`/omitted) and the documented
two-step path (`cancel` with `preview:true` → returns a real `cancellation_id` → `POST
bookings/{id}/confirm_cancellation/{cancellation_id}/` to finalize) **both work on this
account** — confirmed live end-to-end (`fixtures/probe/cancel-twostep-preview.json`,
`cancel-twostep-confirm.json`). The preview call has always returned a populated
`cancellation_id` in every capture in this repo, including the original Session 1.5 probe — it
just wasn't carried forward to a `confirm_cancellation` call until Phase 3. See
`docs/DECISIONS.md` for why the app itself wasn't rewired to the two-step flow this session.

One real `429 Too Many Requests` was hit calling `confirm_cancellation` immediately after
`preview` (`"Request was throttled. Expected available in 1 second."`) — the only rate limit
seen across this project's ~50 live calls. Retrying ~2s later succeeded.

## `context` schema for Create Offer (E3CCM / `cse-interview-retail` only)

Undocumented publicly at the field level; discovered by iterating on live 422 responses (see
`docs/OPEN-QUESTIONS.md` #2 for the discovery trace). This is specific to this partner's
`offer_config_id` — a different partner or offer schema could have entirely different `context`
fields, since `context` is explicitly partner/schema-configured, not a fixed public shape.

```json
{
  "customer": { "currency": "USD", "language": "en", "country": "US" },
  "partner": {},
  "context": {
    "purchase_date": "2026-08-15",
    "product": { "retail_value": 1200, "quantity": 1 }
  }
}
```

## Latency and rate limiting

Across ~30 live calls made during the build and this probe session, response times ranged
roughly 230ms–2.8s, median around 1–1.5s, with no clear pattern by endpoint (Create Offer was
not consistently slower than Confirm or Cancel). No rate-limit response (429, or a
rate-limit-shaped 4xx) was encountered at this call volume. This is not a load test — it only
rules out rate limiting being triggered by ordinary interactive use.
