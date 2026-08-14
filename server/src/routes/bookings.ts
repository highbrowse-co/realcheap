import { Router } from "express";
import { cancelBooking } from "../xcoverClient.js";
import { asyncHandler } from "../asyncHandler.js";
import type { CancelBookingRequest } from "../xcoverTypes.js";

export const bookingsRouter = Router();

// See offers.ts for why this doesn't mirror capture.status onto res.status(),
// and for why asyncHandler wraps this.
bookingsRouter.post(
  "/:bookingId/cancel",
  asyncHandler(async (req, res) => {
    const { data, capture } = await cancelBooking(
      req.params.bookingId,
      req.body as CancelBookingRequest
    );
    res.json({ cancellation: data, capture });
  })
);
