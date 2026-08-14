import express from "express";
import type { ErrorRequestHandler } from "express";
import { config } from "./config.js";
import { offersRouter } from "./routes/offers.js";
import { bookingsRouter } from "./routes/bookings.js";

const app = express();
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mockMode: config.mockMode });
});

app.use("/api/offers", offersRouter);
app.use("/api/bookings", bookingsRouter);

// Last-resort net. xcoverClient's own try/catch and asyncHandler on every
// route should mean nothing reaches this — but if something we didn't
// anticipate does, the fail-open principle (docs/ARCHITECTURE.md) means a
// bug here must degrade to a JSON 500, never take the process down.
const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error("unhandled error in request:", err);
  res.status(500).json({
    error: "internal_error",
    message: "RealCheap's server hit an unexpected error (not an XCover response).",
  });
};
app.use(onError);

// Defense-in-depth beneath asyncHandler: a rejection or throw that somehow
// still escapes it (e.g. a callback outside the request lifecycle) logs
// instead of crashing. CLAUDE.md's fail-open principle is "protection is
// ancillary, a partner's revenue must never depend on our uptime" — a
// crashed process is the one failure mode that principle cannot recover
// from, so it gets its own explicit guard rather than relying on every
// call site being airtight.
process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection (server stayed up):", reason);
});

app.listen(config.port, () => {
  console.log(
    `server listening on http://localhost:${config.port} (MOCK_MODE=${config.mockMode})`
  );
});
