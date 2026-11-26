import { countRepliesToTreat, type MailThread } from '@bellum/contracts'

/**
 * LE RÉSUMÉ DYNAMIQUE DE « TA MESSAGERIE » (#2113.17, #2113.18).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL N'Y A PAS DE SEGMENT « BROUILLON »
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour d'origine (#2113) cite « 1 brouillon prêt » comme exemple. Ce
 * dépôt ne PERSISTE aucun brouillon (`mailDraftRequestSchema` sert à en
 * CRÉER un, jamais à en LISTER un existant) : rien ne peut prouver qu'un
 * brouillon est « prêt » sans l'inventer. Le segment n'existe donc pas — même
 * discipline que le résumé de « Aujourd'hui » (`briefingHeroSegments`) : un
 * segment n'apparaît que s'il compte quelque chose de RÉEL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX COMPTES, PAS TROIS
 * ─────────────────────────────────────────────────────────────────────────────
 * « Réponses à traiter » = les fils `positive_reply` (une réponse favorable
 * attend un enchaînement) ; le badge d'intention le nomme déjà ailleurs sur
 * cet écran. « Relances dues » = les fils `no_reply` (silence à reprendre).
 * Un fil non lu sans réponse favorable n'entre dans aucun des deux : il reste
 * cherchable via l'onglet « Non lus », mais n'est pas une DÉCISION en
 * attente au même titre.
 */
type MailboxHeroSegment = { key: 'toTreat' | 'followUps'; count: number }

export function mailboxHeroSegments(input: { toTreat: MailThread[]; followUps: MailThread[] }): MailboxHeroSegment[] {
  const candidates: MailboxHeroSegment[] = [
    { key: 'toTreat', count: countRepliesToTreat(input.toTreat) },
    { key: 'followUps', count: input.followUps.length },
  ]
  return candidates.filter(segment => segment.count > 0)
}

/** Le premier fil à proposer pour « Traiter la première réponse » — une
 *  réponse favorable d'abord (elle a déjà donné un signal), une relance sinon. */
export function mailboxFirstThreadToTreat(input: {
  toTreat: MailThread[]
  followUps: MailThread[]
}): MailThread | null {
  return input.toTreat[0] ?? input.followUps[0] ?? null
}
