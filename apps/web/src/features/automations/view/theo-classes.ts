/**
 * Théo C automations-* — la grammaire `.a14-*` des trois maquettes (liste, bibliothèque, éditeur), traduite UNE fois
 * en classes de jetons (aucune couleur hexadécimale, échelle Tailwind seulement — GA-31 / GA-33). Les trois écrans
 * les lisent ici : un bouton, une pastille ou une carte se ressemblent d'un écran à l'autre parce qu'ils sont écrits
 * à un seul endroit (GA-26).
 */

/** `.a14-btn` — bouton contour, 40 px, rayon 10 ; 44 px au doigt (GA-35). */
export const THEO_BTN =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-control border border-[var(--bellum-border)] bg-card px-3.5 py-2 text-sm font-semibold text-[var(--bellum-text-primary)] transition-colors duration-immediate ease-bellum-out hover:border-[var(--bellum-accent-line)] hover:bg-[var(--bellum-surface-2)] disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:min-h-11'

/** `.a14-btn.primary` — l'aplat primaire, une fois par écran. */
export const THEO_BTN_PRIMARY =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-control border border-primary bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-card transition-[filter] duration-immediate ease-bellum-out hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:min-h-11'

/** `.a14-btn.soft` — « Tester le parcours » : l'aplat d'accent, taille normale. */
export const THEO_BTN_SOFT =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-control border border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] px-3.5 py-2 text-sm font-semibold text-[var(--bellum-text-accent)] transition-colors duration-immediate ease-bellum-out hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:min-h-11'

/** `.a14-btn.soft.sm` — « Ouvrir » : l'aplat d'accent, petit. */
export const THEO_BTN_SOFT_SM =
  'inline-flex min-h-8 items-center justify-center gap-1.5 rounded-control border border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] px-2.5 py-1.5 text-xs font-semibold text-[var(--bellum-text-accent)] transition-colors duration-immediate ease-bellum-out hover:brightness-105 pointer-coarse:min-h-11'

/** `.a14-btn.plain.sm` — lien d'action sans contour. */
export const THEO_BTN_PLAIN_SM =
  'inline-flex min-h-8 items-center justify-center gap-1.5 rounded-control px-2.5 py-1.5 text-xs font-semibold text-[var(--bellum-text-primary)] transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bellum-surface-2)] pointer-coarse:min-h-11'

/** `.a14-pill` — pastille neutre, rayon 6. */
export const THEO_PILL =
  'inline-flex items-center gap-1 rounded-badge border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-1.5 py-0.5 text-xs text-[var(--bellum-text-secondary)]'

/** `.a14-pill.purple` — la pastille d'état « Active » : la couleur dit un état. */
export const THEO_PILL_ACCENT =
  'inline-flex items-center gap-1 rounded-badge border border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] px-1.5 py-0.5 text-xs text-[var(--bellum-text-accent)]'

/** `.a14-rule` / `.a14-panel` — la carte aérée des maquettes : rayon 16, 20-22 px de marge, sans ombre au repos. */
export const THEO_CARD = 'min-w-0 rounded-2xl border border-[var(--bellum-border)] bg-card p-5 md:p-6'

/** `.a14-symbol` — le symbole d'une carte : 40 px, aplat d'accent bordé. */
export const THEO_SYMBOL =
  'inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] text-[var(--bellum-text-accent)]'

/** `.a14-eyebrow` — le surtitre en capitales, accent. */
export const THEO_EYEBROW = 'block text-xs font-bold uppercase tracking-widest text-[var(--bellum-text-accent)]'
