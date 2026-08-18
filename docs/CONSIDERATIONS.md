# Technical considerations — mapped to what the code actually does

Each of the six items maps to one of three states: **Demonstrated live** (a real signed call
against XCover staging exercises this, with a capture to show for it), **Built but unverifiable**
(the code is correct and the call is real, but this sandbox account can't observe whether the
underlying mechanism actually does what it's supposed to), or **Designed, not built** (documented
in `docs/ARCHITECTURE.md`, with no code). Every field, endpoint, and file cited below was checked
against the actual response shape in `fixtures/` or a fresh live capture, not assumed from memory
— two field-name errors in `docs/ARCHITECTURE.md`'s own settlement section were found and
corrected in the course of writing this document (see that file's Settlement section).

## 1. Real-time SKU and category eligibility

**Designed, not built.**

The honest reason, checked directly rather than assumed: the `cse-interview-retail` schema does
not reject `sku` or `category` fields added to `context.product` — a live probe adding both to an
otherwise-normal Create Offer request still returned `200` (`fixtures/probe/sku-category-test.json`).
But nothing in the response indicates they're consumed. No field echoes them back, no `errors` or
`warnings` entry references them (the response's own `errors` object is `{}` on every successful
call regardless, confirmed against a normal capture), and the pricing difference observed between
a request with and without them is within this sandbox's already-documented pricing drift for
identical inputs (`docs/SANDBOX-CAPABILITIES.md`, Probe 3) — not evidence of an effect either way.

The straightforward reading: this offer schema, as configured for this sandbox account, doesn't
implement SKU/category-based eligibility filtering at all. It prices unconditionally from
`retail_value`/`quantity`/`purchase_date`/market. There is also no policy-type or eligibility
enumeration endpoint in the public docs (`docs/SANDBOX-CAPABILITIES.md`, Probe 2) — an eligibility
engine would be entirely RealCheap-side logic gating whether `POST /api/offers` is called at all,
not something XCover's API surface exposes or enforces (`docs/ARCHITECTURE.md`, "Real-time
SKU/category eligibility rules engine"). Not built here because there's exactly one hardcoded
product (`web/src/lib/product.ts`) — there'd be nothing real to rule against.

## 2. Coverage and pricing calculation at checkout

**Demonstrated live.**

`POST /api/offers` (`server/src/xcoverClient.ts`, `createOffer`) signs and sends a real request;
the response's pricing (`products[].details.finance.price.total_amount`) and coverage copy
(`content.heading`, `content.extras`, per-product `content.products[].title`) are rendered
directly in the checkout (`web/src/App.tsx`) — not RealCheap-authored text. Verified two ways:
`scripts/smoke-test.ts` step 2 asserts a real positive price on a live response, and the UI itself
now renders `extras` (three real bullets — Breakdowns, Accidental Damage, Cash Refund),
`credibility_message`, and `disclaimer_html` straight from the same response object, closing the
gap between "renders from the API" as a claim and as an observable fact.

Honest limitation: "coverage calculation" here means a price plus a marketing-level summary of
what's covered, not an itemized peril schedule. `content.products[].benefits`, `.inclusions`, and
`.exclusions` are empty objects on every response this project has ever captured
(`docs/SANDBOX-CAPABILITIES.md`, Probe 2; confirmed at this exact path — there's a second,
separate `products[].details.benefits` field, an empty list rather than an empty object, equally
unpopulated) — there's no structured, line-item coverage breakdown available from this endpoint
on this account, only the three `extras` bullets. The rating formula itself — why quantity scales non-linearly, and why the
2-year/3-year plan ordering isn't stable across market or quantity (`docs/OPEN-QUESTIONS.md` #5;
not an Italy-specific quirk as first thought — every market shows both orderings at different
quantities) — is an intentional black box, confirmed to exist and to move prices, never
reverse-engineered, per `docs/OPEN-QUESTIONS.md` #2 and #5.

## 3. Quantity-based rating for multi-unit orders

**Demonstrated live.**

`context.product.quantity` is a real field, confirmed to change the quoted price, confirmed
non-linear — most recently reconfirmed today: `scripts/smoke-test.ts` step 4, live, qty 1 vs qty
3 on the same retail value (`docs/DECISIONS.md`, Phase 10). 35 real captures across all 7
markets × quantities 1–5 back this (`fixtures/markets/create-offer-*.json`).

Honest limitation: this is "quantity of one identical product," not itemized rating of distinct
SKUs in a multi-item cart — the schema has one `product` object with a `quantity` field, not a
line-items array. The non-linear curve itself is XCover's black box, same caveat as item 2.

