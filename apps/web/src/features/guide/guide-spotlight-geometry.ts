/**
 * #2212.3/.9/.17/.18/.19/.20/.21 — LA GÉOMÉTRIE DU SPOTLIGHT, SANS DOM.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER NE CONNAÎT NI `window` NI `Element`
 * ─────────────────────────────────────────────────────────────────────────────
 * « La bulle ne masque pas la cible », « elle s'adapte à la place disponible »,
 * « elle ne passe pas sous l'en-tête collant » sont des affirmations
 * GÉOMÉTRIQUES. Les tester dans un navigateur demanderait de simuler une mise en
 * page réelle — c'est-à-dire de tester jsdom plutôt que la règle. Ici, on donne
 * un rectangle et une fenêtre, on lit une position, et la règle se vérifie sur
 * les cinq positions qui comptent (en haut, au milieu, en bas, collée à gauche,
 * collée à droite).
 *
 * C'est aussi ce qui permet de dire NON sans navigateur : le test
 * « ne recouvre JAMAIS la cible » boucle sur cinq hauteurs, et une régression de
 * placement le fait rougir en nommant la hauteur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il ne pose aucune flèche, aucune ombre, aucune couleur : la couleur du voile
 * et du halo vit en JETONS dans `tokens.css` (D79/GA-33 — aucune valeur
 * hexadécimale dans du JSX, et la parité clair/sombre est une promesse).
 */

/** Un rectangle en coordonnées de FENÊTRE (ce que rend `getBoundingClientRect`). */
export type GuideRect = { top: number; left: number; width: number; height: number }

/**
 * La fenêtre utile. Les deux `inset` sont ce qui est COLLANT : un en-tête sticky
 * en haut, la barre d'onglets mobile en bas (GA-29, quatre onglets). Une cible
 * derrière l'un des deux est invisible même si ses coordonnées sont « dans » la
 * fenêtre — c'est exactement le piège de #2212.19.
 */
export type GuideViewport = {
  width: number
  height: number
  stickyTopInset: number
  stickyBottomInset: number
}

/** La gouttière du produit : 16 px de chaque côté, à toute largeur. */
const GUTTER = 16
/** L'écart entre la cible et la bulle — assez pour que le halo respire. */
const GAP = 12
/** GA-28 — la borne unique du produit entre mobile et bureau. */
const MOBILE_BREAKPOINT = 768

/**
 * #2212.9 — LE HALO : la cible, plus une marge, et rien d'autre.
 *
 * La marge est ce qui fait qu'un halo se lit comme « regarde ici » plutôt que
 * comme une bordure ajoutée au composant. Elle ne rogne jamais la cible, et un
 * élément collé au bord de la fenêtre ne produit pas de coordonnée négative :
 * un halo à `-8` serait rogné par la fenêtre du côté où il compte le plus.
 */
export const GUIDE_SPOTLIGHT_HALO_PADDING = 8

export function guideSpotlightHalo(target: GuideRect): GuideRect {
  const top = Math.max(0, target.top - GUIDE_SPOTLIGHT_HALO_PADDING)
  const left = Math.max(0, target.left - GUIDE_SPOTLIGHT_HALO_PADDING)
  return {
    top,
    left,
    width: target.width + GUIDE_SPOTLIGHT_HALO_PADDING * 2,
    height: target.height + GUIDE_SPOTLIGHT_HALO_PADDING * 2,
  }
}

function unionRect(a: GuideRect, b: GuideRect): GuideRect {
  const top = Math.min(a.top, b.top)
  const left = Math.min(a.left, b.left)
  return {
    top,
    left,
    width: Math.max(a.left + a.width, b.left + b.width) - left,
    height: Math.max(a.top + a.height, b.top + b.height) - top,
  }
}

/** De quel côté de la cible la bulle s'est posée. */
type GuideBubblePlacement = {
  side: 'top' | 'bottom'
  top: number
  left: number
  width: number
}

/**
 * #2212.3/.20/.21 — OÙ POSER LA BULLE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX CÔTÉS, PAS QUATRE — ET C'EST UNE DÉCISION
 * ─────────────────────────────────────────────────────────────────────────────
 * Au-dessus ou en dessous. Jamais à gauche ni à droite. Une bulle latérale de
 * 320 px n'a de place que sur un écran large, ce qui obligerait à un placement
 * différent selon la largeur — donc à deux mises en page à tenir, dont une
 * jamais vue par personne qui teste sur un portable. « Le mobile est le produit,
 * pas un repli » (GA-28) veut dire que le placement est le MÊME partout, et que
 * celui qui marche à 390 px est celui qu'on garde.
 *
 * L'ordre : on préfère EN DESSOUS (on lit de haut en bas, et la bulle ne pousse
 * pas le regard en arrière) ; on bascule au-dessus quand il n'y a pas la place.
 * Quand il n'y a la place ni d'un côté ni de l'autre, on prend le côté le plus
 * grand — et la bulle déborde de la zone utile plutôt que de recouvrir la cible.
 * Voir le commentaire de `top` : cet arbitrage a été mesuré, pas supposé.
 */
