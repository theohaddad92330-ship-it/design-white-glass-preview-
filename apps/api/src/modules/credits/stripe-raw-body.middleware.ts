import express, { type Request, type RequestHandler } from 'express'

/**
 * Stripe webhook signature verification (`stripe.webhooks.constructEvent`) must
 * run against the EXACT bytes Stripe signed — any re-serialization (what
 * `express.json` produces) changes the payload and every signature check fails,
 * so no webhook is ever applied and paying customers are never credited.
 *
 * The global `express.json()` in `main.ts` consumes the request stream, so we
 * capture the raw buffer on the webhook route only, BEFORE that parser runs.
 * `express.raw` sets `req._body = true`, which makes the downstream global JSON
 * parser skip this route (no double-read). `stashRawBody` then copies the buffer
 * onto `req.rawBody`, which `CreditsController.handleWebhook` reads.
 */
export const stripeRawBodyParser: RequestHandler = express.raw({ type: '*/*', limit: '1mb' })

/** Copy the raw buffer captured by `stripeRawBodyParser` onto `req.rawBody`. */
export const stashRawBody: RequestHandler = (req, _res, next) => {
  if (Buffer.isBuffer(req.body)) {
    ;(req as Request & { rawBody?: Buffer }).rawBody = req.body
  }
  next()
}
