import type { RequestHandler } from "express";

/**
 * Express 4 does not forward a rejected promise from an async handler to its
 * error middleware — an uncaught rejection in an async route becomes an
 * uncaught exception that crashes the process (confirmed: a single XCover
 * network failure took the whole server down before this existed). Every
 * route is wrapped in this so a bug we didn't anticipate still reaches
 * next(err) instead of the process.
 */
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
