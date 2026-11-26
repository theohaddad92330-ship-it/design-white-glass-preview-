import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * #2403.12 — la signature du webhook « appel en cours », GÉNÉRIQUE.
 *
 * Contrairement à `resend-webhook-signature.ts` (qui vérifie le format Svix
 * imposé par un fournisseur), ce webhook est un contrat que BellumAI définit
 * lui-même — n'importe quel outil de téléphonie (ou l'automatisation qu'une
 * ESN construit dessus) peut l'appeler, pourvu qu'il signe avec le secret
 * PROPRE À L'ESPACE (`TelephonyConnectionEntity.webhook_secret_enc`). D'où un
 * schéma volontairement plus simple que Svix : `t=<epoch secondes>,v1=<hmac
 * sha256 hex>`.
 *
 * HMAC-SHA256 sur `${timestamp}.${corps BRUT}`, comparaison à TEMPS CONSTANT
 * (`timingSafeEqual`) — même défaut évité que sur le webhook Resend : une
 * comparaison `===` fuiterait la signature octet par octet via le temps de
 * réponse.
 */

const HEADER_PATTERN = /^t=(\d+),v1=([0-9a-f]+)$/

type VerifyInput = {
  rawBody: Buffer
  /** L'en-tête `X-Bellum-Signature`. */
  header: string
  /** Le secret PROPRE À L'ESPACE, déchiffré — jamais une clé globale. */
  secret: string
  /** Tolérance en secondes — protège d'un rejeu d'un événement intercepté. */
  toleranceSeconds?: number
  /** Injectable pour les tests — `Date.now()` par défaut. */
  now?: number
}

function expectedDigest(secret: string, timestamp: string, rawBody: Buffer): Buffer {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest()
}

/** `true` seulement si la signature correspond, sur les octets exacts, dans la fenêtre de tolérance. */
export function verifyTelephonyWebhookSignature(input: VerifyInput): boolean {
  const { rawBody, header, secret, toleranceSeconds = 300, now = Date.now() } = input
  if (!secret || !header) return false

  const match = HEADER_PATTERN.exec(header.trim())
  if (!match) return false
  const [, timestamp, signatureHex] = match

  // Un horodatage hors tolérance est refusé AVANT tout calcul cryptographique
  // — inutile de comparer une signature à un événement trop vieux (rejeu) ou
  // daté dans le futur (horloge trafiquée).
  const ageSeconds = Math.abs(now / 1000 - Number(timestamp))
  if (ageSeconds > toleranceSeconds) return false

  let candidate: Buffer
  let expected: Buffer
  try {
    candidate = Buffer.from(signatureHex, 'hex')
    expected = expectedDigest(secret, timestamp, rawBody)
  } catch {
    return false
  }

  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

/** Construit l'en-tête `X-Bellum-Signature` — utilisé par les tests et par tout script d'intégration côté ESN. */
export function signTelephonyWebhookBody(secret: string, rawBody: Buffer, now: number = Date.now()): string {
  const timestamp = Math.floor(now / 1000)
  return `t=${timestamp},v1=${expectedDigest(secret, String(timestamp), rawBody).toString('hex')}`
}
