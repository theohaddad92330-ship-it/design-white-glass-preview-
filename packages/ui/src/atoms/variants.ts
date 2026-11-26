export type SemanticVariant = 'default' | 'info' | 'success' | 'warning' | 'danger'
export type ComponentSize = 'sm' | 'md' | 'lg'

type SemanticPalette = {
  bg: string
  bgSubtle: string
  text: string
  border: string
  ring: string
  icon: string
}

/*
 * Bellum semantic palette — uses CSS var tokens from tokens.css.
 *
 * #3761 — `text` passe par `--{variant}-soft-text` : c'est la SEULE famille de
 * jetons de texte sémantique posée pour les deux thèmes à la fois (GA-33,
 * `theme-parity.test.ts`), une valeur par thème déjà résolue dans `tokens.css`
 * — aucune paire `dark:` à écrire à la main ici. `info` et `danger` lisaient
 * jusque-là le jeton BRUT (`--bellum-info` / `--bellum-danger`, pensé pour une
 * PASTILLE ou une ICÔNE, pas pour du texte) dans les DEUX thèmes : 3,60:1 et
 * 3,00:1 en clair, sous le seuil AA (4,5:1) des deux côtés — c'est le jeton
 * que `ReplyStatusBadge` (reply-kit) pose sur son libellé « Non disponible »
 * et « Info » pour toute réponse structurée de Laura.
 * `icon` garde le jeton brut : une icône demande 3:1, pas 4,5:1, et c'est elle
 * qui doit rester la teinte vive — c'est le texte qui a besoin de la variante
 * assombrie/éclaircie. */
export const semanticColors: Record<SemanticVariant, SemanticPalette> = {
  default: {
    bg: 'bg-secondary dark:bg-secondary',
    bgSubtle: 'bg-secondary/50 dark:bg-secondary/30',
    text: 'text-foreground',
    border: 'border-border',
    ring: 'ring-border/50',
    icon: 'text-muted-foreground',
  },
  info: {
    bg: 'bg-[color-mix(in_srgb,var(--bellum-info)_12%,transparent)] dark:bg-[color-mix(in_srgb,var(--bellum-info)_10%,transparent)]',
    bgSubtle: 'bg-[color-mix(in_srgb,var(--bellum-info)_6%,transparent)]',
    text: 'text-[var(--info-soft-text)]',
    border: 'border-[color-mix(in_srgb,var(--bellum-info)_30%,transparent)]',
    ring: 'ring-[color-mix(in_srgb,var(--bellum-info)_30%,transparent)]',
    icon: 'text-[var(--bellum-info)]',
  },
  success: {
    bg: 'bg-[color-mix(in_srgb,var(--bellum-success)_12%,transparent)] dark:bg-[color-mix(in_srgb,var(--bellum-success)_10%,transparent)]',
    bgSubtle: 'bg-[color-mix(in_srgb,var(--bellum-success)_6%,transparent)]',
    text: 'text-[var(--success-soft-text)]',
    border: 'border-[color-mix(in_srgb,var(--bellum-success)_30%,transparent)]',
    ring: 'ring-[color-mix(in_srgb,var(--bellum-success)_30%,transparent)]',
    icon: 'text-[var(--bellum-success)]',
  },
  warning: {
    bg: 'bg-[color-mix(in_srgb,var(--bellum-warning)_12%,transparent)] dark:bg-[color-mix(in_srgb,var(--bellum-warning)_10%,transparent)]',
    bgSubtle: 'bg-[color-mix(in_srgb,var(--bellum-warning)_6%,transparent)]',
    text: 'text-[var(--warning-soft-text)]',
    border: 'border-[color-mix(in_srgb,var(--bellum-warning)_30%,transparent)]',
    ring: 'ring-[color-mix(in_srgb,var(--bellum-warning)_30%,transparent)]',
    icon: 'text-[var(--bellum-warning)]',
  },
  danger: {
    bg: 'bg-[color-mix(in_srgb,var(--bellum-danger)_12%,transparent)] dark:bg-[color-mix(in_srgb,var(--bellum-danger)_10%,transparent)]',
    bgSubtle: 'bg-[color-mix(in_srgb,var(--bellum-danger)_6%,transparent)]',
    text: 'text-[var(--danger-soft-text)]',
    border: 'border-[color-mix(in_srgb,var(--bellum-danger)_30%,transparent)]',
    ring: 'ring-[color-mix(in_srgb,var(--bellum-danger)_30%,transparent)]',
    icon: 'text-[var(--bellum-danger)]',
  },
}
