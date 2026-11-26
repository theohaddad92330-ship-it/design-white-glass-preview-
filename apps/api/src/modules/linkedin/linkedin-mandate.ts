/**
 * Le mandat d'envoi LinkedIn (#4737) — la décision, pure.
 *
 * Renversement assumé et daté (Louis, 28-29/10/2026) : le copilote n'envoie
 * jamais d'e-mail, mais l'envoi LinkedIn peut être DÉLÉGUÉ, sous un mandat
 * explicite, daté, borné et révocable. L'e-mail ne bouge pas.
 *
 * Un mandat n'est ni un rôle ni une permission : il ne se lit nulle part dans
 * `account-access/**`. Cette fonction ne connaît ni le rôle ni le contenu du
 * message — le corps n'entre jamais ici.
 *
 * L'ordre des refus est celui de la gravité : l'absence et la révocation (un
 * humain a dit non) passent avant la période, la période avant les bornes de
 * volume.
 */
/**
 * La borne d'envoi LinkedIn : 25 par jour et PAR UTILISATEUR (Louis, 29/10/2026), contre les 50 posés
 * par le premier lot. La raison est écrite ici pour qu'on ne la relève pas sans la relire : ce n'est
 * pas notre compte qui est en jeu, c'est le COMPTE LINKEDIN DU CLIENT. Le fournisseur recommande
 * des volumes conservateurs et signale que dépasser les limites de LinkedIn expose le compte à des
 * avertissements ; une restriction de compte coûte au client bien plus qu'un envoi de plus ne lui
 * rapporte. La borne vaut par utilisateur (révoquer puis re-signer ne la remet pas à zéro) et le
 * code la tient AU-DESSUS de la ligne : un mandat posé à 50 avant cette décision est arrêté à 25.
 */
export const LINKEDIN_DAILY_SEND_LIMIT = 25

export interface Mandate {
  id: string
  grantedBy: string
  grantedAt: Date
  validFrom: Date
  validUntil: Date
  /** Borne de volume par jour (jour UTC), tous destinataires confondus. */
  dailyLimit: number
  revokedAt: Date | null
}

type MandateRefusal =
  | 'no_mandate'
  | 'revoked'
  | 'not_yet_valid'
  | 'expired'
  | 'recipient_replied'
  | 'previous_unknown'
  | 'daily_limit_reached'

type SendDecision = { allowed: true } | { allowed: false; reason: MandateRefusal }

interface SendFacts {
  mandate: Mandate | null
  now: Date
  /** Envois du jour (réussis ou restés incertains) déjà comptés contre la borne. */
  sentToday: number
  /** Le destinataire a répondu : la suite du mandat pour lui s'arrête. */
  recipientReplied: boolean
  /** Un envoi précédent à ce destinataire est resté « unknown » : pas de reprise. */
  previousUnknown: boolean
}

export function decideSend(facts: SendFacts): SendDecision {
  const { mandate, now } = facts
  if (!mandate) return { allowed: false, reason: 'no_mandate' }
  // Une correction humaine gagne toujours, quelle que soit sa date : la
  // révocation vaut dès qu'elle est posée, pour tout ce qui n'est pas parti.
  if (mandate.revokedAt) return { allowed: false, reason: 'revoked' }
  if (now.getTime() < mandate.validFrom.getTime()) return { allowed: false, reason: 'not_yet_valid' }
  if (now.getTime() > mandate.validUntil.getTime()) return { allowed: false, reason: 'expired' }
  if (facts.recipientReplied) return { allowed: false, reason: 'recipient_replied' }
  if (facts.previousUnknown) return { allowed: false, reason: 'previous_unknown' }
  if (facts.sentToday >= Math.min(mandate.dailyLimit, LINKEDIN_DAILY_SEND_LIMIT))
    return { allowed: false, reason: 'daily_limit_reached' }
  return { allowed: true }
}
