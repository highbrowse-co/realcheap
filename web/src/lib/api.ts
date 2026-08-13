export interface Capture {
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  status: number;
  responseBody: unknown;
  latencyMs: number;
  mock: boolean;
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
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

export function createOffer(body: CreateOfferRequest) {
  return postJson<{ offer: OfferResponse; capture: Capture }>("/offers", body);
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
