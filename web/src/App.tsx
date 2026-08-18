import { useState } from "react";
import { MARKETS, type Market } from "./lib/markets";
import { LAPTOP } from "./lib/product";
import {
  cancelBooking,
  confirmOffer,
  createOffer,
  optOutOffer,
  type BookingResponse,
  type CancellationResponse,
  type OfferResponse,
} from "./lib/api";
import { Inspector, type CaptureEntry } from "./components/Inspector";
import { sanitizeHtml } from "./lib/sanitizeHtml";

// "unprotected" is reached when Create Offer fails and the customer chooses to
// continue anyway — the fail-open path (docs/ARCHITECTURE.md): RealCheap's
// checkout must complete even when XCover is entirely unavailable.
type Decision = "pending" | "confirmed" | "declined" | "unprotected";

// content.sub_heading is currently the literal string "N/A" on every captured
// response (fixtures/markets/*.json) — the schema returns it that way rather
// than omitting it, so an absence/empty check alone isn't enough.
function isUsableText(value: string | undefined): value is string {
  return !!value && value.trim() !== "" && value.trim().toUpperCase() !== "N/A";
}

function hasEntries(value: Record<string, string> | undefined): value is Record<string, string> {
  return !!value && Object.keys(value).length > 0;
}

export function App() {
  const [market, setMarket] = useState<Market>(MARKETS[0]);
  const [quantity, setQuantity] = useState(1);

  const [offer, setOffer] = useState<OfferResponse | null>(null);
  const [offerLoading, setOfferLoading] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const [policyholder, setPolicyholder] = useState({
    first_name: "Jamie",
    last_name: "Rivera",
    email: "jamie.rivera@example.com",
    phone: "+14155550100",
  });

  const [decision, setDecision] = useState<Decision>("pending");
  const [booking, setBooking] = useState<BookingResponse | null>(null);
  const [alreadyRefunded, setAlreadyRefunded] = useState(false);
  const [cancellation, setCancellation] = useState<CancellationResponse | null>(null);

  // Errors from opt-in/decline/cancel — distinct from offerError (Create
  // Offer), since those three actions previously did nothing visible on
  // failure: no state change, no message, just a dead click.
  const [actionError, setActionError] = useState<string | null>(null);

  // Break-testing (docs/REACHABLE-STATES.md #2) found a rapid double-click on
  // Opt-in/Decline/Cancel fired two real signed requests, silently in
  // MOCK_MODE. This disables all three while any one is outstanding —
  // additive, not a change to what state the flow can be in.
  const [actionPending, setActionPending] = useState(false);

  // One x-idempotency-key per fetched offer (offers/api/idempotency-keys.md),
  // reused for every confirm attempt on that offer so a retry after a
  // network timeout — not just a double-click — is safe: XCover returns the
  // cached original booking (409) for a resend instead of a second one. A
  // disabled button can't protect a request that's already in flight when
  // the network drops; this is the mechanism that actually can.
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  const [entries, setEntries] = useState<CaptureEntry[]>([]);
  const addEntry = (label: string, capture: CaptureEntry["capture"]) =>
    setEntries((prev) => [...prev, { label, capture }]);

  function resetOffer() {
    setOffer(null);
    setOfferError(null);
    setSelectedProductId(null);
    setDecision("pending");
    setBooking(null);
    setCancellation(null);
    setActionError(null);
    setIdempotencyKey(null);
  }

  function handleMarketChange(country: string) {
    setMarket(MARKETS.find((m) => m.country === country)!);
    resetOffer();
  }

  function handleQuantityChange(value: number) {
    setQuantity(Math.max(1, Math.min(5, value)));
    resetOffer();
  }

  async function fetchOffer() {
    setOfferLoading(true);
    setOfferError(null);
    try {
      const { offer, capture } = await createOffer({
        customer: { currency: market.currency, language: market.language, country: market.country },
        partner: {},
        context: {
          purchase_date: new Date().toISOString().slice(0, 10),
          product: { retail_value: LAPTOP.retailValue, quantity },
        },
      });
      addEntry("Create Offer", capture);
      if (capture.networkError) {
        setOfferError(
          `Could not reach XCover (${capture.networkError}). You can still complete checkout without protection below.`
        );
        return;
      }
      if (capture.mockNote) {
        // MOCK_MODE has no fixture recorded for this exact market/quantity —
        // honest about the gap rather than showing a price that isn't real
        // for what was actually asked (see xcoverClient.ts mockedCreateOffer).
        setOfferError(
          `MOCK_MODE: ${capture.mockNote} You can still continue without protection below, or pick a recorded combination.`
        );
        return;
      }
      if (capture.status >= 400 || !offer) {
        setOfferError(
          `XCover returned ${capture.status} — see Inspector for details. You can still complete checkout without protection below.`
        );
        return;
      }
      setOffer(offer);
      setIdempotencyKey(crypto.randomUUID());
    } catch (err) {
      // postJson throws for a failure that never reached our own server at
      // all (browser-level network error). Same fail-open outcome as an
      // XCover-side failure: the customer must still be able to check out.
      setOfferError(
        `${err instanceof Error ? err.message : "Unexpected error"} — you can still complete checkout without protection below.`
      );
    } finally {
      setOfferLoading(false);
    }
  }

  // Fail-open path: Create Offer failed for any reason (XCover down, XCover
  // rejected the request, or our own server unreachable). Protection is
  // ancillary — the purchase itself must not be blocked by it.
  function handleContinueWithoutProtection() {
    setDecision("unprotected");
  }

  async function handleOptIn() {
    if (!offer || !selectedProductId || actionPending) return;
    setActionError(null);
    setActionPending(true);
    try {
      const key = idempotencyKey ?? crypto.randomUUID();
      const confirmBody = {
        quotes: [{ id: selectedProductId }],
        policyholder: { ...policyholder, country: market.country },
      };
      let { booking, capture } = await confirmOffer(offer.id, confirmBody, key);
      addEntry("Confirm Offer (opt-in)", capture);

      // 423: XCover is still processing an identical in-flight request for
      // this same key — documented as transient, safe to retry once with
      // the same key rather than surfaced as an error.
      if (capture.status === 423) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        ({ booking, capture } = await confirmOffer(offer.id, confirmBody, key));
        addEntry("Confirm Offer (opt-in, retry after 423)", capture);
      }

      if (capture.networkError) {
        setActionError(`Could not reach XCover (${capture.networkError}). Protection was not confirmed — try again.`);
        return;
      }
      // 409: the identical key+body was already processed — XCover returns
      // the cached original booking in the body. Documented as the
      // "treat as success" response, not an error to route around.
      if (capture.status >= 400 && capture.status !== 409) {
        setActionError(`XCover rejected the confirmation (${capture.status}) — see Inspector for details.`);
        return;
      }
      setBooking(booking);
      setDecision("confirmed");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unexpected error confirming protection.");
    } finally {
      setActionPending(false);
    }
  }

  async function handleDecline() {
    if (!offer || actionPending) return;
    setActionError(null);
    setActionPending(true);
    try {
      const { capture } = await optOutOffer(offer.id);
      addEntry("Opt-out Offer (decline)", capture);
      if (capture.networkError) {
        setActionError(`Could not reach XCover (${capture.networkError}) to record the decline — try again.`);
        return;
      }
      if (capture.status >= 400) {
        setActionError(`XCover rejected the decline (${capture.status}) — see Inspector for details.`);
        return;
      }
      setDecision("declined");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unexpected error recording the decline.");
    } finally {
      setActionPending(false);
    }
  }

  async function handleCancel() {
    if (!booking || actionPending) return;
    setActionError(null);
    setActionPending(true);
    try {
      const { cancellation, capture } = await cancelBooking(booking.id, {
        preview: false,
        refund_required: !alreadyRefunded,
        quotes: booking.quotes.map((q) => ({
          id: q.id,
          reason_for_cancellation: alreadyRefunded
            ? "RealCheap issued its own refund"
            : "Customer requested cancellation",
        })),
      });
      addEntry("Cancel Booking", capture);
      if (capture.networkError) {
        setActionError(`Could not reach XCover (${capture.networkError}). Booking was not cancelled — try again.`);
        return;
      }
      if (capture.status >= 400) {
        setActionError(`XCover rejected the cancellation (${capture.status}) — see Inspector for details.`);
        return;
      }
      setCancellation(cancellation);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unexpected error cancelling the booking.");
    } finally {
      setActionPending(false);
    }
  }

  const subtotal = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: market.currency,
  }).format(LAPTOP.retailValue * quantity);

  const selectedProduct = offer?.products.find((p) => p.id === selectedProductId);

  return (
    <div className="page">
      <header>
        <h1>RealCheap</h1>
        <p className="muted">XCover protection demo checkout</p>
      </header>

      <main>
        <div className="checkout-column">
          <section>
            <h2>Product</h2>
            <div className="product-card">
              <strong>{LAPTOP.name}</strong>
              <p className="muted">{LAPTOP.description}</p>
              <div className="row">
                <label>
                  Ship to
                  <select
                    value={market.country}
                    onChange={(e) => handleMarketChange(e.target.value)}
                  >
                    {MARKETS.map((m) => (
                      <option key={m.country} value={m.country}>
                        {m.label} ({m.currency})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Quantity
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={quantity}
                    onChange={(e) => handleQuantityChange(Number(e.target.value))}
                  />
                </label>
              </div>
              <p>Subtotal: {subtotal}</p>
            </div>
          </section>

          <section>
            <h2>Protection</h2>
            {!offer && decision !== "unprotected" && (
              <button onClick={fetchOffer} disabled={offerLoading}>
                {offerLoading ? "Loading offer..." : "Get protection offer"}
              </button>
            )}
            {offerError && decision !== "unprotected" && (
              <div>
                <p className="error">{offerError}</p>
                {/* Fail-open: protection is ancillary — a broken or unreachable
                    XCover must never block the purchase itself. */}
                <button className="secondary" onClick={handleContinueWithoutProtection}>
                  Continue checkout without protection
                </button>
              </div>
            )}

            {decision === "unprotected" && (
              <p>
                Order placed without protection — XCover's offer could not be retrieved this time.
                This purchase is not covered. ({offerError})
              </p>
            )}

            {offer && decision === "pending" && (
              <div className="offer-card">
                <p className="offer-heading">{offer.content.heading}</p>

                {hasEntries(offer.content.extras) && (
                  <ul className="extras-list">
                    {Object.entries(offer.content.extras).map(([name, description]) => (
                      <li key={name}>
                        <strong>{name}</strong> {description}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="plan-list">
                  {offer.products.map((product) => {
                    const content = offer.content.products.find((p) => p.id === product.id);
                    const selected = selectedProductId === product.id;
                    return (
                      <label key={product.id} className={`plan-option${selected ? " selected" : ""}`}>
                        <input
                          type="radio"
                          name="plan"
                          checked={selected}
                          onChange={() => setSelectedProductId(product.id)}
                        />
                        <span className="plan-name">{content?.title ?? product.name}</span>
                        <span className="plan-price">
                          {product.details.finance.price.total_amount_formatted}
                        </span>
                      </label>
                    );
                  })}
                </div>

                {selectedProduct && (
                  <p className="total-line">
                    {LAPTOP.name} {subtotal} + Protection{" "}
                    {selectedProduct.details.finance.price.total_amount_formatted} ={" "}
                    <strong>
                      {new Intl.NumberFormat(undefined, {
                        style: "currency",
                        currency: offer.currency,
                      }).format(
                        LAPTOP.retailValue * quantity + selectedProduct.details.finance.price.total_amount
                      )}
                    </strong>
                  </p>
                )}

                {isUsableText(offer.content.credibility_message) && (
                  <p className="muted small credibility">{offer.content.credibility_message}</p>
                )}

                {isUsableText(offer.content.disclaimer_html) ? (
                  <div
                    className="muted small"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(offer.content.disclaimer_html!) }}
                  />
                ) : (
                  isUsableText(offer.content.disclaimer) && (
                    <p className="muted small">{offer.content.disclaimer}</p>
                  )
                )}

                {selectedProductId && (
                  <fieldset>
                    <legend>Policyholder</legend>
                    <div className="row">
                      <input
                        placeholder="First name"
                        value={policyholder.first_name}
                        onChange={(e) =>
                          setPolicyholder({ ...policyholder, first_name: e.target.value })
                        }
                      />
                      <input
                        placeholder="Last name"
                        value={policyholder.last_name}
                        onChange={(e) =>
                          setPolicyholder({ ...policyholder, last_name: e.target.value })
                        }
                      />
                    </div>
                    <div className="row">
                      <input
                        className="wide"
                        placeholder="Email"
                        value={policyholder.email}
                        onChange={(e) =>
                          setPolicyholder({ ...policyholder, email: e.target.value })
                        }
                      />
                      <input
                        placeholder="Phone"
                        value={policyholder.phone}
                        onChange={(e) =>
                          setPolicyholder({ ...policyholder, phone: e.target.value })
                        }
                      />
                    </div>
                  </fieldset>
                )}

                {actionError && <p className="error">{actionError}</p>}
                <div className="row cta-row">
                  <div className="cta-group">
                    <button onClick={handleOptIn} disabled={!selectedProductId || actionPending}>
                      {offer.content.positive_cta}
                    </button>
                    {!selectedProductId && isUsableText(offer.content.required_message) && (
                      <p className="muted small">{offer.content.required_message}</p>
                    )}
                  </div>
                  <div className="cta-group">
                    <button className="secondary" onClick={handleDecline} disabled={actionPending}>
                      {offer.content.negative_cta}
                    </button>
                    {isUsableText(offer.content.negative_cta_warning) && (
                      <p className="muted small">{offer.content.negative_cta_warning}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {decision === "declined" && <p>Customer declined protection. Recorded with XCover.</p>}

            {decision === "confirmed" && booking && (
              <div className="offer-card">
                <p>
                  Protection confirmed — booking <strong>{booking.id}</strong> (
                  {booking.status}), {booking.total_price_formatted}.
                </p>
                <a href={booking.coi.url} target="_blank" rel="noreferrer">
                  Certificate of Insurance
                </a>

                {!cancellation && (
                  <div className="cancel-box">
                    <h3>Cancellation demo</h3>
                    <label>
                      <input
                        type="checkbox"
                        checked={alreadyRefunded}
                        onChange={(e) => setAlreadyRefunded(e.target.checked)}
                      />
                      RealCheap already refunded this customer directly
                    </label>
                    <button onClick={handleCancel} disabled={actionPending}>Cancel booking</button>
                    <p className="muted small">
                      Sets <code>refund_required: {String(!alreadyRefunded)}</code> on Cancel
                      Booking. See docs/OPEN-QUESTIONS.md for what this sandbox could and
                      couldn't confirm about that field's effect on payout.
                    </p>
                    {actionError && <p className="error">{actionError}</p>}
                  </div>
                )}

                {cancellation && (
                  <p>
                    Booking {cancellation.status.toLowerCase()} — refund on record:{" "}
                    {cancellation.total_refund_formatted}.
                  </p>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="inspector-column">
          <Inspector entries={entries} />
        </div>
      </main>
    </div>
  );
}