export function placeGuideBubble(
  target: GuideRect,
  bubble: { width: number; height: number },
  viewport: GuideViewport,
  keepClear?: GuideRect | null,
): GuideBubblePlacement {
  // R33b (16/10/2026) — « la fenêtre recouvre les amorces de Laura » : sur /chat, la saisie est ciblée et les
  // amorces sont posées juste au-dessus — une bulle « au-dessus de la saisie » les recouvrait. La zone À NE PAS
  // RECOUVRIR (`keepClear`, les éléments `data-guide-keep-clear`) est donc traitée comme une extension de la cible :
  // la bulle se pose au-dessus ou au-dessous de l'ENSEMBLE, jamais dedans.
  const usableTop = viewport.stickyTopInset
  const usableBottom = viewport.height - viewport.stickyBottomInset
  // Garde-fou : si aucun côté de l'ENSEMBLE ne loge la bulle (mobile 375×812, amorces hautes), l'extension ne tient pas —
  // on retombe sur la cible seule. Mieux vaut recouvrir les amorces que la saisie ciblée (le bouton « Envoyer » devenait
  // inatteignable). La cible, elle, n'est jamais recouverte.
  const union = keepClear ? unionRect(target, keepClear) : target
  const fits = (z: GuideRect) =>
    usableBottom - (z.top + z.height) - GAP >= bubble.height || z.top - usableTop - GAP >= bubble.height
  const zone = fits(union) ? union : target

  // La largeur : celle demandée, mais jamais plus que la place entre gouttières.
  // Sous la borne mobile, on prend TOUTE la largeur utile plutôt que d'être rogné.
  const available = Math.max(1, viewport.width - GUTTER * 2)
  const width = viewport.width < MOBILE_BREAKPOINT ? available : Math.min(bubble.width, available)

  // #2212.21 — la place réellement disponible de chaque côté, insets compris.
  const roomBelow = usableBottom - (zone.top + zone.height) - GAP
  const roomAbove = zone.top - usableTop - GAP

  const side: 'top' | 'bottom' = roomBelow >= bubble.height || roomBelow >= roomAbove ? 'bottom' : 'top'

  // #2212.20 — LA SEULE RÈGLE QUI NE PLIE PAS : la bulle est hors de la cible.
  //
  // Il n'y a donc AUCUN rabattement vertical dans la zone utile. C'est un
  // arbitrage, et il est mesuré : une première version ramenait la bulle entre
  // `usableTop` et `usableBottom`, et sur une fenêtre courte (cible à 150 px,
  // hauteur 200 px) ce rabattement reposait la bulle SUR la cible — le guide
  // masquait précisément ce qu'il désignait. Entre « déborder de la zone utile »
  // et « recouvrir la cible », recouvrir est la faute ; déborder se voit et se
  // corrige en amenant d'abord la cible à l'écran (`needsScrollIntoView`, que
  // l'appelant consulte AVANT de placer).
  const top = side === 'bottom' ? zone.top + zone.height + GAP : zone.top - GAP - bubble.height

  // Centrée sur la cible, puis ramenée entre les gouttières (#2212.21).
  const centred = target.left + target.width / 2 - width / 2
  const left = Math.min(Math.max(centred, GUTTER), Math.max(GUTTER, viewport.width - GUTTER - width))

  return { side, top, left, width }
}

/**
 * #2212.17/.18/.19 — FAUT-IL AMENER LA CIBLE À L'ÉCRAN AVANT DE MONTRER QUOI QUE
 * CE SOIT.
 *
 * Une cible « dans la fenêtre » au sens des coordonnées peut être invisible :
 * derrière un en-tête collant, ou derrière la barre d'onglets du mobile. Poser
 * un halo là revient à mettre en lumière quelque chose que personne ne voit —
 * pire qu'un guide muet, parce que la bulle, elle, se voit.
 *
 * La réponse est un booléen : c'est l'appelant qui décide COMMENT amener la
 * cible (le défilement appartient au navigateur, et il respecte le réglage
 * « moins de mouvement » de la personne sans qu'on ait rien à coder).
 */
export function needsScrollIntoView(target: GuideRect, viewport: GuideViewport): boolean {
  const usableTop = viewport.stickyTopInset
  const usableBottom = viewport.height - viewport.stickyBottomInset
  return target.top < usableTop || target.top + target.height > usableBottom
}
