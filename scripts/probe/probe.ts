/**
 * Session 1.5 sandbox capability probe. Throwaway — not part of the app,
 * not imported by anything in /server or /web. Calls the live XCover sandbox
 * directly (bypasses MOCK_MODE entirely) using the same HMAC-SHA512 scheme
 * as server/src/signing.ts, reimplemented inline so this script has zero
 * dependency on the app's TS build graph.
 *
 * Usage:
 *   npx tsx scripts/probe/probe.ts <METHOD> <path-after-partner-code> [json-body] [save-name]
 *
 * Examples:
 *   npx tsx scripts/probe/probe.ts POST offers/ '{"customer":{"currency":"CAD","language":"en","country":"CA"},"partner":{},"context":{"purchase_date":"2026-08-15","product":{"retail_value":1200,"quantity":1}}}' market-ca
 *   npx tsx scripts/probe/probe.ts POST "offers/<id>/confirm/" '{"quotes":[{"id":"..."}],"policyholder":{...}}' confirm-retry
 *
 * If save-name is given, the full request+response is written to
 * fixtures/probe/<save-name>.json. Always prints to stdout regardless.
 */
import { createHmac } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

loadDotenv({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const domain = process.env.XCOVER_API_DOMAIN!;
const basePath = process.env.XCOVER_BASE_PATH!;
const partnerCode = process.env.XCOVER_PARTNER_CODE!;
const apiKey = process.env.XCOVER_API_KEY!;
const secret = process.env.XCOVER_API_SECRET!;

function signDate(secret: string, date: string): string {
  const digest = createHmac("sha512", secret).update(`date: ${date}`, "utf8").digest("base64");
  return encodeURIComponent(digest);
}

function buildAuthorizationHeader(apiKey: string, secret: string, date: string): string {
  return `Signature keyId="${apiKey}",algorithm="hmac-sha512",signature="${signDate(secret, date)}"`;
}

const [method, path, rawBody, saveName] = process.argv.slice(2);
if (!method || !path) {
  console.error(
    "usage: npx tsx scripts/probe/probe.ts <METHOD> <path-after-partner-code> [json-body] [save-name]"
  );
  process.exit(1);
}

const url = `${domain}${basePath}${partnerCode}/${path}`;
const date = new Date().toUTCString();
const authorization = buildAuthorizationHeader(apiKey, secret, date);
const requestHeaders = {
  "Content-Type": "application/json",
  Date: date,
  "X-Api-Key": apiKey,
  Authorization: authorization,
};
const body = rawBody ?? (method === "GET" ? undefined : "{}");

const start = performance.now();
const res = await fetch(url, { method, headers: requestHeaders, body });
const latencyMs = Math.round(performance.now() - start);
const text = await res.text();
let responseBody: unknown = null;
try {
  responseBody = text ? JSON.parse(text) : null;
} catch {
  responseBody = text;
}

console.log(`${method} ${url}`);
console.log(`status: ${res.status}  latency: ${latencyMs}ms`);
console.log(JSON.stringify(responseBody, null, 2));

if (saveName) {
  const record = {
    method,
    url,
    requestHeaders: {
      ...requestHeaders,
      "X-Api-Key": `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`,
      Authorization: authorization.replace(/keyId="[^"]*"/, `keyId="${apiKey.slice(0, 4)}...${apiKey.slice(-4)}"`).replace(/signature="[^"]*"/, 'signature="***redacted***"'),
    },
    requestBody: body ? JSON.parse(body) : null,
    status: res.status,
    latencyMs,
    responseBody,
  };
  const outPath = fileURLToPath(new URL(`../../fixtures/probe/${saveName}.json`, import.meta.url));
  writeFileSync(outPath, JSON.stringify(record, null, 2) + "\n");
  console.log(`saved -> fixtures/probe/${saveName}.json`);
}
