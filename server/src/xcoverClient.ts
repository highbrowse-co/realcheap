import { buildAuthorizationHeader, rfc822Date } from "./signing.js";
import { config } from "./config.js";
import { loadFixture } from "./fixtures.js";
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
  status: number;
  responseBody: unknown;
  latencyMs: number;
  mock: boolean;
}

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
  const res = await fetch(url, {
    method,
    headers: requestHeaders,
    body: JSON.stringify(body),
  });
  const latencyMs = Math.round(performance.now() - start);
  const text = await res.text();
  const responseBody = text ? JSON.parse(text) : null;

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
    },
  };
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
      requestHeaders: redactHeaders({
        "Content-Type": "application/json",
        Date: rfc822Date(new Date()),
        "X-Api-Key": config.xcover.apiKey || "mock-key",
        Authorization:
          'Signature keyId="mock-key",algorithm="hmac-sha512",signature="mock-signature"',
      }),
      requestBody: body,
      status,
      responseBody: data,
      latencyMs: 0,
      mock: true,
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
    ? mocked<CreateOfferResponse>("POST", "offers/", body, "create-offer", 200)
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
