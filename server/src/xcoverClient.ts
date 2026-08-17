// This module exists because the whole reason a backend proxy is here at all:
// XCover's HMAC auth needs the raw API secret to sign every request, and that
// secret must never reach the browser (CLAUDE.md hard constraint 1). Every
// function below runs server-side only; the frontend never imports this file
// or sees XCOVER_API_KEY/XCOVER_API_SECRET in any form, only the already-
// redacted `Capture` objects these functions return.
import { buildAuthorizationHeader, rfc822Date } from "./signing.js";
import { config } from "./config.js";
import { findMarketProductById, listFixtureKeys, loadFixture } from "./fixtures.js";
import type {
  CreateOfferRequest,
  CreateOfferResponse,
  ConfirmOfferRequest,
  ConfirmOfferResponse,
  CancelBookingRequest,
  CancelBookingResponse,
} from "./xcoverTypes.js";

/** Everything the Inspector panel needs to show a call was real. */
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
  /**
   * Non-null only when the request never got an HTTP response from XCover at
   * all — DNS failure, connection refused, or our own timeout. Distinct from
   * XCover returning a 4xx/5xx, which is a normal `status`/`responseBody`
   * pair. The frontend and Inspector both branch on this to tell "XCover said
   * no" apart from "XCover was unreachable".
   */
  networkError: string | null;
  /**
   * MOCK_MODE only. Non-null when no recorded fixture matches this specific
   * request (e.g. a market/quantity combination that was never captured
   * live) — the response is a stand-in, not a real quote for what was asked.
   * The frontend must show this rather than let a mismatched price look
   * real. Always null in live mode.
   */
  mockNote: string | null;
}

// ASSUMPTION: 10s outbound timeout. The partner docs (offers/api/reference.md)
// state no published SLA or recommended client timeout — checked directly,
// not guessed. Observed live latency across ~30 sandbox calls (this build +
// the Session 1.5 probe) ranged ~230ms-2.8s. 10s gives >3x headroom over the
// worst observed call while still bounding how long a demo can hang before
// the fail-open path kicks in. If XCover's real p99 exceeds this under load,
// lower confidence in "unreachable" classifications for calls that were
// merely slow, not actually down — logged in docs/OPEN-QUESTIONS.md.
const XCOVER_TIMEOUT_MS = 10_000;

export interface XCoverResult<T> {
  data: T;
  capture: Capture;
}

function urlFor(path: string): string {
  return `${config.xcover.domain}${config.xcover.basePath}${config.xcover.partnerCode}/${path}`;
}

async function request<TReq, TRes>(
  method: string,
  path: string,
  body: TReq,
  extraHeaders?: Record<string, string>
): Promise<XCoverResult<TRes>> {
  const url = urlFor(path);
  const date = rfc822Date(new Date());
  const authorization = buildAuthorizationHeader(
    config.xcover.apiKey,
    config.xcover.apiSecret,
    date
  );
  const requestHeaders = {
    "Content-Type": "application/json",
    Date: date,
    "X-Api-Key": config.xcover.apiKey,
    Authorization: authorization,
    ...extraHeaders,
  };

  const start = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), XCOVER_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: requestHeaders,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    // XCover was never reached at all — DNS failure, connection refused,
    // or our own abort() firing on timeout. This is not an XCover error
    // response; there is no status code or body to show for it.
    const latencyMs = Math.round(performance.now() - start);
    const isAbort = err instanceof Error && err.name === "AbortError";
    // Node's fetch wraps the real reason in `.cause` and leaves `.message` as
    // the generic "fetch failed" — caught by actually triggering this path
    // (an unresolvable host) and seeing an uninformative message in the
    // Inspector, not by reading the fetch() types.
    const cause =
      err instanceof Error && err.cause instanceof Error ? `: ${err.cause.message}` : "";
    const networkError = isAbort
      ? `timed out after ${XCOVER_TIMEOUT_MS}ms`
      : err instanceof Error
        ? `${err.message}${cause}`
        : String(err);
    return {
      data: null as TRes,
      capture: {
        method,
        url,
        requestHeaders: redactHeaders(requestHeaders),
        requestBody: body,
        status: 0,
        responseBody: null,
        latencyMs,
        mock: false,
        networkError,
        mockNote: null,
      },
    };
  } finally {
    clearTimeout(timeout);
  }

  const latencyMs = Math.round(performance.now() - start);
  const text = await res.text();
  // A non-2xx from an upstream gateway (not XCover itself) could return HTML
  // or plain text instead of JSON. That's still a real response — status and
  // latency are meaningful — so this must not throw; it degrades to showing
  // the raw text instead of a parsed body.
  let responseBody: unknown = null;
  if (text) {
    try {
      responseBody = JSON.parse(text);
    } catch {
      responseBody = { _rawBody: text.slice(0, 2000), _parseError: "response was not valid JSON" };
    }
  }

  return {
    data: responseBody as TRes,
    capture: {
      method,
      url,
      requestHeaders: redactHeaders(requestHeaders),
      requestBody: body,
      status: res.status,
      responseBody,
      latencyMs,
      mock: false,
      networkError: null,
      mockNote: null,
    },
  };
}

