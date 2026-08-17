import { Router } from "express";
import { createOffer, confirmOffer, optOutOffer } from "../xcoverClient.js";
import { asyncHandler } from "../asyncHandler.js";
import type { CreateOfferRequest, ConfirmOfferRequest } from "../xcoverTypes.js";

export const offersRouter = Router();

// This proxy's own HTTP status always reflects "did the proxy call succeed" — it
// stays 200 regardless of what XCover returned. The real upstream status lives in
// capture.status for the Inspector to show. Mirroring it onto our own response
// broke opt_out specifically: XCover's 204 has no body by HTTP spec, and Node
// strips a 204 response's body even if you call res.json() on it — which would
// silently drop the `capture` envelope the frontend needs to render the Inspector.
//
// xcoverClient's functions no longer throw for the failure modes we know about
// (unreachable, timeout, non-JSON body — see capture.networkError). asyncHandler
// exists to catch anything we didn't anticipate rather than crash the process.

offersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { data, capture } = await createOffer(req.body as CreateOfferRequest);
    res.json({ offer: data, capture });
  })
);

offersRouter.post(
  "/:offerId/confirm",
  asyncHandler(async (req, res) => {
    const idempotencyKey = req.header("x-idempotency-key") ?? null;
    const { data, capture } = await confirmOffer(
      req.params.offerId,
      req.body as ConfirmOfferRequest,
      idempotencyKey
    );
    res.json({ booking: data, capture });
  })
);

offersRouter.post(
  "/:offerId/opt-out",
  asyncHandler(async (req, res) => {
    const { data, capture } = await optOutOffer(req.params.offerId);
    res.json({ result: data, capture });
  })
);
