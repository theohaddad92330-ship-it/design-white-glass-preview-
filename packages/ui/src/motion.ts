/**
 * Le vocabulaire de mouvement du produit — douze mouvements, et rien d'autre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Mesuré le 23/08/2026 : 121 fichiers utilisent `framer-motion`,
 * `EASE_OUT_EXPO = [0.32, 0.72, 0, 1]` était **redéfini dans quatre fichiers**,
 * et huit durées différentes circulaient (0,18 · 0,2 · 0,22 · 0,24 · 0,3 ·
 * 0,32 · 0,4 · 0,5 s). Le mouvement existait, il était plutôt de bon goût, et
 * il n'avait pas de grammaire : le produit paraissait légèrement différent d'un
 * écran à l'autre sans qu'on sache dire pourquoi.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES TROIS RÈGLES
 * ─────────────────────────────────────────────────────────────────────────
 * 1. **Un mouvement répond à une question** : d'où ça vient, où c'est allé,
 *    est-ce que ça travaille, est-ce que ça a marché, qu'est-ce qui a changé.
 * 2. **S'il ne répond à aucune question, il n'existe pas.** Un élément sans
 *    provenance apparaît en fondu simple — pas de translation, pas d'échelle.
 * 3. **Le mouvement ne fait jamais attendre.** Si une donnée est prête, elle
 *    s'affiche ; l'animation l'accompagne, elle ne la précède pas.
 */

/**
 * Les quatre courbes. `out` est la valeur DÉJÀ utilisée dans le dépôt : on la
 * centralise plutôt que d'en imposer une nouvelle.
 */
export const EASE = {
  /** expo — entrées : la matière arrive vite puis se pose. */
  out: [0.32, 0.72, 0, 1],
  /** symétrique — déplacements, ouvertures. */
  inOut: [0.65, 0, 0.35, 1],
  /** sorties — on accélère vers la disparition. */
  in: [0.55, 0, 1, 0.45],
  /** focus, curseurs. Jamais du contenu. */
  linear: [0, 0, 1, 1],
} as const

/**
 * Les quatre paliers de durée, en secondes.
 *
 * Interdits, et la garde les compte : moins de 100 ms (invisible, donc inutile),
 * plus de 600 ms hors boucle (on attend), toute durée non listée.
 */
export const DURATION = {
  /** 120–200 ms — retours d'interaction : survol, focus, fermeture. */
  immediate: 0.16,
  /** 220–320 ms — entrées, transitions, déplacements. */
  perceptible: 0.26,
  /** 400–600 ms — confirmations, moments qui comptent. */
  narrative: 0.4,
  /** 1 200–2 000 ms en boucle — attente, respiration. */
  ambient: 1.6,
} as const

type Variant = {
  initial?: Record<string, unknown>
  animate: Record<string, unknown>
  exit?: Record<string, unknown>
  transition: Record<string, unknown>
}

/**
 * Les douze mouvements. Chacun porte SA question dans son nom et son commentaire
 * — c'est ce qui permet de choisir sans réfléchir, et de refuser un treizième.
 */
