import { describe, expect, it } from "vitest";
import { signDate, buildAuthorizationHeader } from "./signing.js";

// Test vector computed independently via OpenSSL, not via this codebase's own
// crypto call, so the test can't just be circular:
//   printf 'date: %s' "$DATE" | openssl dgst -sha512 -hmac "$SECRET" -binary | base64
//
// SECRET is a synthetic value, not a real credential — see docs/DECISIONS.md
// for why this changed: the original test vector used the live sandbox's
// actual XCOVER_API_SECRET, committed to git across every commit in this
// repo's history since the signing implementation. A unit test needs *a*
// known secret+signature pair, not specifically the real one.
const SECRET = "synthetic-test-secret-not-a-real-credential-9f3a";
const DATE = "Thu, 04 Nov 2021 18:07:11 GMT";
const EXPECTED_SIGNATURE =
  "Hrn8rpqhhx0AQ0wtC%2Fw0uLu1Hc6cdZ1a%2BBLupwQO%2Bud8JraSRMwNutcS2Whw1AKj3wecP8BmGdrDvXiT3tNU7Q%3D%3D";

describe("signDate", () => {
  it("matches the OpenSSL-computed vector", () => {
    expect(signDate(SECRET, DATE)).toBe(EXPECTED_SIGNATURE);
  });

  it("produces a different signature for a different date", () => {
    expect(signDate(SECRET, "Fri, 05 Nov 2021 18:07:11 GMT")).not.toBe(
      EXPECTED_SIGNATURE
    );
  });
});

describe("buildAuthorizationHeader", () => {
  it("assembles the Signature header per authentication.md", () => {
    expect(buildAuthorizationHeader("test-key", SECRET, DATE)).toBe(
      `Signature keyId="test-key",algorithm="hmac-sha512",signature="${EXPECTED_SIGNATURE}"`
    );
  });
});