function mockRequestHeaders(): Record<string, string> {
  return redactHeaders({
    "Content-Type": "application/json",
    Date: rfc822Date(new Date()),
    "X-Api-Key": config.xcover.apiKey || "mock-key",
    Authorization:
      'Signature keyId="mock-key",algorithm="hmac-sha512",signature="mock-signature"',
  });
}

async function mocked<TRes>(
  method: string,
  path: string,
  body: unknown,
  fixtureName: string,
  status: number
): Promise<XCoverResult<TRes>> {
  const data =
    status === 204 ? (null as TRes) : await loadFixture<TRes>(fixtureName);
  return {
    data,
    capture: {
      method,
      url: urlFor(path),
      requestHeaders: mockRequestHeaders(),
      requestBody: body,
      status,
      responseBody: data,
      latencyMs: 0,
      mock: true,
      networkError: null,
      mockNote: null,
    },
  };
}

// The single static create-offer.json fixture (still used as-is) made every
// market/quantity combination render identical USD pricing in MOCK_MODE while
// the Inspector showed the request correctly varying — a contradiction a
// panel would notice immediately in a fallback demo. This selects a fixture
// recorded live for the actual country + quantity instead. Still just
// replaying captured traffic (fixtures/probe/market-*.json, promoted into
// fixtures/markets/) — not a rating engine; unmatched combinations say so
// honestly rather than serving a wrong price (see mockNote on Capture).
async function mockedCreateOffer(
  body: CreateOfferRequest
): Promise<XCoverResult<CreateOfferResponse>> {
  const { country } = body.customer;
  const { quantity } = body.context.product;
  const key = quantity === 1 ? country : `${country}-qty${quantity}`;

  let data: CreateOfferResponse | null = null;
  let mockNote: string | null = null;
  try {
    data = await loadFixture<CreateOfferResponse>(`markets/create-offer-${key}`);
  } catch {
    const recorded = await listFixtureKeys("markets", "create-offer-");
    mockNote =
      `No recorded MOCK_MODE fixture for country=${country}, quantity=${quantity}. ` +
      `Recorded combinations: ${recorded.join(", ")}.`;
  }

  return {
    data: data as CreateOfferResponse,
    capture: {
      method: "POST",
      url: urlFor("offers/"),
      requestHeaders: mockRequestHeaders(),
      requestBody: body,
      status: 200,
      responseBody: data,
      latencyMs: 0,
      mock: true,
      networkError: null,
      mockNote,
    },
  };
}

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  return {
    ...headers,
    "X-Api-Key": redact(headers["X-Api-Key"]),
    Authorization: headers.Authorization.replace(
      /keyId="[^"]*"/,
      `keyId="${redact(config.xcover.apiKey)}"`
    ).replace(/signature="[^"]*"/, 'signature="***redacted***"'),
  };
}

