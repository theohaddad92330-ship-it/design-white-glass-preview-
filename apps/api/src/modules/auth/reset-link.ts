import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Le lien de réinitialisation de mot de passe, construit et vérifié au même
 * endroit.
 *
 * Il existait en DEUX exemplaires, et c'est ce qui a cassé : le flux e-mail
 * construisait un lien vers NOTRE écran (`/auth/reset-password?token_hash=…`),
 * tandis que le back-office rendait le lien SUPABASE brut
 * (`…supabase.co/auth/v1/verify?token=…&redirect_to=…`). Le second mène à la
 * racine de l'application, où il n'y a aucun écran pour le consommer :
 * l'utilisateur clique, arrive sur la page d'accueil, et ne peut rien faire.
 *
 * Une seule construction, deux appelants. Fonction PURE : c'est ce qui permet
 * de la tester sans base ni réseau — et un lien de réinitialisation faux se
 * découvre autrement chez un utilisateur bloqué.
 */

/** Durée de validité d'un lien, en millisecondes. */
export const RESET_LINK_TTL_MS = 15 * 60 * 1000

type ResetLinkParts = {
  /** L'URL de la SPA, sans barre finale. */
  frontendUrl: string
  /** Le `hashed_token` rendu par Supabase — jamais le token brut. */
  tokenHash: string
  expiresAt: number
  /** Le secret de signature (le JWT secret Supabase). */
  secret: string
}

/**
 * Signe le couple (jeton, échéance).
 *
 * L'échéance entre dans la signature : sans elle, n'importe qui pourrait
 * rallonger la validité d'un lien en changeant le paramètre dans l'URL.
 */
export function signResetToken(tokenHash: string, expiresAt: number, secret: string): string {
  return createHmac('sha256', secret).update(`${tokenHash}.${expiresAt}`).digest('hex')
}

/** L'URL complète, prête à être remise à quelqu'un. */
export function buildResetLink(parts: ResetLinkParts): string {
  const base = parts.frontendUrl.replace(/\/+$/, '')
  const query = new URLSearchParams({
    token_hash: parts.tokenHash,
    expires_at: String(parts.expiresAt),
    signature: signResetToken(parts.tokenHash, parts.expiresAt, parts.secret),
  })
  return `${base}/auth/reset-password?${query.toString()}`
}

/**
 * La signature d'un lien est-elle valable ?
 *
 * Comparaison à temps constant, et forme du hexadécimal vérifiée AVANT : une
 * signature de longueur inattendue ferait lever `timingSafeEqual` au lieu de
 * rendre un refus propre.
 */
export function resetSignatureIsValid(
  tokenHash: string,
  expiresAt: number,
  signature: string,
  secret: string,
): boolean {
  if (!/^[a-f0-9]{64}$/.test(signature)) return false
  const expected = signResetToken(tokenHash, expiresAt, secret)
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))
}
