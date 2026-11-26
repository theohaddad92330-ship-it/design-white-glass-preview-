import type { MailDirection, MailThreadCommercialState } from '@bellum/contracts'

/**
 * #2393.2 — LE STATUT COMMERCIAL D'UN FIL, calculé, jamais deviné.
 *
 * Trois des douze valeurs de `MAIL_THREAD_COMMERCIAL_STATES` (@bellum/contracts)
 * se déduisent MÉCANIQUEMENT de données déjà collectées, sans lire le contenu
 * d'aucun message :
 *  - `positive_reply` — le signal existe déjà (`positiveReplyThreadIds`,
 *    `mail-priority.ts`), réutilisé ici plutôt que redupliqué (GA-26) ;
 *  - `waiting_on_me` / `waiting_on_them` — `lastDirection` dit qui a parlé en
 *    dernier : un message ENTRANT non répondu attend une action de nous
 *    (`waiting_on_me`) ; un message SORTANT sans réponse attend l'interlocuteur
 *    (`waiting_on_them`).
 *
 * Les neuf autres (question/objection/not_now/wrong_person/meeting/admin/
 * no_action/spam_noise/unresolved) demandent de comprendre le SENS de la
 * conversation — cette fonction rend `null` plutôt que d'en deviner une
 * (doctrine « jamais de donnée fictive »).
 *
 * Une décision manuelle déjà posée (`mark`, #2104.6/.7/.8) n'est pas une
 * classification commerciale : elle prime dans `state`, elle sort ici en `null`.
 */
export function computeMailThreadCommercialState(
  thread: { lastDirection: MailDirection },
  isPositiveReply: boolean,
  mark: 'treated' | 'irrelevant' | 'archived' | null,
): MailThreadCommercialState | null {
  if (mark) return null
  if (isPositiveReply) return 'positive_reply'
  return thread.lastDirection === 'inbound' ? 'waiting_on_me' : 'waiting_on_them'
}
