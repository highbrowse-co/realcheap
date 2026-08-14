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
