import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * #2733 — vérifie la signature Svix d'un webhook Resend (Resend signe ses
 * événements via Svix ; pas de dépendance `svix` ajoutée — la vérification
 * est un HMAC-SHA256 documenté, pas un protocole propriétaire).
 *
 * Schéma (identique à tout webhook Svix) : le contenu signé est
 * `{svix-id}.{svix-timestamp}.{corps BRUT}`, la clé est la partie après
 * `whsec_` du secret, DÉCODÉE en base64, et l'en-tête `svix-signature`
 * porte une liste espacée de `v1,<signature base64>` — plusieurs entrées
 * pendant une rotation de clé. Une SEULE doit correspondre.
 *
 * Comparaison à TEMPS CONSTANT (`timingSafeEqual`) : une comparaison `===`
 * sur une signature fuiterait sa valeur octet par octet via le temps de
 * réponse (même défaut que comparer un mot de passe avec `===`).
 */
type VerifyResendWebhookSignatureInput = {
  rawBody: Buffer
  svixId: string
  svixTimestamp: string
  svixSignature: string
  /** Format Svix : `whsec_<base64>`. */
  secret: string
  /** Tolérance en secondes sur l'horodatage — protège d'un rejeu d'un event
   *  intercepté. 5 minutes, la valeur recommandée par Svix. */
  toleranceSeconds?: number
  /** Injectable pour les tests — `Date.now()` par défaut. */
  now?: number
}

function decodeSecret(secret: string): Buffer {
  const withoutPrefix = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
  return Buffer.from(withoutPrefix, 'base64')
}

function expectedSignature(secret: string, signedContent: string): Buffer {
  return createHmac('sha256', decodeSecret(secret)).update(signedContent).digest()
}

export function verifyResendWebhookSignature(input: VerifyResendWebhookSignatureInput): boolean {
  const { rawBody, svixId, svixTimestamp, svixSignature, secret, toleranceSeconds = 300, now = Date.now() } = input
  if (!secret || !svixId || !svixTimestamp || !svixSignature) return false

  // Un horodatage illisible ou hors tolérance est refusé AVANT tout calcul
  // cryptographique — inutile de comparer une signature à un événement trop
  // vieux (rejeu) ou daté dans le futur (horloge trafiquée).
  const timestampSeconds = Number(svixTimestamp)
  if (!Number.isFinite(timestampSeconds)) return false
  const ageSeconds = Math.abs(now / 1000 - timestampSeconds)
  if (ageSeconds > toleranceSeconds) return false

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody.toString('utf8')}`
  let expected: Buffer
  try {
    expected = expectedSignature(secret, signedContent)
  } catch {
    return false
  }

  // `svix-signature`: "v1,<base64> v1,<base64> …" — une rotation de clé fait
  // cohabiter l'ancienne et la nouvelle signature ; UNE correspondance suffit.
  return svixSignature
    .split(' ')
    .filter(Boolean)
    .some(entry => {
      const [version, value] = entry.split(',')
      if (version !== 'v1' || !value) return false
      let candidate: Buffer
      try {
        candidate = Buffer.from(value, 'base64')
      } catch {
        return false
      }
      return candidate.length === expected.length && timingSafeEqual(candidate, expected)
    })
}
