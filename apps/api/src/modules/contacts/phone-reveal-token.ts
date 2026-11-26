import { createHmac, timingSafeEqual } from 'crypto'

/**
 * E1 (07/10/2026, #3698 — décision Louis) — le jeton de l'URL de retour de la
 * révélation du mobile Apollo.
 *
 * Apollo POSTe le mobile sur `webhook_url` sans aucune signature documentée :
 * l'endpoint est donc PUBLIC, et ce jeton EST la porte. Il porte le contact, un
 * nonce tiré au hasard pour CETTE demande (stocké dans
 * `contacts.enrichment_trace.phone_reveal`) et une échéance, signés en
 * HMAC-SHA256 avec `INTERNAL_API_SECRET` (secret serveur existant, jamais
 * devinable). Séparation de domaine (`e1-phone-reveal:`) : une signature de ce
 * jeton ne vaut rien ailleurs.
 *
 * Le jeton seul ne suffit pas : le webhook n'est accepté que si le nonce est
 * TOUJOURS celui attendu par le contact — une seconde livraison, ou celle
 * d'une demande remplacée, est refusée (pas de double écriture, pas de double
 * débit).
 *
 * Mis dans le CHEMIN de l'URL, pas dans la requête : la doc Apollo ne dit pas
 * si une `?query` survit.
 */
const DOMAIN = 'e1-phone-reveal:'
const MIN_SECRET_LENGTH = 16

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(DOMAIN + payload)
    .digest('base64url')
}

export function signPhoneRevealToken(
  input: { contactId: string; workspaceId: string | null; nonce: string; expiresAt: number },
  secret: string,
): string {
  if (!secret || secret.length < MIN_SECRET_LENGTH) throw new Error('phone reveal token: secret missing')
  const payload = `${input.contactId}.${input.workspaceId ?? ''}.${input.nonce}.${input.expiresAt}`
  return `${Buffer.from(payload).toString('base64url')}.${signature(payload, secret)}`
}

export function verifyPhoneRevealToken(
  token: string,
  secret: string,
  now: number = Date.now(),
): { contactId: string; workspaceId: string | null; nonce: string } | null {
  if (!secret || secret.length < MIN_SECRET_LENGTH || !token) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [encoded, provided] = parts as [string, string]
  let payload: string
  try {
    payload = Buffer.from(encoded, 'base64url').toString('utf8')
  } catch {
    return null
  }
  const expected = Buffer.from(signature(payload, secret))
  const given = Buffer.from(provided)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  const fields = payload.split('.')
  if (fields.length !== 4) return null
  const [contactId, workspaceId, nonce, expiresAt] = fields as [string, string, string, string]
  const expiry = Number(expiresAt)
  if (!contactId || !nonce || !Number.isFinite(expiry) || now > expiry) return null
  return { contactId, workspaceId: workspaceId || null, nonce }
}
