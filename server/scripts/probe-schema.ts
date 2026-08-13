/**
 * Throwaway probe: makes an authenticated call against the live XCover sandbox
 * and prints the raw response, so undocumented schema shapes can be read off
 * real 422 errors and real 200s (see docs/OPEN-QUESTIONS.md #2). Not part of
 * the app.
 *
 * Usage: npx tsx scripts/probe-schema.ts <method> <path-after-partner-code> [body]
 *   npx tsx scripts/probe-schema.ts POST offers/ '{"customer":...}'
 *   npx tsx scripts/probe-schema.ts POST "offers/<id>/confirm/" '{"quotes":...}'
 *   npx tsx scripts/probe-schema.ts POST "offers/<id>/opt_out/" '{}'
 *   npx tsx scripts/probe-schema.ts POST "bookings/<id>/cancel" '{"preview":true}'
 */
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { buildAuthorizationHeader, rfc822Date } from "../src/signing.js";

config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const domain = process.env.XCOVER_API_DOMAIN!;
const basePath = process.env.XCOVER_BASE_PATH!;
const partnerCode = process.env.XCOVER_PARTNER_CODE!;
const apiKey = process.env.XCOVER_API_KEY!;
const secret = process.env.XCOVER_API_SECRET!;

const [method, path, rawBody] = process.argv.slice(2);
if (!method || !path) {
  console.error(
    'usage: npx tsx scripts/probe-schema.ts <METHOD> <path-after-partner-code> [body]'
  );
  process.exit(1);
}

const url = `${domain}${basePath}${partnerCode}/${path}`;
const date = rfc822Date(new Date());
const authorization = buildAuthorizationHeader(apiKey, secret, date);

const res = await fetch(url, {
  method,
  headers: {
    "Content-Type": "application/json",
    Date: date,
    "X-Api-Key": apiKey,
    Authorization: authorization,
  },
  body: rawBody ?? (method === "GET" ? undefined : "{}"),
});

const text = await res.text();
console.log(`${method} ${url}`);
console.log(`status: ${res.status}`);
console.log(text);
