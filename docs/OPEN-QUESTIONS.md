# Open questions for Cover Genius

Ambiguities found in the public docs (`partner-docs.covergenius.com`) and via live sandbox
testing for partner `E3CCM`. Per CLAUDE.md, these are recorded rather than silently resolved
by guessing, even where a live-sandbox test gave a working answer for this prototype.

## 1. HMAC algorithm: SHA-512 or SHA-256? — resolved empirically

`offers/api/authentication.md` documents SHA-512 as the recommended algorithm and uses it in
every worked example. The Create/Confirm Offer reference pages instead describe the same
scheme in passing as "HMAC-SHA256 signature of canonical request components."

**Resolved**: implemented SHA-512 per `authentication.md` and confirmed against the live
sandbox — a SHA-512-signed request against `POST /partners/E3CCM/offers/` was accepted
(no 403), ruling out SHA-256 as what this partner/environment actually expects.

**Still ask Cover Genius**: is the "HMAC-SHA256" wording on the offer reference pages stale
copy, or does the algorithm vary by product line / partner config?

## 2. `context` object schema for Create Offer — resolved empirically for E3CCM

Undocumented publicly. Discovered by calling the live sandbox and reading 422 validation
errors, iterating from an empty body:

```
{} → "'customer' is a required property", "'partner' is a required property", "'context' is a required property"
{customer, partner:{}} → "'context' is a required property"
{..., context:{}} → context: "'purchase_date' is a required property", "'product' is a required property"
{..., context:{purchase_date, product:{}}} → 422 offer_quote_generation_failed:
    "retail_value_base calculation failed. Expression: to_policy_currency(retail_value)"
    → reveals `product.retail_value` is a real field
{..., context:{purchase_date, product:{retail_value, quantity}}} → 200 OK
```

Confirmed shape for `E3CCM`'s `cse-interview-retail` offer schema:

```json
{
  "customer": { "currency": "USD", "language": "en", "country": "US" },
  "partner": {},
  "context": {
    "purchase_date": "2026-08-13",
    "product": { "retail_value": 1200, "quantity": 1 }
  }
}
```

This is a two-product offer (a "2 Year Plan" and "3 Year Plan" extended-warranty/protection
product — `offer_schema: "cse-interview-retail"`, `policy_code: "CSEINTPR"`, underwriter
"Acasta European Insurance Company Limited") — evidently a schema Cover Genius configured
specifically for this interview exercise, not a generic public offer type.

**quantity confirmed to affect rating**: `quantity: 1` → $663.68 (2yr plan, USD, $1200 retail
value); `quantity: 3` → $1321.95. The scaling isn't linear (≈1.99×, not 3×) — some rating
curve is applied server-side, which is expected and out of scope to reverse-engineer further.

**Still ask Cover Genius**: is there a document describing `E3CCM`'s offer schema(s) so future
work doesn't depend on reverse-engineering 422 responses? What's the actual rating formula
behind `quantity` (useful to explain in the demo beyond "the API applies its own curve")?

## 3. Duplicate-refund avoidance via `refund_required` — inconclusive in this sandbox

CLAUDE.md scope item 6 asks for a demonstration of how duplicate compensation is avoided when
RealCheap issues its own refund. Cancel Booking's `refund_required` field looked like the
obvious mechanism, so it was tested directly: cancelled one booking with
`refund_required: false` and a second, otherwise-identical booking with the field omitted.

**Result**: `refund_amount` / `total_refund` in the response were identical in both cases (see
`fixtures/cancel-booking.json`). No observable behavior difference.

**Why this is inconclusive rather than a real answer**: the cancel response's `partner` object
shows `"xpay_refund_enabled": false` and `"automatic_refund_by_xcore": false` for `E3CCM` —
meaning this sandbox partner has no payout mechanism wired up at all, regardless of
`refund_required`. XCover was never going to execute an automatic payout here, so the flag's
effect (if any) on real payout behavior can't be observed with this partner's current config.
`refund_amount` in the response looks like a calculated entitlement figure for display/
reconciliation purposes, not proof of money movement.

**What this prototype does**: still sets `refund_required: false` on cancellation when the UI
indicates RealCheap already refunded the customer, since it's the only documented field for
this purpose and passes validation — but the Inspector panel and demo narration should be
honest that its actual effect on payout couldn't be confirmed against this sandbox.

**Ask Cover Genius directly**: does `refund_required: false` suppress an XPay-issued refund
when a partner *does* have `xpay_refund_enabled: true`, or does it only affect internal
reconciliation/reporting? Is there a sandbox partner config with automatic refund enabled to
test against?
