import { FEEDBACK_MESSAGE_MAX } from '@bellum/contracts'

/**
 * #1960.4 — LAURA OUVRE LE SIGNALEMENT EXISTANT, PRÉ-REMPLI. ELLE N'EN CRÉE AUCUN.
 *
 * Décision du 12/09/2026 : pas de second canal de support. Quand quelqu'un décrit
 * un problème du produit dans la conversation, Laura écrit un lien markdown
 * `[Signaler ce problème](#signaler:<résumé encodé>)` ; le rendu du chat
 * (`features/chat/view/markdown.tsx`) le reconnaît ici, et un clic ouvre
 * `FeedbackWidget` avec la description déjà écrite.
 *
 * ⚠️ POURQUOI UN ÉVÉNEMENT ET PAS UNE CARTE D'ACTION. Les cartes d'action migrent
 * vers Action OS ; en créer un type de plus ajouterait une porte à déplacer. Le
 * lien réutilise le seul mécanisme que Laura sait déjà écrire (#1778), et le
 * widget, monté une fois à la racine, écoute l'événement.
 *
 * ⚠️ POURQUOI UN JETON EN `#` ET PAS UN CHEMIN. Un chemin serait une route : un
 * `cmd+clic` ouvrirait un 404, et `appRouteTarget` le refuserait de toute façon.
 * Un `#` ne ressemble à aucun écran ; un rendu plus ancien qui ne le connaît pas
 * affiche le libellé seul, sans lien mort.
 *
 * ⚠️ LE JETON EST LU PAR LE PROMPT. `apps/ia/tests/test_copilote_support_block.py`
 * extrait `REPORT_LINK_TARGET` de CE fichier et vérifie que le prompt de Laura
 * l'écrit à l'identique : le renommer sans le prompt fait tomber la suite IA.
 * Garder la déclaration sur une ligne, entre apostrophes.
 */
export const REPORT_LINK_TARGET = '#signaler'

/** Le nom de l'événement DOM qui demande l'ouverture du widget. */
const FEEDBACK_OPEN_EVENT = 'bellum:feedback-open'

/** Ce qu'un lien de signalement transporte : la description à relire, et rien d'autre. */
export type ReportRequest = { message: string }

/**
 * La demande portée par la cible d'un lien, ou `null` si ce n'est pas un lien de
 * signalement.
 *
 * Le texte vient d'un MODÈLE : il n'est jamais interprété (il atterrit dans la
 * valeur d'un `<textarea>`), il est borné au plafond du contrat, et la personne
 * le relit avant tout envoi. Un encodage cassé garde le texte brut plutôt que de
 * le perdre — mieux vaut un `%20` à corriger qu'une description vide.
 */
export function parseReportLink(raw: string): ReportRequest | null {
  const trimmed = raw.trim()
  if (trimmed === REPORT_LINK_TARGET) return { message: '' }
  if (!trimmed.startsWith(`${REPORT_LINK_TARGET}:`)) return null
  const encoded = trimmed.slice(REPORT_LINK_TARGET.length + 1)
  let decoded: string
  try {
    decoded = decodeURIComponent(encoded)
  } catch {
    decoded = encoded
  }
  return { message: decoded.trim().slice(0, FEEDBACK_MESSAGE_MAX) }
}

/** Demande au widget de s'ouvrir — sans rien envoyer : l'envoi reste le clic de la personne. */
export function requestReport(request: ReportRequest): void {
  window.dispatchEvent(new CustomEvent<ReportRequest>(FEEDBACK_OPEN_EVENT, { detail: request }))
}

/** S'abonne aux demandes d'ouverture ; rend la fonction de désabonnement. */
export function onReportRequest(listener: (request: ReportRequest) => void): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<ReportRequest>).detail
    if (detail && typeof detail.message === 'string') listener({ message: detail.message })
  }
  window.addEventListener(FEEDBACK_OPEN_EVENT, handler)
  return () => window.removeEventListener(FEEDBACK_OPEN_EVENT, handler)
}
