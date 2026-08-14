# Demo script

A live walkthrough, in click order, of what this prototype actually does. Total run time
~6-8 minutes at a normal pace, live against the sandbox. Each step names the point it's making —
say that point out loud, don't just click.

Before starting: confirm `.env` has real credentials and `MOCK_MODE=false`, `npm run dev`
running, `http://localhost:5173` open. If credentials aren't available or the room's network is
unreliable, see **Fallback** at the bottom — switch `MOCK_MODE=true` and restart; nothing else
changes.

## 1. Orient (30s)

Point at the two columns: checkout on the left, Inspector on the right. **Point**: the Inspector
is not a debug tool bolted on afterward — it's how you verify every claim in this demo is a real
call, not a scripted response. Nothing shown for the rest of the demo should be taken on faith;
it's all inspectable on the right.

## 2. Product and market (15s)

Point at the laptop (hardcoded — one product, per scope) and the market dropdown (7 countries).
**Point**: `customer.currency`/`customer.country` in the eventual request come directly from
this selector — RealCheap's own store config, XCover just receives whichever ISO codes are sent.

## 3. Get a protection offer — US, quantity 1 (~1-3s live) (30s)

Click **Get protection offer**. Wait for the offer card. **Point**: this is a live, signed
`POST /offers/` call — open the top Inspector entry now and show: real HMAC-SHA512 signature
(redacted, but visibly present and different every call — the `Date` header changes each time),
the exact request body, and the response's `content.extras` copy ("Breakdowns," "Accidental
Damage," "Cash Refund") — that copy is coming from the API, not hardcoded marketing text.

## 4. Switch market to a non-USD one, e.g. Germany (~1-3s live) (30s)

Change the dropdown to Germany, click **Get protection offer** again. **Point**: the new offer
prices in EUR, and — worth saying explicitly — the price is *not* just a currency conversion of
the US price; XCover rates each market independently (see `docs/SANDBOX-CAPABILITIES.md` Probe
3 if asked why). Show the Inspector entry: `customer.country: "DE"` in the request, EUR pricing
in the response.

## 5. Change quantity to 3 (~1-3s live) (20s)

Bump quantity to 3, refetch. **Point**: `context.product.quantity` drives rating, confirmed
non-linear (roughly 2x for 3x the units, not 3x) — the API applies its own curve, which is
intentionally left as a black box rather than reverse-engineered.

## 6. Opt in (~1-2s live) (45s)

Pick the 2-year plan, leave the pre-filled policyholder fields (or edit them live — they're
real, editable form fields, not display-only), click the positive CTA. **Point**: this creates a
**real booking** in the sandbox — read out the booking ID and note it's a genuine XCover policy,
with a live Certificate of Insurance link. Open the Inspector entry for Confirm Offer and show
`status: CONFIRMED`.

## 7. Cancellation, with the duplicate-compensation angle (~1-2s live) (45s)

Check **"RealCheap already refunded this customer directly"**, click **Cancel booking**.
**Point, stated honestly**: this sets `refund_required: false` on Cancel Booking — the
documented mechanism for telling XCover a payout shouldn't happen because RealCheap already
made the customer whole. Say plainly that this sandbox partner has no payout mechanism enabled
(`xpay_refund_enabled: false`), so the *effect* of that flag on an actual payout couldn't be
observed here — `docs/OPEN-QUESTIONS.md` #3 has the full reasoning. Don't oversell this one.

## 8. Decline path, different market (~1-3s live) (30s)

Switch market again (e.g. France), fetch a fresh offer, click the negative CTA. **Point**: this
is a real `opt_out` call — `204 No Content`, no body, confirmed via the Inspector's status badge
and the (empty) response section. Mention, if there's time and it fits the audience: opting out
an offer that's *already* been confirmed also returns `204` rather than an error — an
undocumented, slightly surprising finding, in `docs/OPEN-QUESTIONS.md` #4.

## 9. Fail-open, on purpose (~10-15s to demonstrate) (45s)

This is the strongest moment in the demo — don't skip it if time allows. Explain the principle
first: *"RealCheap's checkout must complete even when XCover is entirely unavailable — protection
is ancillary, revenue can't depend on our uptime."* Then either:

- **If comfortable improvising**: briefly edit `.env`'s `XCOVER_API_DOMAIN` to something
  unreachable, restart the server, click **Get protection offer**, and narrate the ~timeout while
  it happens (up to 10s — mention the timeout value and that it's an assumption, not a
  documented SLA, `docs/API-NOTES.md`). Show the error, the amber "UNREACHABLE" badge in the
  Inspector, and click **Continue checkout without protection** — the order still completes.
  Restore `.env` afterward.
- **Lower-risk alternative**: skip the live break and instead open
  `docs/ARCHITECTURE.md`'s "Failure handling" section and narrate that this was verified by
  deliberately breaking it four ways (unresolvable host, timeout, malformed body, a real 500),
  screenshotted, and documented in `docs/DECISIONS.md`'s Phase 1 and Phase 4 entries.

## 10. Close (30s)

Point at the docs, don't read them aloud: `docs/DECISIONS.md` (every non-obvious choice, with
what the model got wrong and how it was caught — the Phase 4/5 entries are good examples),
`docs/OPEN-QUESTIONS.md` (what's still genuinely ambiguous), `docs/SANDBOX-CAPABILITIES.md`
(what this specific account can and can't do, confirmed vs. assumed), and the Postman collection
(`postman/`) as a standalone artifact a partner engineer could pick up independently.

## Fallback: sandbox slow or down

Nothing about the demo needs to stop. `MOCK_MODE=true` in `.env`, restart `npm run dev` — no
code change. All 35 market×quantity combinations used in steps 3-8 above have a real, previously
recorded fixture (`fixtures/markets/`), so the numbers shown are genuine past sandbox responses,
not fabricated — say so explicitly ("this is MOCK_MODE — real recorded data, not live, because
[reason]") rather than let the Inspector's "MOCK_MODE" label speak for itself; a technical panel
will read it either way, better to have said it first. Step 9 (fail-open) still works identically
in MOCK_MODE for a combination with no recorded fixture (e.g. quantity 1 with an unlisted
market/quantity pairing isn't possible now that all 35 are recorded — instead trigger it by
picking a retail value or quantity outside the demo UI's range via the Inspector's captured
request, or just narrate step 9's "lower-risk alternative" instead).