function redact(value: string): string {
  if (!value || value.length <= 8) return "***";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

// Found by actually driving MOCK_MODE in a browser (Phase 4), then found
// INCOMPLETE by the Phase 5 adversarial review: the first pass here only
// patched the top-level price, so a GBP booking showed a real GBP total next
// to "US$" tax/premium figures pulled from the static fixture untouched —
// a currency-mismatched response the Inspector presented as a normal 200
// with no disclaimer, which is precisely the failure mode the Inspector
// exists to catch. This now overrides every currency-shaped field (price,
// tax, premium) from the matched product, echoes back the real requested
// quote id and the customer's actual submitted policyholder details instead
// of the fixture's hardcoded "Jamie Rivera", and nulls out `commission`
// rather than leave a stale dollar figure next to a different currency — no
// market fixture reliably has real commission data (Phase 3: it's null
// without `extra_fields=commission`, which Create Offer isn't called with
// here), so null is the honest value, not a guess.
async function mockedConfirmOffer(
  path: string,
  body: ConfirmOfferRequest,
  idempotencyKey: string | null
): Promise<XCoverResult<ConfirmOfferResponse>> {
  const base = await loadFixture<ConfirmOfferResponse>("confirm-offer");
  const requestedQuoteId = body.quotes[0]?.id;
  const matched = requestedQuoteId ? await findMarketProductById(requestedQuoteId) : null;

  const data: ConfirmOfferResponse = matched
    ? {
        ...base,
        currency: matched.currency,
        total_price: matched.price,
        total_price_formatted: matched.priceFormatted,
        total_tax: matched.tax,
        total_tax_formatted: matched.taxFormatted,
        total_premium: matched.priceWithoutTax,
        total_premium_formatted: matched.priceWithoutTaxFormatted,
        policyholder: { ...body.policyholder },
        quotes: base.quotes.map((q, i) => {
          if (i !== 0) return q;
          return {
            ...q,
            id: requestedQuoteId,
            price: matched.price,
            price_formatted: matched.priceFormatted,
            tax: {
              total_tax: matched.tax,
              total_amount_without_tax: matched.priceWithoutTax,
              total_tax_formatted: matched.taxFormatted,
              total_amount_without_tax_formatted: matched.priceWithoutTaxFormatted,
            },
            commission: {
              partner_commission: null,
              total_commission: null,
              partner_commission_formatted: null,
              total_commission_formatted: null,
            },
          };
        }),
      }
    : base;

  return {
    data,
    capture: {
      method: "POST",
      url: urlFor(path),
      requestHeaders: idempotencyKey
        ? { ...mockRequestHeaders(), "x-idempotency-key": idempotencyKey }
        : mockRequestHeaders(),
      requestBody: body,
      status: 200,
      responseBody: data,
      latencyMs: 0,
      mock: true,
      networkError: null,
      mockNote: matched
        ? null
        : `Confirmed quote id ${requestedQuoteId} wasn't found in any recorded market fixture — showing the static confirm-offer.json price as a fallback, which may not match the plan actually selected.`,
    },
  };
}

export function createOffer(body: CreateOfferRequest) {
  return config.mockMode
    ? mockedCreateOffer(body)
    : request<CreateOfferRequest, CreateOfferResponse>("POST", "offers/", body);
}

// x-idempotency-key (offers/api/idempotency-keys.md, confirmed live): a
// resend with the identical key + body returns 409 with the *same* cached
// booking, not a new one — the documented-correct way to make a retry after
// a network timeout or double-click safe, which a frontend disabled-button
// guard alone can't do (a request already in flight when the network drops
// has no button left to disable). App.tsx generates one key per offer and
// reuses it for every confirm attempt on that offer, so any retry of "the
// same confirm" is idempotent by construction.
export function confirmOffer(
  offerId: string,
  body: ConfirmOfferRequest,
  idempotencyKey: string | null
) {
  const path = `offers/${offerId}/confirm/`;
  const headers = idempotencyKey ? { "x-idempotency-key": idempotencyKey } : undefined;
  return config.mockMode
    ? mockedConfirmOffer(path, body, idempotencyKey)
    : request<ConfirmOfferRequest, ConfirmOfferResponse>("POST", path, body, headers);
}

export function optOutOffer(offerId: string) {
  const path = `offers/${offerId}/opt_out/`;
  return config.mockMode
    ? mocked<null>("POST", path, {}, "opt-out", 204)
    : request<Record<string, never>, null>("POST", path, {});
}

// Phase 5 adversarial review: this was fully static — cancelling any booking
// returned fixtures/cancel-booking.json verbatim, a different customer
// ("Alex Chen") and a refund figure unrelated to whatever was actually just
// booked. That fixture is the one meant to demonstrate CLAUDE.md scope item
// 6 (avoiding duplicate compensation on cancellation) — showing an unrelated
// customer's refund undermines the one demo it exists for. Overrides
// currency/refund figures from the matched product (same lookup as confirm),
// echoes the real requested quote id, and nulls the policyholder rather than
// show a fabricated identity — Cancel Booking's request never includes
// policyholder details at all, so there is no real value to show here, only
// the fixture's leftover one from a different session.
//
// Phase 8 break-testing: even after the above fix, `id` (the booking id
// itself) was still the static fixture's own ("3MDFV-CWSUL-INS") — visibly
// different from the booking actually being cancelled, since Confirm's mock
// id is a separate static fixture's id ("EWGGB-V2G64-INS"). Opt in, then
// cancel, in MOCK_MODE (the zero-config default) and the Inspector shows two
// different booking ids for what a viewer just watched happen to one
// booking. Fixed by echoing back the real `bookingId` this call was actually
// made for — already known from the request path, not invented — rather
// than a synthesized new id, which this session has no live capture to
// justify (see docs/REACHABLE-STATES.md for the related, *not* fixed here,
// finding that Confirm's own id is static across every market/plan).
async function mockedCancelBooking(
  path: string,
  bookingId: string,
  body: CancelBookingRequest
): Promise<XCoverResult<CancelBookingResponse>> {
  const base = await loadFixture<CancelBookingResponse>("cancel-booking");
  const requestedQuoteId = body.quotes[0]?.id;
  const matched = requestedQuoteId ? await findMarketProductById(requestedQuoteId) : null;

  const data: CancelBookingResponse = matched
    ? {
        ...base,
        id: bookingId,
        currency: matched.currency,
        total_refund: matched.price,
        total_refund_formatted: matched.priceFormatted,
        refund_amount: matched.price,
        refund_amount_formatted: matched.priceFormatted,
        policyholder: {
          first_name: null,
          last_name: null,
          email: null,
          phone: null,
          country: null,
        },
        quotes: base.quotes.map((q, i) => {
          if (i !== 0) return q;
          return {
            ...q,
            id: requestedQuoteId,
            price: matched.price,
            refund_value: matched.price,
            adjustment_fee: null,
          };
        }),
      }
    : base;

  return {
    data,
    capture: {
      method: "POST",
      url: urlFor(path),
      requestHeaders: mockRequestHeaders(),
      requestBody: body,
      status: 200,
      responseBody: data,
      latencyMs: 0,
      mock: true,
      networkError: null,
      mockNote: matched
        ? null
        : `Cancelled quote id ${requestedQuoteId} wasn't found in any recorded market fixture — showing the static cancel-booking.json figures as a fallback, which don't relate to the booking actually being cancelled.`,
    },
  };
}

export function cancelBooking(bookingId: string, body: CancelBookingRequest) {
  const path = `bookings/${bookingId}/cancel`;
  return config.mockMode
    ? mockedCancelBooking(path, bookingId, body)
    : request<CancelBookingRequest, CancelBookingResponse>("POST", path, body);
}
