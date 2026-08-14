export interface Capture {
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  /** 0 when XCover could not be reached at all — see `networkError`. */
  status: number;
  responseBody: unknown;
  latencyMs: number;
  mock: boolean;
  /** Non-null only when XCover was unreachable (DNS/timeout/refused), distinct from an XCover 4xx/5xx. */
  networkError: string | null;
  /** MOCK_MODE only: non-null when no recorded fixture matched this exact request. */
  mockNote: string | null;
}

export interface OfferProduct {
  id: string;
  name: string;
  details: { finance: { price: { total_amount: number; total_amount_formatted: string } } };
}

export interface OfferResponse {
  id: string;
  currency: string;
  products: OfferProduct[];
  content: {
    heading: string;
    disclaimer: string;
    positive_cta: string;
    negative_cta: string;
    extras: Record<string, string>;
    products: Array<{ id: string; title: string; description: string }>;
  };
}

export interface BookingResponse {
  id: string;
  status: string;
  total_price_formatted: string;
  quotes: Array<{ id: string; status: string }>;
  coi: { url: string };
}

export interface CancellationResponse {
  id: string;
  status: string;
  total_refund_formatted: string;
}

export interface CreateOfferRequest {
  customer: { currency: string; language: string; country: string };
  partner: Record<string, never>;
  context: {
    purchase_date: string;
    product: { retail_value: number; quantity: number };
  };
}

export interface ConfirmOfferRequest {
  quotes: Array<{ id: string }>;
  policyholder: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    country: string;
  };
}

export interface CancelBookingRequest {
  preview: boolean;
  refund_required: boolean;
  quotes: Array<{ id: string; reason_for_cancellation?: string }>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    // The RealCheap server itself is unreachable (not XCover — the proxy
    // always answers 200 with a capture envelope, even when XCover fails).
    // This is a different failure class every caller needs to be able to
    // catch and show, rather than an uncaught rejection.
    throw new Error(
      `Could not reach the RealCheap server: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error(`RealCheap server returned a non-JSON response (HTTP ${res.status}).`);
  }
}

export function createOffer(body: CreateOfferRequest) {
  // offer is null when MOCK_MODE has no recorded fixture for this exact
  // market/quantity combination — see capture.mockNote.
  return postJson<{ offer: OfferResponse | null; capture: Capture }>("/offers", body);
}

export function confirmOffer(offerId: string, body: ConfirmOfferRequest) {
  return postJson<{ booking: BookingResponse; capture: Capture }>(
    `/offers/${offerId}/confirm`,
    body
  );
}

export function optOutOffer(offerId: string) {
  return postJson<{ result: null; capture: Capture }>(`/offers/${offerId}/opt-out`, {});
}

export function cancelBooking(bookingId: string, body: CancelBookingRequest) {
  return postJson<{ cancellation: CancellationResponse; capture: Capture }>(
    `/bookings/${bookingId}/cancel`,
    body
  );
}
