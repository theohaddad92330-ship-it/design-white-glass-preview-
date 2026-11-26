/**
 * L'échelle typographique par RÔLE — titre de page, titre de section, chiffre
 * clé, texte, libellé (#4332.1, refonte transverse du 19/10/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * GA-31 a posé le plancher (12 px) et les barreaux (ceux de Tailwind). Il ne
 * disait pas QUEL barreau porte quel rôle, et chaque écran choisissait : le
 * titre de page valait `text-2xl font-bold` sur le Tableau de bord et
 * `size="lg"` sur la Messagerie, un chiffre clé `text-2xl`, `xl` ou `lg`
 * selon la carte. Même cause que `motion.ts` : un vocabulaire existait, il
 * n'avait pas de grammaire écrite à un seul endroit.
 *
 * Le chiffre clé reprend la grammaire du Cockpit (PR #4211, `WeekDeltaStrip`) :
 * `text-lg`, interligne serré, chiffres tabulaires — DENSE, lisible d'un coup
 * d'œil, sans carte d'ouverture.
 *
 * Garde : `apps/web/src/architecture/lot-screens-use-the-type-scale.test.ts`
 * refuse, dans les écrans passés à l'échelle, une taille au-dessus du corps
 * écrite à la main.
 */
export const TYPE_SCALE = {
  /** Le titre de la page (un `h1` par écran). 20 px. */
  pageTitle: 'text-xl font-semibold leading-tight',
  /** Le titre d'une section de la page (`h2`). 16 px. */
  sectionTitle: 'text-base font-semibold',
  /** Un chiffre qu'on lit d'un coup d'œil — compteur, total, réalisé. 18 px. */
  keyFigure: 'text-lg font-semibold leading-none tabular-nums',
  /** Le texte courant. 14 px. */
  body: 'text-sm',
  /** Le libellé d'un chiffre, la portée, la métadonnée. 12 px — le plancher (GA-31). */
  label: 'text-xs',
} as const

/** Les espacements de la même grammaire : entre sections, et dans un groupe dense. */
export const SPACE_SCALE = {
  section: 'gap-4',
  group: 'gap-2',
} as const
