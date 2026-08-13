import { Router } from "express";
import { createOffer, confirmOffer, optOutOffer } from "../xcoverClient.js";
import type { CreateOfferRequest, ConfirmOfferRequest } from "../xcoverTypes.js";

export const offersRouter = Router();

offersRouter.post("/", async (req, res) => {
  const { data, capture } = await createOffer(req.body as CreateOfferRequest);
  res.status(capture.status).json({ offer: data, capture });
});

offersRouter.post("/:offerId/confirm", async (req, res) => {
  const { data, capture } = await confirmOffer(
    req.params.offerId,
    req.body as ConfirmOfferRequest
  );
  res.status(capture.status).json({ booking: data, capture });
});

offersRouter.post("/:offerId/opt-out", async (req, res) => {
  const { data, capture } = await optOutOffer(req.params.offerId);
  res.status(capture.status).json({ result: data, capture });
});
