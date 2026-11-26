import { HttpException } from '@nestjs/common'
import { MailTransportRejectedError } from '../mailer/mail-transport-rejected.error'

/**
 * #3699.5 — un envoi qui LÈVE n'est pas forcément un envoi perdu.
 *
 * - `failed` : le transport (ou la règle d'opt-out, ou le droit d'envoi) a
 *   RÉPONDU par un refus — rien n'est parti, on peut renvoyer.
 * - `uncertain` : la réponse n'est jamais arrivée (coupure, délai) — le message
 *   est peut-être parti. On ne propose pas de renvoyer avant vérification
 *   (doctrine : « un timeout n'est pas un échec »).
 *
 * Une cause qu'on ne sait pas lire reste `uncertain` : dire « échec » à tort
 * ferait renvoyer un message déjà parti.
 */
export function classifyTransportFailure(cause: unknown): 'failed' | 'uncertain' {
  if (cause instanceof MailTransportRejectedError || cause instanceof HttpException) return 'failed'
  if (!(cause instanceof Error)) return 'uncertain'
  const code = (cause as { code?: unknown }).code
  if (cause.name === 'AbortError' || cause.name === 'TimeoutError' || cause instanceof TypeError) return 'uncertain'
  if (typeof code === 'string' && /^(E[A-Z]+|UND_ERR.*)$/.test(code)) return 'uncertain'
  if (/timeout|timed out|socket|network|fetch failed/i.test(cause.message)) return 'uncertain'
  // Une erreur levée APRÈS une réponse HTTP non-OK d'un fournisseur (« … failed: 403 … »).
  return 'failed'
}
