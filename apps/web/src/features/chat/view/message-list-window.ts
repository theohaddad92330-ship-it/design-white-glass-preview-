/**
 * #2441.11 — LA FENÊTRE DE VIRTUALISATION du fil de messages.
 *
 * Extraite en pur (pas de DOM), même discipline que `should-auto-scroll.ts` à
 * côté : jsdom ne calcule jamais de vraie hauteur de layout, donc un test qui
 * mesurerait un vrai conteneur scrollable serait vert quelle que soit
 * l'implémentation (`sonde-mise-en-page-corpus-vide`). C'est cette fonction,
 * nourrie des hauteurs (mesurées ou estimées) et du scroll, qui décide quels
 * indices monter — `Chat.tsx` (ou le composant qui le remplace) lit le vrai
 * `scrollTop`/`clientHeight` du conteneur et un cache de hauteurs mesurées.
 *
 * Portée : cette fonction résout la fenêtre visible. Elle ne mesure rien
 * elle-même (pas de ResizeObserver ici) et n'est pas encore câblée dans
 * `Chat.tsx` — #2451 réécrit ce fichier en parallèle ; le câblage (remplacer
 * `messages.map` par un rendu fenêtré + un spacer `offsetTop`/`totalHeight`)
 * reste à faire une fois cette réécriture posée.
 */
type VirtualWindowInput = {
  /** Une hauteur par message, en pixels — mesurée si connue, estimée sinon. */
  itemHeights: readonly number[]
  /** `scrollTop` du conteneur réel. Négatif accepté, clampé à 0. */
  scrollTop: number
  /** `clientHeight` du conteneur réel. */
  viewportHeight: number
  /** Messages supplémentaires montés de part et d'autre de la zone visible,
   *  pour absorber un scroll rapide sans flash de contenu vide. */
  overscan?: number
}

type VirtualWindow = {
  /** Premier index à monter (inclus). */
  startIndex: number
  /** Dernier index à monter (inclus). `-1` si la liste est vide. */
  endIndex: number
  /** Hauteur cumulée de tout ce qui précède `startIndex` — le spacer du haut. */
  offsetTop: number
  /** Hauteur cumulée de la liste entière — la hauteur du scroll virtuel. */
  totalHeight: number
}

const DEFAULT_OVERSCAN = 3

export function computeVirtualWindow(input: VirtualWindowInput): VirtualWindow {
  const { itemHeights, viewportHeight } = input
  const overscan = input.overscan ?? DEFAULT_OVERSCAN
  const scrollTop = Math.max(0, input.scrollTop)
  const itemCount = itemHeights.length

  if (itemCount === 0) {
    return { startIndex: 0, endIndex: -1, offsetTop: 0, totalHeight: 0 }
  }

  // Sommes cumulées : offsets[i] = hauteur de tout ce qui précède l'index i.
  const offsets = new Array<number>(itemCount + 1)
  offsets[0] = 0
  for (let i = 0; i < itemCount; i += 1) {
    offsets[i + 1] = offsets[i] + itemHeights[i]
  }
  const totalHeight = offsets[itemCount]

  const viewportBottom = scrollTop + viewportHeight

  // Premier index dont le BAS dépasse `scrollTop` (le premier partiellement visible).
  let firstVisible = 0
  while (firstVisible < itemCount && offsets[firstVisible + 1] <= scrollTop) {
    firstVisible += 1
  }
  // Dernier index dont le HAUT est encore avant le bas du viewport.
  let lastVisible = firstVisible
  while (lastVisible < itemCount - 1 && offsets[lastVisible + 1] < viewportBottom) {
    lastVisible += 1
  }

  const startIndex = Math.max(0, firstVisible - overscan)
  const endIndex = Math.min(itemCount - 1, lastVisible + overscan)

  return { startIndex, endIndex, offsetTop: offsets[startIndex], totalHeight }
}
