import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import express from "express";

config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`);
});
