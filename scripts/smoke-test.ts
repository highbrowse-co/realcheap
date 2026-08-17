/**
 * Live integration smoke test against XCover staging. Not a mock — every
 * step but #9 signs and sends a real request to api.xcover-staging.com and
 * asserts on the real response. Run before a demo or a freeze to confirm
 * the integration still actually works, not just that the code compiles.
 *
 * Usage: npm run smoke
 *
 * Requires real credentials in .env (XCOVER_API_KEY/XCOVER_API_SECRET) —
 * MOCK_MODE is irrelevant to steps 1-8, which call XCover directly, the same
 * pattern as scripts/probe/probe.ts. Step 9 spawns the actual server
 * (server/src/index.ts) with MOCK_MODE=false and a deliberately unreachable
 * XCOVER_API_DOMAIN, to test this app's own fail-open handling, not XCover.
 *
 * Bookings created by steps 5-6 are cancelled again at the end (preview,
 * then confirm_cancellation) so the sandbox isn't left with live test
 * artifacts every run.
 */
import { createServer } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { buildAuthorizationHeader, rfc822Date } from "../server/src/signing.js";

loadDotenv({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const domain = process.env.XCOVER_API_DOMAIN;
const basePath = process.env.XCOVER_BASE_PATH;
const partnerCode = process.env.XCOVER_PARTNER_CODE;
const apiKey = process.env.XCOVER_API_KEY;
const apiSecret = process.env.XCOVER_API_SECRET;

if (!domain || !basePath || !partnerCode || !apiKey || !apiSecret) {
  console.error(
    "missing one or more of XCOVER_API_DOMAIN/XCOVER_BASE_PATH/XCOVER_PARTNER_CODE/" +
      "XCOVER_API_KEY/XCOVER_API_SECRET in .env — this smoke test needs real live credentials."
  );
  process.exit(1);
}

// Same redaction as server/src/xcoverClient.ts's redactHeaders/redact —
// duplicated rather than imported since it's five lines and this script has
// no other dependency on that file.
function redact(value: string): string {
  if (!value || value.length <= 8) return "***";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

interface CallResult {
  status: number;
  body: unknown;
  latencyMs: number;
}

async function call(method: string, path: string, body: unknown): Promise<CallResult> {
  const url = `${domain}${basePath}${partnerCode}/${path}`;
  const date = rfc822Date(new Date());
  const authorization = buildAuthorizationHeader(apiKey!, apiSecret!, date);
  const start = performance.now();
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Date: date,
      "X-Api-Key": apiKey!,
      Authorization: authorization,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const latencyMs = Math.round(performance.now() - start);
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { _rawBody: text.slice(0, 500) };
    }
  }
  return { status: res.status, body: parsed, latencyMs };
}

const today = new Date().toISOString().slice(0, 10);

function createOfferBody(country: string, currency: string, language: string, quantity: number) {
  return {
    customer: { currency, language, country },
    partner: {},
    context: { purchase_date: today, product: { retail_value: 1200, quantity } },
  };
}

const policyholder = {
  first_name: "Smoke",
  last_name: "Test",
  email: "smoke-test@example.com",
  phone: "+14155550100",
  country: "US",
};

interface StepResult {
  name: string;
  passed: boolean;
  ms: number;
  detail: string;
}

const results: StepResult[] = [];

async function step(name: string, fn: () => Promise<string>): Promise<void> {
  const start = performance.now();
  try {
    const detail = await fn();
    results.push({ name, passed: true, ms: Math.round(performance.now() - start), detail });
  } catch (err) {
    results.push({
      name,
      passed: false,
      ms: Math.round(performance.now() - start),
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// State threaded between steps.
let usOfferId: string | undefined;
let usProductId: string | undefined;
let usPriceQty1: number | undefined;
let bookingId: string | undefined;
let cancellationId: string | null | undefined;
let optOutOfferId: string | undefined;

await step("1. Auth — a signed request is accepted", async () => {
  // An intentionally empty body is a request the server still has to
  // authenticate before it can validate — a 403 here means the signature
  // itself was rejected; a 422 means auth passed and validation ran, which
  // is what every capture in this repo's fixtures shows for this exact call
  // (docs/OPEN-QUESTIONS.md #2's discovery trace).
  const { status, body } = await call("POST", "offers/", {});
  assert(status !== 403, `got 403 (auth rejected) — signing is broken. body: ${JSON.stringify(body)}`);
  assert(status === 422, `expected 422 (validation, auth passed) — got ${status}`);
  return `422 validation error, signature accepted`;
});

await step("2. Create Offer — US, single unit, returns products with pricing", async () => {
  const { status, body } = await call("POST", "offers/", createOfferBody("US", "USD", "en", 1));
  assert(status === 200, `expected 200, got ${status}: ${JSON.stringify(body).slice(0, 300)}`);
  const offer = body as {
    id: string;
    products: Array<{ id: string; details: { finance: { price: { total_amount: number } } } }>;
  };
  assert(Array.isArray(offer.products) && offer.products.length > 0, "no products in response");
  const price = offer.products[0].details.finance.price.total_amount;
  assert(typeof price === "number" && price > 0, `first product has no positive price (${price})`);
  usOfferId = offer.id;
  usProductId = offer.products[0].id;
  usPriceQty1 = price;
  return `${offer.products.length} products, first priced $${price}`;
});

await step("3. Create Offer — a EUR market, returns localised content", async () => {
  const { status, body } = await call("POST", "offers/", createOfferBody("DE", "EUR", "de", 1));
  assert(status === 200, `expected 200, got ${status}: ${JSON.stringify(body).slice(0, 300)}`);
  const offer = body as { currency: string; content: { heading: string; disclaimer: string } };
  assert(offer.currency === "EUR", `expected currency EUR, got ${offer.currency}`);
  assert(!!offer.content?.heading, "content.heading missing — content isn't rendering from the API");
  return `currency EUR, content.heading: "${offer.content.heading}"`;
});

await step("4. Create Offer — multi-unit, premium differs from single-unit", async () => {
  assert(usPriceQty1 !== undefined, "step 2 didn't record a qty-1 price to compare against");
  const { status, body } = await call("POST", "offers/", createOfferBody("US", "USD", "en", 3));
  assert(status === 200, `expected 200, got ${status}: ${JSON.stringify(body).slice(0, 300)}`);
  const offer = body as { products: Array<{ details: { finance: { price: { total_amount: number } } } }> };
  const price3 = offer.products[0].details.finance.price.total_amount;
  assert(price3 !== usPriceQty1, `qty-3 price ($${price3}) is identical to qty-1 price ($${usPriceQty1})`);
  return `qty1 $${usPriceQty1} vs qty3 $${price3} — quantity measurably changes rating`;
});

const idempotencyKey = crypto.randomUUID();

await step("5. Confirm Offer with idempotency key — returns a booking", async () => {
  assert(usOfferId !== undefined && usProductId !== undefined, "step 2 didn't produce an offer to confirm");
  const url = `offers/${usOfferId}/confirm/`;
  const dateHeader = rfc822Date(new Date());
  const authorization = buildAuthorizationHeader(apiKey!, apiSecret!, dateHeader);
  const fullUrl = `${domain}${basePath}${partnerCode}/${url}`;
  const res = await fetch(fullUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Date: dateHeader,
      "X-Api-Key": apiKey!,
      Authorization: authorization,
      "x-idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({ quotes: [{ id: usProductId }], policyholder }),
  });
  const body = await res.json();
  assert(res.status === 200, `expected 200, got ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  bookingId = body.id;
  assert(!!bookingId, "response had no booking id");
  return `booking ${bookingId}, status ${body.status}`;
});

await step("6. Replay the same idempotency key — 409, same booking ID", async () => {
  assert(usOfferId !== undefined && usProductId !== undefined && bookingId !== undefined, "step 5 didn't complete");
  const url = `offers/${usOfferId}/confirm/`;
  const dateHeader = rfc822Date(new Date());
  const authorization = buildAuthorizationHeader(apiKey!, apiSecret!, dateHeader);
  const fullUrl = `${domain}${basePath}${partnerCode}/${url}`;
  const res = await fetch(fullUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Date: dateHeader,
      "X-Api-Key": apiKey!,
      Authorization: authorization,
      "x-idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({ quotes: [{ id: usProductId }], policyholder }),
  });
  const body = await res.json();
  assert(res.status === 409, `expected 409, got ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  assert(body.id === bookingId, `replay returned a different booking id (${body.id} vs ${bookingId})`);
  return `409, same booking id ${body.id} — no duplicate booking created`;
});

await step("7. Create a fresh offer, Opt Out — 204", async () => {
  const created = await call("POST", "offers/", createOfferBody("GB", "GBP", "en", 1));
  assert(created.status === 200, `create offer for opt-out failed: ${created.status}`);
  optOutOfferId = (created.body as { id: string }).id;
  const { status, body } = await call("POST", `offers/${optOutOfferId}/opt_out/`, {});
  assert(status === 204, `expected 204, got ${status}: ${JSON.stringify(body).slice(0, 300)}`);
  return `204, no body`;
});

await step("8. Cancel with preview: true — returns a refund figure and cancellation ID", async () => {
  assert(bookingId !== undefined, "step 5 didn't produce a booking to cancel");
  const { status, body } = await call("POST", `bookings/${bookingId}/cancel`, {
    preview: true,
    refund_required: true,
    quotes: [{ id: usProductId }],
  });
  assert(status === 200, `expected 200, got ${status}: ${JSON.stringify(body).slice(0, 300)}`);
  const cancellation = body as { total_refund: number; cancellation_id: string | null };
  assert(typeof cancellation.total_refund === "number", "no total_refund figure in preview response");
  assert(!!cancellation.cancellation_id, "no cancellation_id in preview response");
  cancellationId = cancellation.cancellation_id;
  return `refund $${cancellation.total_refund}, cancellation_id ${cancellationId}`;
});

await step("9. Unreachable host — the server degrades and does not crash", async () => {
  const port = await freePort();
  const child = spawnServer(port);
  try {
    await waitForHealth(port, 15_000);
    const res = await fetch(`http://localhost:${port}/api/offers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createOfferBody("US", "USD", "en", 1)),
    });
    assert(res.status === 200, `proxy should always answer 200 even on a network failure, got ${res.status}`);
    const json = await res.json();
    assert(json.capture?.status === 0, `expected capture.status 0 (unreachable), got ${json.capture?.status}`);
    assert(!!json.capture?.networkError, "expected capture.networkError to be set");
    const health = await fetch(`http://localhost:${port}/api/health`);
    assert(health.status === 200, `server did not survive the failed call — /api/health returned ${health.status}`);
    return `proxy returned 200 with networkError set, server still up afterward`;
  } finally {
    child.kill();
  }
});

// Cleanup: actually finalize the preview cancellation from step 8 (not a
// numbered step — same discipline as prior probe sessions in this repo,
// leaving test bookings live in the sandbox rather than orphaned).
if (bookingId && cancellationId) {
  const cleanup = await call("POST", `bookings/${bookingId}/confirm_cancellation/${cancellationId}/`, {});
  console.log(
    cleanup.status === 200
      ? `cleanup: booking ${bookingId} cancelled for real (status ${cleanup.status})`
      : `cleanup WARNING: could not finalize cancellation of booking ${bookingId} (status ${cleanup.status}) — may need manual cleanup in the sandbox`
  );
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const address = srv.address();
      const port = typeof address === "object" && address ? address.port : null;
      srv.close(() => (port ? resolve(port) : reject(new Error("could not find a free port"))));
    });
    srv.on("error", reject);
  });
}

function spawnServer(port: number): ChildProcess {
  return spawn("npx", ["tsx", "src/index.ts"], {
    cwd: fileURLToPath(new URL("../server", import.meta.url)),
    env: {
      ...process.env,
      MOCK_MODE: "false",
      PORT: String(port),
      // Deliberately unreachable — RFC 2606 reserved TLD, guaranteed not to resolve.
      XCOVER_API_DOMAIN: "https://this-host-does-not-exist.invalid",
    },
    stdio: "ignore",
  });
}

async function waitForHealth(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/api/health`);
      if (res.status === 200) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`server on port ${port} never came up within ${timeoutMs}ms`);
}

console.log("");
console.log(`XCover live smoke test — ${domain}${basePath}${partnerCode}/`);
console.log(`API key: ${redact(apiKey)}`);
console.log("");

let allPassed = true;
for (const r of results) {
  const status = r.passed ? "PASS" : "FAIL";
  console.log(`[${status}] ${r.name} (${r.ms}ms)`);
  console.log(`       ${r.detail}`);
  if (!r.passed) allPassed = false;
}

const passCount = results.filter((r) => r.passed).length;
console.log("");
console.log(`${passCount}/${results.length} steps passed`);

process.exit(allPassed ? 0 : 1);
