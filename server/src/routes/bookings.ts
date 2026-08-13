import { Router } from "express";
import { cancelBooking } from "../xcoverClient.js";
import type { CancelBookingRequest } from "../xcoverTypes.js";

export const bookingsRouter = Router();

bookingsRouter.post("/:bookingId/cancel", async (req, res) => {
  const { data, capture } = await cancelBooking(
    req.params.bookingId,
    req.body as CancelBookingRequest
  );
  res.status(capture.status).json({ cancellation: data, capture });
});
