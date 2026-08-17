import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";

loadDotenv({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var ${name}`);
  return value;
}

const mockMode = process.env.MOCK_MODE !== "false";

export const config = {
  port: Number(process.env.PORT ?? 3001),
  mockMode,
  xcover: {
    // MOCK_MODE is the zero-config default (CLAUDE.md hard constraint 4): a
    // reviewer with no XCover credentials at all must be able to run this. In
    // MOCK_MODE these three fall back to placeholders (never sent anywhere —
    // only used to build a plausible URL/header set for the Inspector); they
    // stay required() for live mode, where a missing value should fail fast
    // at startup rather than produce a confusing 403 on the first real call.
    domain: mockMode
      ? (process.env.XCOVER_API_DOMAIN ?? "https://mock.invalid")
      : required("XCOVER_API_DOMAIN"),
    basePath: mockMode
      ? (process.env.XCOVER_BASE_PATH ?? "/xcover/partners/")
      : required("XCOVER_BASE_PATH"),
    partnerCode: mockMode
      ? (process.env.XCOVER_PARTNER_CODE ?? "MOCK")
      : required("XCOVER_PARTNER_CODE"),
    apiKey: process.env.XCOVER_API_KEY ?? "",
    apiSecret: process.env.XCOVER_API_SECRET ?? "",
  },
};