## 4. Cancellation preventing duplicate compensation when the partner also refunds

**Built but unverifiable.**

`refund_required: false` is sent correctly on Cancel Booking when the UI's "RealCheap already
refunded this customer directly" checkbox is set (`web/src/App.tsx`, `handleCancel`;
`server/src/xcoverClient.ts`, `cancelBooking`), and the call is real —
`scripts/smoke-test.ts` step 8 gets a genuine refund figure and `cancellation_id` back live. But
this sandbox partner (`E3CCM`) has `xpay_refund_enabled: false` and
`automatic_refund_by_xcore: false` (`fixtures/cancel-booking.json`'s own capture) — there is no
payout mechanism wired up on this account at all, so whether the flag actually suppresses a
duplicate payout can't be observed here. `refund_amount`/`total_refund` came back identical
whether the flag was `true`, `false`, or omitted in a direct test (`docs/OPEN-QUESTIONS.md` #3) —
consistent with "the field does nothing observable on this account," not proof it works. This is
the one item CLAUDE.md names by scope-item number, and the honest answer is that the mechanism is
demonstrably called correctly but its effect is unverified, not unverified-but-probably-fine.

## 5. Multi-currency and multi-region settlement across US, CA, GB, IT, FR, ES, DE

**Two different claims, deliberately not conflated — quoting is demonstrated, settlement is not
built.**

**Multi-currency quoting — demonstrated live.** All 7 markets return real `200` quotes with
distinct pricing in the correct currency (`docs/SANDBOX-CAPABILITIES.md`, Probe 3;
`fixtures/markets/create-offer-{US,CA,GB,IT,FR,ES,DE}.json`) — confirmed to be real per-market
rating, not currency conversion applied to one base price (the four EUR markets price differently
from each other despite identical currency and inputs). `scripts/smoke-test.ts` step 3
reconfirms this live for a EUR market on every run.

**Settlement — money movement and reconciliation — designed, not built, zero code.** No ledger,
no payout tracking, no reconciliation job exists anywhere in this repo. `docs/ARCHITECTURE.md`'s
"Settlement and reconciliation" section describes where it would attach: a scheduled job reading
`quotes[].commission.partner_commission`/`.total_commission` (per-quote, real, but only on
**Confirm Offer**'s response, not on Create Offer or Cancel Booking —
`fixtures/confirm-offer.json`) and `total_premium`/`total_premium_formatted` (top-level, real on
both Confirm Offer and Cancel Booking — `fixtures/confirm-offer.json`,
`fixtures/cancel-booking.json`) against RealCheap's own ledger, joined by
`partner_transaction_id` (a real top-level field, Confirm-Offer-only — but `null` in every
capture in this repo; this sandbox account has never populated it, so even the join key is
unverified as a working mechanism, not just the job that would use it). Create Offer has a
*different*, separate commission field —
`products[].details.finance.commission.total_amount`, only populated with
`extra_fields=commission` (`docs/API-NOTES.md`; `fixtures/probe/extra-fields-test.json`) — easy
to conflate with the Confirm Offer one since both are called "commission." `docs/ARCHITECTURE.md`
originally cited `commission.partner_commission` correctly (it's real, just needed the endpoint
context) but a first attempt at fixing it here replaced it with the wrong endpoint's commission
field entirely — caught and corrected by checking the exact path against real captures rather
than trusting either version.

Quoting seven markets in seven currencies and reconciling real money movement across seven
regions are different engineering problems with different amounts of work behind them here: one
is real and repeatedly verified live, the other is a design on paper with no code and an
unpopulated join key.

## 6. Webhook-based claim status

**Designed, not built.**

`docs/ARCHITECTURE.md`'s "Webhook receiver for claim status" section describes the design: a
dedicated endpoint XCover would POST claim lifecycle events to (submitted/approved/paid/denied),
signature verification "symmetric to the outbound HMAC scheme, or whatever XClaim's webhook auth
turns out to be," an idempotency check for redelivery, mapping XCover's booking/quote ID back to
a RealCheap order ID, and updating an order store. No listener exists; no code in this repo
touches claims at all. The webhook authentication scheme itself is explicitly unconfirmed —
not discovered empirically like the outbound HMAC scheme was, because there's no webhook traffic
to receive and inspect without a real claim event and a real endpoint to receive it at. Requires
a persistent order/claims store this prototype deliberately doesn't have (CLAUDE.md: no
"anything resembling a real order management system").
