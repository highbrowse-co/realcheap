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
behind `quantity` (useful to be able to explain beyond "the API applies its own curve")?

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
this purpose and passes validation — but the Inspector panel and any accompanying explanation
should be honest that its actual effect on payout couldn't be confirmed against this sandbox.

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

## 5. The 2-year/3-year price ordering is not stable across market or quantity

Originally recorded (Session 1.5 market sweep, qty 1 only) as "Italy is the one market where the
3-year plan costs more than the 2-year plan; every other market has the reverse." That framing
doesn't hold once quantity is varied too — corrected here after building the full 7 markets × 5
quantities table (all 35 real captures, `fixtures/markets/create-offer-{market}[-qty{n}].json`)
rather than trusting the single-quantity snapshot that produced the original claim:

| Market | qty1 | qty2 | qty3 | qty4 | qty5 |
|---|---|---|---|---|---|
| US | 2yr > 3yr | 2yr > 3yr | 2yr < 3yr | 2yr < 3yr | 2yr > 3yr |
| CA | 2yr > 3yr | 2yr > 3yr | 2yr > 3yr | 2yr < 3yr | 2yr < 3yr |
| GB | 2yr > 3yr | 2yr < 3yr | 2yr < 3yr | 2yr > 3yr | 2yr < 3yr |
| IT | 2yr < 3yr | 2yr > 3yr | 2yr > 3yr | 2yr > 3yr | 2yr > 3yr |
| FR | 2yr > 3yr | 2yr < 3yr | 2yr < 3yr | 2yr < 3yr | 2yr < 3yr |
| ES | 2yr > 3yr | 2yr < 3yr | 2yr < 3yr | 2yr > 3yr | 2yr < 3yr |
| DE | 2yr > 3yr | 2yr > 3yr | 2yr < 3yr | 2yr < 3yr | 2yr < 3yr |

("2yr > 3yr" means the 2-year plan's total price is higher than the 3-year plan's — e.g. US at
qty1: 2-year US$585.85, 3-year US$532.29. At qty3 the same market shows the reverse: 2-year
US$1,139.94, 3-year US$1,244.48.)

**What this rules out**: it isn't market-specific (every one of the 7 markets shows both orderings
at different quantities — IT is not uniquely inverted, it's just the only market where qty1
happened to show the less-common ordering) and it isn't a single quantity threshold either (no
market flips exactly once and stays flipped — most flip back and forth as quantity increases,
e.g. GB: >,<,<,>,< across qty 1–5). Whatever determines the ordering, it isn't simply "market" or
"quantity" in isolation.

**What this doesn't rule out**: a real, deliberate rate table where each market/quantity/plan-
length combination is priced independently (which the pricing separately being confirmed
non-linear per quantity, `docs/OPEN-QUESTIONS.md` #2, is consistent with) — a genuinely granular
rate table could produce exactly this kind of pattern with no bug involved, or it could be a
sandbox data-quality artifact for this specific offer config. Both are plausible; this document
doesn't take a position on which, per this project's own instruction not to guess.

**Ask Cover Genius directly**: is the 2-year/3-year ordering meant to vary independently by
market and quantity, or is there an intended monotonic relationship (longer plan always cheaper,
or always more expensive) that this sandbox's rate table isn't currently producing?

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
- Is the 2-year/3-year plan price ordering meant to vary independently by market and quantity,
  or should it be monotonic? (#5)
- Is there a published or recommended client-side timeout for the Offers/Bookings API? (#6)

Kept short on purpose — everything else needed for the build was answered empirically against
the live sandbox (see `docs/SANDBOX-CAPABILITIES.md`).
