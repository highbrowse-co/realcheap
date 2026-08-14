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

// "unprotected" is reached when Create Offer fails and the customer chooses to
// continue anyway — the fail-open path (docs/ARCHITECTURE.md): RealCheap's
// checkout must complete even when XCover is entirely unavailable.
type Decision = "pending" | "confirmed" | "declined" | "unprotected";

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
  }

  async function handleMarketChange(country: string) {
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
      if (capture.status >= 400) {
        setOfferError(
          `XCover returned ${capture.status} — see Inspector for details. You can still complete checkout without protection below.`
        );
        return;
      }
      setOffer(offer);
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
    if (!offer || !selectedProductId) return;
    setActionError(null);
    try {
      const { booking, capture } = await confirmOffer(offer.id, {
        quotes: [{ id: selectedProductId }],
        policyholder: { ...policyholder, country: market.country },
      });
      addEntry("Confirm Offer (opt-in)", capture);
      if (capture.networkError) {
        setActionError(`Could not reach XCover (${capture.networkError}). Protection was not confirmed — try again.`);
        return;
      }
      if (capture.status >= 400) {
        setActionError(`XCover rejected the confirmation (${capture.status}) — see Inspector for details.`);
        return;
      }
      setBooking(booking);
      setDecision("confirmed");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unexpected error confirming protection.");
    }
  }

  async function handleDecline() {
    if (!offer) return;
    setActionError(null);
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
    }
  }

  async function handleCancel() {
    if (!booking) return;
    setActionError(null);
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
    }
  }

  const subtotal = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: market.currency,
  }).format(LAPTOP.retailValue * quantity);

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
                <p>{offer.content.heading}</p>
                {offer.products.map((product) => {
                  const content = offer.content.products.find((p) => p.id === product.id);
                  return (
                    <label key={product.id} className="plan-option">
                      <input
                        type="radio"
                        name="plan"
                        checked={selectedProductId === product.id}
                        onChange={() => setSelectedProductId(product.id)}
                      />
                      {content?.title ?? product.name} —{" "}
                      {product.details.finance.price.total_amount_formatted}
                    </label>
                  );
                })}
                <p className="muted small">{offer.content.disclaimer}</p>

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

                {actionError && <p className="error">{actionError}</p>}
                <div className="row">
                  <button onClick={handleOptIn} disabled={!selectedProductId}>
                    {offer.content.positive_cta}
                  </button>
                  <button className="secondary" onClick={handleDecline}>
                    {offer.content.negative_cta}
                  </button>
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
                    <button onClick={handleCancel}>Cancel booking</button>
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
