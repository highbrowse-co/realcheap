/**
 * Shapes confirmed against the live E3CCM sandbox (see docs/OPEN-QUESTIONS.md #2) —
 * trimmed to the fields this app actually reads. The full raw response is still
 * shown as-is in the Inspector panel via Capture.responseBody.
 */

export interface CreateOfferRequest {
  customer: { currency: string; language: string; country: string };
  partner: Record<string, never>;
  context: {
    purchase_date: string;
    product: { retail_value: number; quantity: number };
  };
}

export interface OfferProduct {
  id: string;
  name: string;
  details: {
    finance: {
      price: { total_amount: number; total_amount_formatted: string };
    };
  };
}

export interface CreateOfferResponse {
  id: string;
  currency: string;
  products: OfferProduct[];
  content: {
    title: string;
    heading: string;
    disclaimer: string;
    positive_cta: string;
    negative_cta: string;
    extras: Record<string, string>;
    products: Array<{ id: string; title: string; description: string }>;
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

export interface ConfirmOfferResponse {
  id: string;
  status: string;
  currency: string;
  total_price: number;
  total_price_formatted: string;
  quotes: Array<{ id: string; status: string; price: number }>;
  coi: { url: string; pdf: string };
}

export interface CancelBookingRequest {
  preview?: boolean;
  refund_required?: boolean;
  quotes: Array<{ id: string; reason_for_cancellation?: string }>;
}

export interface CancelBookingResponse {
  id: string;
  status: string;
  total_refund: number;
  total_refund_formatted: string;
  cancellation_id: string | null;
}
