import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * #4189.7 (décision Louis 15/10/2026) — LA VÉRIFICATION DES WEBHOOKS ENTRANTS CRM.
 *
 * Pures et testées à part : une signature se vérifie sur le CORPS BRUT (jamais un JSON
 * re-sérialisé, qui ne rend pas les mêmes octets), en temps constant, et hors d'une fenêtre
 * de 5 minutes l'horodatage est refusé (rejeu).
 *
 *  - HubSpot, signature v3 : `X-HubSpot-Signature-v3` = base64(HMAC-SHA256(secret de l'app,
 *    méthode + URI + corps + horodatage)), `X-HubSpot-Request-Timestamp` en millisecondes.
 *  - Salesforce n'a pas de signature native pour un appel sortant (Flow / Apex) : le client
 *    pose un secret partagé et signe `horodatage + "." + corps` en HMAC-SHA256 hexadécimal,
 *    en-têtes `X-Bellum-Timestamp` (secondes) et `X-Bellum-Signature`.
 */
export const WEBHOOK_REPLAY_WINDOW_MS = 5 * 60_000

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

function fresh(timestampMs: number, now: number): boolean {
  return Number.isFinite(timestampMs) && Math.abs(now - timestampMs) <= WEBHOOK_REPLAY_WINDOW_MS
}

export function verifyHubspotSignatureV3(input: {
  secret: string
  method: string
  uri: string
  rawBody: Buffer
  timestamp: string | undefined
  signature: string | undefined
  now?: number
}): boolean {
  if (!input.secret || !input.signature || !input.timestamp) return false
  const timestampMs = Number(input.timestamp)
  if (!fresh(timestampMs, input.now ?? Date.now())) return false
  const expected = createHmac('sha256', input.secret)
    .update(`${input.method.toUpperCase()}${input.uri}${input.rawBody.toString('utf8')}${input.timestamp}`)
    .digest('base64')
  return safeEqual(expected, input.signature)
}

export function verifySharedSecretSignature(input: {
  secret: string
  rawBody: Buffer
  timestamp: string | undefined
  signature: string | undefined
  now?: number
}): boolean {
  if (!input.secret || !input.signature || !input.timestamp) return false
  const timestampMs = Number(input.timestamp) * 1000
  if (!fresh(timestampMs, input.now ?? Date.now())) return false
  const expected = createHmac('sha256', input.secret)
    .update(`${input.timestamp}.${input.rawBody.toString('utf8')}`)
    .digest('hex')
  return safeEqual(expected, input.signature.trim().toLowerCase())
}
