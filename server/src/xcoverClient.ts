import { buildAuthorizationHeader, rfc822Date } from "./signing.js";
import { config } from "./config.js";
import { listFixtureKeys, loadFixture } from "./fixtures.js";
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
  body: TReq
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

export function createOffer(body: CreateOfferRequest) {
  return config.mockMode
    ? mockedCreateOffer(body)
    : request<CreateOfferRequest, CreateOfferResponse>("POST", "offers/", body);
}

export function confirmOffer(offerId: string, body: ConfirmOfferRequest) {
  const path = `offers/${offerId}/confirm/`;
  return config.mockMode
    ? mocked<ConfirmOfferResponse>("POST", path, body, "confirm-offer", 200)
    : request<ConfirmOfferRequest, ConfirmOfferResponse>("POST", path, body);
}

export function optOutOffer(offerId: string) {
  const path = `offers/${offerId}/opt_out/`;
  return config.mockMode
    ? mocked<null>("POST", path, {}, "opt-out", 204)
    : request<Record<string, never>, null>("POST", path, {});
}

export function cancelBooking(bookingId: string, body: CancelBookingRequest) {
  const path = `bookings/${bookingId}/cancel`;
  return config.mockMode
    ? mocked<CancelBookingResponse>("POST", path, body, "cancel-booking", 200)
    : request<CancelBookingRequest, CancelBookingResponse>("POST", path, body);
}
