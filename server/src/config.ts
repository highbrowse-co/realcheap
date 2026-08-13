import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";

loadDotenv({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  mockMode: process.env.MOCK_MODE !== "false",
  xcover: {
    domain: required("XCOVER_API_DOMAIN"),
    basePath: required("XCOVER_BASE_PATH"),
    partnerCode: required("XCOVER_PARTNER_CODE"),
    apiKey: process.env.XCOVER_API_KEY ?? "",
    apiSecret: process.env.XCOVER_API_SECRET ?? "",
  },
};
