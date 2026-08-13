import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function loadFixture<T>(name: string): Promise<T> {
  const path = fileURLToPath(new URL(`../../fixtures/${name}.json`, import.meta.url));
  const text = await readFile(path, "utf8");
  return JSON.parse(text) as T;
}
