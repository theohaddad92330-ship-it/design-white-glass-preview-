import express, { type Request, type RequestHandler } from 'express'

/**
 * #2403.12 — même besoin que Stripe/Resend (`stripe-raw-body.middleware.ts`,
 * `resend-raw-body.middleware.ts`, copié à l'identique) : la vérification de
 * signature doit courir sur les OCTETS EXACTS que l'appelant a signés.
 * `express.json()` global (dans `main.ts`) reconstruit le corps — toute
 * re-sérialisation change les octets et fait échouer CHAQUE signature.
 */
export const telephonyRawBodyParser: RequestHandler = express.raw({ type: '*/*', limit: '64kb' })

/** Copie le buffer brut capturé par `telephonyRawBodyParser` sur `req.rawBody`. */
export const stashTelephonyRawBody: RequestHandler = (req, _res, next) => {
  if (Buffer.isBuffer(req.body)) {
    ;(req as Request & { rawBody?: Buffer }).rawBody = req.body
  }
  next()
}
