import express from "express";
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

app.listen(config.port, () => {
  console.log(
    `server listening on http://localhost:${config.port} (MOCK_MODE=${config.mockMode})`
  );
});
