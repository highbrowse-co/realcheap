# Sandbox capabilities — partner E3CCM

What this specific sandbox partner account can and cannot do, established by calling the live
API (`https://api.xcover-staging.com`) rather than inferring from documentation. Probe run
2026-08-15 (Session 1.5), building on live-sandbox findings already made during the 2026-08-13
build session and recorded in `docs/DECISIONS.md` / `docs/OPEN-QUESTIONS.md`. Raw request/response
captures for everything below are in `fixtures/probe/`.

Legend: **Confirmed** = observed directly against the live sandbox this session or the prior
build session. **Assumed** = read from public docs only, not independently tested here.

## Probe 1 — Signing

**Confirmed.** HMAC-SHA512 over the literal string `date: {RFC 822 date}`, strict base64,
URL-encoded, placed in an `Authorization: Signature keyId="…",algorithm="hmac-sha512",
signature="…"` header. Verified with a fresh live call this session
(`fixtures/probe/market-US.json`, 200 OK) and again via the Postman collection running end-to-end
through Newman. Full construction: `docs/API-NOTES.md`.

## Probe 2 — Product protection policy type

**Confirmed: yes, this account can quote and book product/retail protection, and it fits the
case.**

- Exactly one policy type has been observed for this account: `product_insurance_offer_engine`,
  `policy_type_version: "1"` (`policy_type_slug: product_insurance_offer_engine_v1`,
  `policy_type_group_name: "retail"`, `policy_code: CSEINTPR`, underwriter "Acasta European
  Insurance Company Limited"), served under offer schema `cse-interview-retail` — evidently
  configured specifically for this sandbox account (`offer_config_id:
  aeef88f5-c254-4397-b1e2-734aa29b8afc`), not a generic public offer type.
- **No policy-type enumeration endpoint exists in the public docs** — checked the docs index
  (`llms.txt`) and the Offers API reference page; neither documents a "list policy types" call.
  This account's available policy type(s) were discovered empirically (by successfully quoting),
  not enumerated. **Assumed**, not confirmed: that this is the *only* policy type this account
  can quote — it's the only one exercised, since the case only calls for product protection.
- Coverage fit: the offer's `content.extras` copy explicitly lists **"Breakdowns"** ("faults once
  the manufacturer's warranty period is over"), **"Accidental Damage"** ("accidental damage or
  theft"), and **"Cash Refund"** (replacement or refund up to full paid amount) — this matches
  the case's requirement (accidental damage + structural failure protection for a laptop)
  well enough to build against without inventing coverage language.
- **Response copy richness**: enough to render a real offer (title, heading, disclaimer, CTAs,
  the three `extras` bullets, per-product title/description) without hardcoding marketing text —
  this prototype's web checkout renders these fields directly from the API response. It is
  *not* rich enough to render an itemized, laptop-specific peril list — `content.products[].
  description` is just the plan name ("2 Year Plan"), and `benefits`/`inclusions`/`exclusions`
  came back as empty objects on every observed response, so any itemized coverage breakdown
  beyond the three `extras` bullets isn't available from this endpoint on this account.

## Probe 3 — Markets

**Confirmed: all 7 target markets return a 200 with a real quote**, each with genuinely
different pricing (not just currency conversion — see below). `retail_value: 1200`,
`quantity: 1`, same `purchase_date`, for all seven:

| Market | Currency | 2yr plan | 3yr plan | Evidence |
|---|---|---|---|---|
| US | USD | $585.85 | $532.29 | `fixtures/probe/market-US.json` |
| CA | CAD | CA$880.17 | CA$505.83 | `fixtures/probe/market-CA.json` |
| GB | GBP | £454.43 | £295.46 | `fixtures/probe/market-GB.json` |
| IT | EUR | €336.77 | €360.44 | `fixtures/probe/market-IT.json` |
| FR | EUR | €562.24 | €350.25 | `fixtures/probe/market-FR.json` |
| ES | EUR | €616.42 | €500.44 | `fixtures/probe/market-ES.json` |
| DE | EUR | €534.23 | €437.80 | `fixtures/probe/market-DE.json` |

Notable, unexplained: the four EUR markets (IT/FR/ES/DE) price *differently from each other*
despite identical currency and inputs — confirms `customer.country` drives rating independently
of currency, not just a currency conversion applied to one base EUR price. Also notable: **IT is
the only market where the 3-year plan is priced higher than the 2-year plan** (€360.44 vs
€336.77); every other market has 3yr cheaper than 2yr. This wasn't investigated further — it's
plausibly a real underwriting/rating input for Italy, or a sandbox data quirk — and is listed in
"To send to Cover Genius" below rather than guessed at.

**Assumed, not confirmed**: whether this pricing behavior (or these exact price points) is
stable/representative of production — this is a sandbox, and prices for identical inputs
measurably drifted between the 2026-08-13 build session and this session two days later (same
$1200 retail value, qty 1, US: $663.68 then, $585.85 now) — see "market-US, price drift" in the
build-session capture. Rating is not a frozen constant even for fixed inputs on this sandbox.

## Probe 4 — Quantity

**Confirmed** in the 2026-08-13 build session (see `docs/OPEN-QUESTIONS.md` #2): `quantity` is a
field on `context.product`, not a repeated line-item array. `quantity: 1` → $663.68 (2yr plan,
USD, retail_value 1200); `quantity: 3` → $1321.95. Scaling is **not linear** (≈1.99×, not 3×) —
some server-side rating curve applies. Not re-derived this session; the finding still holds
(quantity is read from the same field, still present in the schema used in every market probe
above).

## Probe 5 — Lifecycle

**Quote TTL/expiry — confirmed: no short-lived expiry observed.** An offer created on
2026-08-13 was successfully confirmed on 2026-08-15 (>48 hours later,
`fixtures/probe/confirm-stale-2day.json`, 200 OK, booking `GJT3B-GKNP9-INS`). No TTL/expiry
field appears anywhere in the Create Offer response. **Assumed, not confirmed**: whether there
is *any* expiry at all, since 48 hours isn't long enough to rule out e.g. a 7-day or 30-day
window — this only rules out anything shorter than 2 days.

**Decline path — confirmed:** `POST offers/{id}/opt_out/` returns `204 No Content`, empty body,
no further call needed. Reconfirmed fresh this session (`fixtures/probe/opt-out-fresh.json`) and
via the Postman/Newman run.

**Surprising, confirmed finding — opt-out does not reject an already-confirmed offer.** Calling
opt-out on an offer that had *already been Confirmed* (booked) in the same run also returned
`204`, not an error. This was tested twice (once manually, once via the Postman collection under
Newman) with the same result both times. What state this leaves the underlying booking in is not
observable from the response alone — the response is empty. **This is now flagged in "To send to
Cover Genius" below** — it means RealCheap's own UI, not the API, is the only thing preventing an
opt-in-then-decline (or decline-then-opt-in) inconsistent state on this account.

**Cancellation reversibility — confirmed: not reversible.** A cancelled booking cannot be
un-cancelled; a second `cancel` call on an already-cancelled booking returns `422`:
`"Status change not allowed for QuotePackage in status CANCELLED"`
(`fixtures/probe/cancel-repeat.json`). `preview: true` does not execute the cancellation — a
`preview:true` call followed by a real call both succeeded, confirming preview is read-only
(`fixtures/probe/cancel-preview.json`, `cancel-confirm-1.json`).

**Two-step cancellation (`confirm_cancellation`) — confirmed working, Phase 3.** Every observed
`preview:true` response (including from the original Session 1.5 probe) returns a real,
populated `cancellation_id` — not exercised further until Phase 3, which called
`POST bookings/{id}/confirm_cancellation/{cancellation_id}/` with it and got a real `200`,
`status: CANCELLED`, real refund figures (`fixtures/probe/cancel-twostep-preview.json`,
`cancel-twostep-confirm.json`). Both the single-call path (`cancel` with `preview:false`, what
the app uses today) and the documented two-step path work on this account. Hit this project's
only `429` here, immediately after the preview call — see Probe 6.

**Repeated confirm (double-click), two mechanisms, confirmed:**
- **Without an idempotency key** (original finding, Session 1.5): confirming the same `offer_id`
  a second time returns `422`: `"Booking already exists for fast_quote_id {offer_id}. INS
  number: {booking_id}"` (`fixtures/probe/confirm-repeat.json`) — the existing booking ID is in
  the error text, but the frontend never parsed or used it (`docs/DECISIONS.md`, Phase 9
  correction). This was the app's only mechanism through Phase 8; it's now what a client that
  sends no idempotency key at all would still hit, but the app itself no longer relies on it.
- **With `x-idempotency-key`** (Phase 3, documented at `offers/api/idempotency-keys.md`):
  resending the identical key + body returns `409 Conflict` with the **same booking** in the
  body — not an error to route around, but the documented "treat as success" response, cached
  for 48 hours (`fixtures/probe/idempotency-key-first.json`, `idempotency-key-repeat.json`).
  **Wired into the app in Phase 9** (`docs/DECISIONS.md`): `App.tsx` generates one key per
  fetched offer and reuses it on retry; `409` is treated as success, `423` retries once. Both
  mechanisms are also in `postman/`.

**Duplicate-refund avoidance (`refund_required`)** — still inconclusive on this sandbox, as
recorded in `docs/OPEN-QUESTIONS.md` #3 (partner has `xpay_refund_enabled: false`, so no payout
mechanism exists to observe either way). Not re-tested this session; the finding stands.

## Probe 6 — Failure shapes

All captured live, saved to `fixtures/probe/err-*.json`. **Errors are not uniformly shaped** —
there are at least three distinct error envelope shapes on this API, which the build's error
handling should account for rather than assuming one shape fits all:

| Case | Status | Shape |
|---|---|---|
| Malformed JSON body | 400 | `{"type":"validation_error","message":"JSON parse error - …"}` |
| Missing required top-level object (empty `{}`) | 422 | `{"type":"validation_error","message":"An API error occurred.","errors":{"non_field_errors":["'customer' is a required property", …]}}` |
| Missing nested required field (`product.retail_value`) | 422 | `{"type":"validation_error","message":"Offer could not be created due to quote generation errors","error_id":"…","code":"offer_quote_generation_failed","errors":{"0":{"message":"retail_value_base calculation failed…","type":"quote_creation_failure"}, …}}` |
| Invalid/unknown offer ID on confirm | 404 | `{"type":"api_error","message":"Quote package does not exist"}` |
| Bad HMAC signature | 403 | `{"type":"auth_error","message":"You do not have permission to access this url"}` |
| Double-confirm | 422 | `{"type":"validation_error","message":"An API error occurred.","errors":["Booking already exists for fast_quote_id …"]}` |
| Double-cancel | 422 | `{"type":"validation_error","message":"An API error occurred.","errors":["Status change not allowed for QuotePackage in status CANCELLED"]}` |

Common thread across all seven: every error body has a top-level `"type"` field
(`validation_error` / `api_error` / `auth_error`) and a human-readable `"message"`, which is
enough for the build to render a generic "here's what went wrong" fallback even for error shapes
it hasn't special-cased. The `errors` field's *internal* shape varies (array of strings, dict of
`non_field_errors`, dict of numbered quote-failure objects) and should not be parsed
structurally beyond "does it exist."

**Country/currency validation — confirmed: none observed at this layer.** A garbage country code
(`"XX"`) and a currency mismatched to the customer's country (`JPY` with `country: US`) were
**both accepted with a 200** and a real (if presumably nonsensical) quote — no rejection, no
fallback-to-default behavior observed (`fixtures/probe/err-bad-country.json`,
`err-bad-currency.json`). **This means RealCheap's own frontend is responsible for constraining
the market selector to real, correctly-paired currency/country combinations** — the API will not
catch a mismatched pairing sent to it. This prototype's market selector already only offers the
7 correctly-paired combinations, so this doesn't change the build, but it's a real finding worth
stating rather than assuming the API would have caught a mistake.

**Rate limiting**: one real `429` encountered, Phase 3 (`docs/DECISIONS.md`) — calling
`confirm_cancellation` immediately after a `preview` call, `"Request was throttled. Expected
available in 1 second."` The only rate limit seen across this project's ~50 live calls total;
retrying ~2s later succeeded. Revises the earlier "none encountered" finding — it wasn't that
rate limiting doesn't exist on this account, just that nothing before Phase 3 had called two
endpoints back-to-back fast enough to trigger it. **Latency**: see `docs/API-NOTES.md` —
roughly 230ms–2.8s per call outside that one throttled call.

## Verdict

**The build can proceed as scoped in CLAUDE.md, unchanged.** Every scope item in
CLAUDE.md — laptop protection offer, opt-in/decline both reflected to XCover, live
request/response in the Inspector, all 7 markets, quantity-based rating, and cancellation —
is confirmed to work against this sandbox account with real data, not assumptions. Nothing here
requires an escalation to Cover Genius before the build can start; the two items below are
worth asking, but neither blocks anything already built or scoped.

Two things worth disclosing wherever this is presented, not blockers:
1. The opt-out-after-confirm behavior (Probe 5) means the frontend, not the API, is the source
   of truth for "has this offer already been decided" — worth a sentence of explanation if
   someone asks about double-submission safety.
2. Pricing for identical inputs drifted over two days on this sandbox (Probe 3) — worth
   mentioning if someone asks why a screenshot's numbers don't match a live re-run.
