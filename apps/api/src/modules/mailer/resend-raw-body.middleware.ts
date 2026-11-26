import express, { type Request, type RequestHandler } from 'express'

/**
 * #2733 — même besoin que Stripe (`stripe-raw-body.middleware.ts`, copié à
 * l'identique) : la vérification de signature Svix doit courir sur les
 * OCTETS EXACTS que Resend a signés. `express.json()` global (dans
 * `main.ts`) reconstruit le corps — toute re-sérialisation change les octets
 * et fait échouer CHAQUE signature, donc plus aucun rebond n'est jamais
 * appliqué.
 *
 * `express.raw` marque `req._body = true`, ce qui fait sauter cette route au
 * parseur JSON global (pas de double lecture du flux). `stashRawBody` copie
 * ensuite le buffer sur `req.rawBody`, lu par `ResendWebhookController`.
 */
export const resendRawBodyParser: RequestHandler = express.raw({ type: '*/*', limit: '1mb' })

/** Copie le buffer brut capturé par `resendRawBodyParser` sur `req.rawBody`. */
export const stashResendRawBody: RequestHandler = (req, _res, next) => {
  if (Buffer.isBuffer(req.body)) {
    ;(req as Request & { rawBody?: Buffer }).rawBody = req.body
  }
  next()
}
