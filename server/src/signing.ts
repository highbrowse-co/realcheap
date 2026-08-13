import { createHmac } from "node:crypto";

/**
 * XCover's HMAC signature scheme (offers/api/authentication.md): sign the literal
 * string "date: {date}" with HMAC-SHA512, base64-encode (strict RFC 4648, not the
 * URL-safe variant — using URL-safe base64 here would corrupt the '+' and '/'
 * characters and produce a signature XCover rejects), then URL-encode that base64
 * string for placement in the Authorization header.
 */
export function signDate(secret: string, date: string): string {
  const digest = createHmac("sha512", secret)
    .update(`date: ${date}`, "utf8")
    .digest("base64");
  return encodeURIComponent(digest);
}

export function buildAuthorizationHeader(
  apiKey: string,
  secret: string,
  date: string
): string {
  const signature = signDate(secret, date);
  return `Signature keyId="${apiKey}",algorithm="hmac-sha512",signature="${signature}"`;
}

/** RFC 822 §5.1 date string (e.g. "Thu, 04 Nov 2021 18:07:11 GMT"), as XCover requires. */
export function rfc822Date(date: Date): string {
  return date.toUTCString();
}
