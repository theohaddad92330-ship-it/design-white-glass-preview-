import type { Submission } from '@bellum/contracts'

/** #4344.4 — le nombre d'aperçus nommés sur la fiche d'une affaire. */
export const SHORTLIST_PREVIEW_SIZE = 3

type NeedShortlist = {
  /** Tous les positionnés sur CE besoin — jamais ceux des rôles voisins du même projet. */
  count: number
  /** Les premiers, dans l'ordre de lecture. */
  first: Submission[]
}

/**
 * #4344.4 — la shortlist d'UN besoin : les positionnements dont `needId` est ce besoin.
 *
 * Un positionnement sans `needId` n'est attribué à aucun besoin (le lui donner serait une supposition,
 * même règle que `NeedPositioningsTab`). Vide = AUCUNE shortlist : l'appelant n'affiche rien, jamais « 0 ».
 */
export function shortlistOf(items: readonly Submission[], needId: string, limit?: number): NeedShortlist {
  const mine = items.filter(item => item.needId === needId)
  return { count: mine.length, first: limit === undefined ? mine : mine.slice(0, limit) }
}