export const MOTION = {
  /** M1 — « voici une information ». Le fondu simple, le défaut. */
  reveal: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.22, ease: EASE.out },
  },
  /** M2 — « ça vient d'arriver ». */
  enterFromBelow: {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 8 },
    transition: { duration: 0.28, ease: EASE.out },
  },
  /** M3 — « ça vient d'ailleurs dans l'écran ». */
  enterFromSide: {
    initial: { opacity: 0, x: 16 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 16 },
    transition: { duration: 0.26, ease: EASE.out },
  },
  /** M4 — « il y a plus à voir ». Hauteur automatique, pas de saut. */
  expand: {
    initial: { opacity: 0, height: 0 },
    animate: { opacity: 1, height: 'auto' },
    exit: { opacity: 0, height: 0 },
    transition: { duration: 0.24, ease: EASE.inOut },
  },
  /** M5 — « on referme ». */
  collapse: {
    initial: { opacity: 1, height: 'auto' },
    animate: { opacity: 0, height: 0 },
    transition: { duration: 0.18, ease: EASE.in },
  },
  /** M6 — « ça a changé de place ». Un ressort doux, jamais un rebond. */
  settle: {
    animate: { opacity: 1, y: 0, x: 0 },
    transition: { type: 'spring', stiffness: 320, damping: 32, mass: 0.8 },
  },
  /** M7 — « regarde ici, une fois ». Échelle plafonnée à 1,04. */
  pulseOnce: {
    animate: { scale: [1, 1.04, 1] },
    transition: { duration: 0.6, ease: EASE.inOut },
  },
  /** M8 — « ça travaille ». L'un des deux SEULS mouvements en boucle. */
  breathe: {
    animate: { opacity: [0.55, 1, 0.55] },
    transition: { duration: 1.6, ease: EASE.inOut, repeat: Infinity },
  },
  /** M9 — « c'est fait ». Puis retour au calme immédiat. */
  confirm: {
    initial: { opacity: 0, scale: 0.98 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.4, ease: EASE.out },
  },
  /** M10 — « non, et voici pourquoi ». Décalage latéral de 6 px, une fois. */
  reject: {
    animate: { x: [0, -6, 6, 0] },
    transition: { duration: 0.3, ease: EASE.out },
  },
  /** M11 — « ça part, tu peux le retrouver là ». */
  dismiss: {
    initial: { opacity: 1 },
    animate: { opacity: 0, y: -8 },
    transition: { duration: 0.2, ease: EASE.in },
  },
  /** M12 — « le clavier est ici ». Jamais réduit : c'est une aide, pas une
   *  décoration. */
  focusRing: {
    animate: { opacity: 1 },
    transition: { duration: 0.12, ease: EASE.linear },
  },
} as const satisfies Record<string, Variant>

export type MotionName = keyof typeof MOTION

/**
 * La transition d'un `layout` framer-motion — quand une ligne change de place.
 *
 * Elle était recopiée à l'identique dans quatre fichiers (portefeuille, veille,
 * contacts, entités), tous avec `bounce: 0` : le bon réglage, écrit quatre
 * fois. C'est `MOTION.settle` sous la forme que `layout` attend.
 */
export const LAYOUT_TRANSITION = { type: 'spring', duration: 0.32, bounce: 0 } as const

/**
 * Le décalage en cascade — 40 ms d'écart, plafonné à huit éléments.
 *
 * Au-delà de huit, tout entre ensemble : un décalage sur trente lignes produit
 * une seconde d'attente inutile, c'est-à-dire le mouvement qui fait attendre —
 * exactement ce que la règle 3 interdit.
 */
export const STAGGER_STEP = 0.04
export const STAGGER_MAX_ITEMS = 8

export function staggerDelay(index: number): number {
  if (index < 0) return 0
  return Math.min(index, STAGGER_MAX_ITEMS - 1) * STAGGER_STEP
}

/**
 * Le même mouvement, pour quelqu'un qui a demandé moins de mouvement.
 *
 * **Rien n'est supprimé** : la transition existe toujours, elle est seulement
 * plus courte et sans déplacement. Supprimer la transition ferait apparaître le
 * contenu d'un coup, ce qui est plus brutal que ce dont la personne se plaint.
 *
 * `focusRing` est rendu INTACT — c'est une aide à la navigation clavier, pas
 * une décoration, et la réduire pénaliserait précisément qui en a besoin.
 */
export function reduced<T extends { animate: Record<string, unknown>; transition: Record<string, unknown> }>(
  variant: T,
  name?: MotionName,
): Variant {
  if (name === 'focusRing') return variant
  const strip = (state: Record<string, unknown> | undefined) => {
    if (!state) return state
    const { x: _x, y: _y, scale: _scale, height: _height, ...rest } = state
    return rest
  }
  return {
    initial: strip((variant as { initial?: Record<string, unknown> }).initial) ?? { opacity: 0 },
    animate: strip(variant.animate) ?? { opacity: 1 },
    exit: strip((variant as { exit?: Record<string, unknown> }).exit),
    // Une boucle reste une boucle (« ça travaille » doit continuer de le dire),
    // mais elle cesse de se déplacer.
    transition: variant.transition['repeat'] ? { ...variant.transition, duration: 1.6 } : { duration: 0.12 },
  }
}
