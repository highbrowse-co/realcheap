import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function loadFixture<T>(name: string): Promise<T> {
  const path = fileURLToPath(new URL(`../../fixtures/${name}.json`, import.meta.url));
  const text = await readFile(path, "utf8");
  return JSON.parse(text) as T;
}

/**
 * Lists the recorded fixture keys under fixtures/{subdir}/, stripping the
 * shared filename prefix/suffix — e.g. listFixtureKeys("markets",
 * "create-offer-") reading create-offer-US.json, create-offer-CA-qty3.json
 * returns ["US", "CA-qty3"]. Reads the directory live rather than hardcoding
 * the list, so it can't drift from what's actually on disk.
 */
export async function listFixtureKeys(subdir: string, prefix: string): Promise<string[]> {
  const dirPath = fileURLToPath(new URL(`../../fixtures/${subdir}`, import.meta.url));
  const files = await readdir(dirPath);
  return files
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .map((f) => f.slice(prefix.length, -".json".length))
    .sort();
}

export interface MockMatchedProduct {
  currency: string;
  price: number;
  priceFormatted: string;
  priceWithoutTax: number;
  priceWithoutTaxFormatted: string;
  tax: number;
  taxFormatted: string;
}

interface MarketFixtureShape {
  currency: string;
  products: Array<{
    id: string;
    details: {
      finance: {
        price: {
          total_amount: number;
          total_amount_without_tax: number;
          total_amount_formatted: string;
          total_amount_without_tax_formatted: string;
        };
        tax: { total_amount: number; total_amount_formatted: string };
      };
    };
  }>;
}

/**
 * Found by driving MOCK_MODE in a real browser (Phase 4), not by reading the
 * code: Confirm Offer's mock response was one static fixture regardless of
 * which plan/market the Create Offer step actually returned, so confirming a
 * $585.85 US 2yr plan showed a confirmed price of $1321.95 — the exact
 * market/quantity contradiction Phase 2 fixed for Create Offer, one step
 * later in the flow. This searches every recorded market fixture for the
 * product id the frontend is confirming, so the confirmed price (and tax
 * breakdown — a first pass at this only patched the top-level price and left
 * a GBP-labeled booking showing "US$" tax figures, caught in the Phase 5
 * adversarial review) can match what was actually offered. Still just
 * matching against captured traffic — no rating logic, no price the sandbox
 * didn't actually return.
 */
export async function findMarketProductById(quoteId: string): Promise<MockMatchedProduct | null> {
  const keys = await listFixtureKeys("markets", "create-offer-");
  for (const key of keys) {
    const offer = await loadFixture<MarketFixtureShape>(`markets/create-offer-${key}`);
    const product = offer.products.find((p) => p.id === quoteId);
    if (product) {
      const { price, tax } = product.details.finance;
      return {
        currency: offer.currency,
        price: price.total_amount,
        priceFormatted: price.total_amount_formatted,
        priceWithoutTax: price.total_amount_without_tax,
        priceWithoutTaxFormatted: price.total_amount_without_tax_formatted,
        tax: tax.total_amount,
        taxFormatted: tax.total_amount_formatted,
      };
    }
  }
  return null;
}
