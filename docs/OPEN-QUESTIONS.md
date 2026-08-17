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
specifically for this sandbox account, not a generic public offer type.

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

## 4. Opt Out Offer does not reject an already-confirmed offer

Found during the Session 1.5 capability probe (2026-08-15;
`docs/SANDBOX-CAPABILITIES.md` Probe 5). Called `POST offers/{id}/opt_out/` on an `offer_id`
that had already been Confirmed (booked) in the same run. Expected a 4xx (the offer's already
been decided one way). Got `204 No Content` — the same success response as opting out a
never-touched offer. Reproduced twice: once manually, once via the Postman collection under
Newman (`postman/xcover-realcheap.postman_collection.json`, "Opt Out Offer (Decline)").

**Why this matters**: the response body is empty either way, so there's no way to tell from the
API response whether opt-out on an already-confirmed offer silently no-ops, actually reverses
the booking, or leaves some inconsistent state. RealCheap's frontend already only calls opt-out
from a state where no confirm has happened (a single linear checkout flow — see
`docs/DECISIONS.md`, "Web checkout UI" entry), so this can't be triggered by the built prototype
today, but it means the API itself isn't a safety net if a future integration called both.

**Ask Cover Genius directly**: what does opt-out on an already-confirmed offer actually do
server-side — no-op, reversal, or something else? Should partners guard against calling it
post-confirm themselves, or is this expected to be safe/idempotent by design?

## 5. Italy prices its 3-year plan higher than its 2-year plan; every other market is the reverse

Found during the Session 1.5 market sweep (`docs/SANDBOX-CAPABILITIES.md` Probe 3). Same
`retail_value`/`quantity`/`purchase_date` quoted for all 7 markets: in every market except IT,
the 3-year plan is cheaper than the 2-year plan (as you'd expect — more time to spread the
premium). In IT it's the other way around (€360.44 for 3yr vs €336.77 for 2yr,
`fixtures/probe/market-IT.json`). Not investigated further — could be a real Italy-specific
underwriting input or a sandbox data quirk for this offer config.

**Ask Cover Genius directly**: is the IT 3yr > 2yr pricing intentional (a real rating input for
that market), or a configuration issue in this sandbox's `cse-interview-retail` offer config?

**Related, found during Phase 2** (2026-08-15): the ordering isn't fixed per market either — at
`quantity: 1` the US prices 2yr above 3yr ($585.85 vs $532.29, normal ordering), but at
`quantity: 3` that flips too ($1139.94 vs $1244.48, `fixtures/markets/create-offer-US-qty3.json`).
So this isn't "Italy is special," it's "the 2yr/3yr ordering isn't stable across market or
quantity" — consistent with an underlying rating curve neither market nor quantity alone
explains, which is exactly the kind of thing not to reverse-engineer further per scope.

## 6. Outbound call timeout (10s) is an assumption, not a documented value

Added during Phase 1 hardening (2026-08-15). `server/src/xcoverClient.ts` now aborts an outbound
XCover call after 10 seconds (`// ASSUMPTION:` comment at `XCOVER_TIMEOUT_MS`). Checked
`offers/api/reference.md` directly for a published SLA or recommended client timeout — none
exists. 10s was chosen from observed live latency only: ~230ms-2.8s across ~30 calls made during
the build and Session 1.5 probe, so 10s is >3x the worst observed call. If XCover's real p99
latency under load is close to or above 10s, this value would misclassify a merely-slow call as
"unreachable" rather than waiting it out — cheap to change (one constant) if that's wrong.

**Ask Cover Genius directly**: is there a published or recommended client-side timeout for the
Offers/Bookings API? Is 10s reasonable, or does typical p99 latency run close to it?

## To send to Cover Genius

- Is the `authentication.md` SHA-512 guidance authoritative, or does the "HMAC-SHA256" wording
  on the Create/Confirm Offer reference pages apply to some partners/configs? (#1)
- Is there a document describing `E3CCM`'s `cse-interview-retail` offer schema and its rating
  curve, so this doesn't have to be reverse-engineered from 422s again? (#2)
- Does `refund_required: false` on Cancel Booking actually suppress an XPay payout for a partner
  with `xpay_refund_enabled: true`? Is there a sandbox partner with that enabled to test against?
  (#3)
- Does Opt Out Offer on an already-confirmed offer do anything server-side, and should partners
  guard against calling it post-confirm? (#4)
- Is IT's 3yr-more-expensive-than-2yr pricing intentional, or a config issue in this offer
  config? (#5)
- Is there a published or recommended client-side timeout for the Offers/Bookings API? (#6)

Kept short on purpose — everything else needed for the build was answered empirically against
the live sandbox (see `docs/SANDBOX-CAPABILITIES.md`).
