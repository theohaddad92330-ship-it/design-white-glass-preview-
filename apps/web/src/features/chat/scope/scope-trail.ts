import { isSameScope, type ChatScope } from './chat-scope'

/**
 * #1951.17 / #1951.18 / #1951.21 — LA PILE DES PÉRIMÈTRES VISITÉS DANS LA SESSION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS PROMESSES QU'ELLE TIENT, ET POURQUOI ELLES N'EN FONT QU'UNE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour demande trois choses qui ont l'air distinctes : ne JAMAIS changer de
 * périmètre en silence (#1951.17), ne JAMAIS perdre le contexte d'origine
 * (#1951.18), et pouvoir REVENIR au périmètre précédent (#1951.21). Elles n'en
 * font qu'une : la seule façon de tenir les deux dernières est de se souvenir
 * d'où l'on vient, et la seule façon de tenir la première est de pouvoir le
 * NOMMER au moment du changement.
 *
 * ⚠️ L'INCIDENT QUI FONDE CE MODULE. #1779 : un client choisit « Sans compte »,
 * puis reçoit une réponse appuyée sur deux comptes de son portefeuille. Le
 * correctif de septembre a changé le LIBELLÉ du choix — juste, mais partiel :
 * il dit ce que le périmètre COURANT promet, jamais qu'on vient d'en changer.
 * Un périmètre qui change sans le dire reste une méprise, même avec un bon
 * libellé, parce que rien à l'écran ne se met à jour dans le champ de vision de
 * quelqu'un qui tape sa question.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN PAS PORTE SON FIL, ET PAS SEULEMENT SON PÉRIMÈTRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Changer de périmètre OUVRE un fil vierge (`Chat.applyScope`) : c'est voulu, un
 * fil cadré sur Sophie n'est pas la suite du fil cadré sur ACME. Mais si l'on ne
 * retenait que le périmètre, « revenir » rouvrirait un TROISIÈME fil vide sur
 * ACME — le périmètre serait retrouvé et la conversation perdue, ce qui est
 * exactement « perdre le contexte d'origine ». Un pas retient donc les deux.
 *
 * ⚠️ Ce module est PUR et vit dans la SESSION. Il ne persiste rien : un
 * rechargement repart d'une pile vide, et c'est honnête — après un
 * rechargement, « le périmètre précédent » ne veut plus rien dire pour la
 * personne qui revient.
 */

/** Un périmètre visité, et le fil qu'on y avait ouvert. */
export type ScopeStep = {
  scope: ChatScope
  /** L'identifiant du fil ouvert sur ce périmètre — ce qui rend le retour VRAI. */
  conversationId: string
}

export type ScopeTrail = readonly ScopeStep[]

/**
 * Au-delà, ce n'est plus un fil d'Ariane, c'est un historique — et personne ne
 * remonte huit périmètres d'un clic. La borne protège aussi la mémoire d'une
 * session longue, où chaque changement de périmètre empile un pas.
 */
export const SCOPE_TRAIL_MAX = 8

/**
 * Empiler le périmètre qu'on vient de choisir.
 *
 * ⚠️ DEUX CAS QUI NE SONT PAS DES CHANGEMENTS. Rouvrir la modale et confirmer le
 * même choix n'empile rien — sinon « revenir » ramènerait là où l'on est déjà.
 * Et un LIBELLÉ qui a bougé (une fiche renommée entre deux ouvertures) n'est pas
 * un autre périmètre : `isSameScope` compare des IDENTIFIANTS, jamais des noms.
 * Le fil du pas courant est alors rafraîchi — le périmètre n'a pas changé, mais
 * la conversation, si.
 */
export function pushStep(trail: ScopeTrail, next: ScopeStep): ScopeTrail {
  const current = trail.at(-1)
  if (current && isSameScope(current.scope, next.scope)) {
    return [...trail.slice(0, -1), next]
  }
  const grown = [...trail, next]
  if (grown.length <= SCOPE_TRAIL_MAX) return grown
  /**
   * #1951.18 — C'EST LE MILIEU QUI CÈDE, JAMAIS L'ORIGINE.
   *
   * Un `slice(-MAX)` aurait été plus court et aurait fait tomber le premier pas
   * — le périmètre d'où la session est partie, c'est-à-dire précisément « le
   * contexte d'origine » que le retour demande de ne jamais perdre. On garde
   * donc la tête et la queue, et on oublie le rang qui les sépare.
   */
  const [origin, , ...rest] = grown
  return origin ? [origin, ...rest] : grown.slice(-SCOPE_TRAIL_MAX)
}

/** #1951.18 — le périmètre d'où la session est partie. Il ne tombe jamais. */
export function originStep(trail: ScopeTrail): ScopeStep | null {
  return trail[0] ?? null
}

/** #1951.21 — le pas d'avant, ou `null` quand il n'y a rien où revenir. */
export function previousStep(trail: ScopeTrail): ScopeStep | null {
  return trail.length >= 2 ? (trail[trail.length - 2] ?? null) : null
}

/**
 * #1951.21 — revenir au périmètre précédent, AVEC son fil.
 *
 * Rend `null` quand il n'y a rien où revenir : l'écran n'affiche alors aucun
 * bouton, plutôt qu'un bouton désactivé qui promettrait un geste inexistant.
 */
export function returnToPrevious(trail: ScopeTrail): { trail: ScopeTrail; step: ScopeStep } | null {
  const target = previousStep(trail)
  if (!target) return null
  return { trail: trail.slice(0, -1), step: target }
}

/** Ce qu'un changement de périmètre a changé — les DEUX périmètres, nommés. */
export type ScopeChange = { from: ChatScope; to: ChatScope }

/**
 * #1951.17 — LE CHANGEMENT À ANNONCER, ou `null` quand il n'y en a pas.
 *
 * `null` n'est pas une commodité : une bannière « périmètre changé » affichée
 * alors que rien n'a changé apprend à ne plus la lire, et la prochaine — celle
 * qui compte — passera inaperçue.
 */
export function scopeChangeOf(from: ChatScope, to: ChatScope): ScopeChange | null {
  return isSameScope(from, to) ? null : { from, to }
}
