/**
 * Le jeu de tokens tel que le plugin Figma le consomme — la forme de
 * `generated/tokens.json`.
 *
 * La SOURCE reste le code : `apps/web/src/styles/tokens.css` (+ le `--radius`
 * de `index.css`, le `zIndex` de `tailwind.config.ts`, `EASE`/`DURATION` de
 * `packages/ui/src/motion.ts`). Un token naît dans le CSS, jamais dans Figma
 * seul : ce fichier n'est qu'une photographie typée, régénérée par
 * `pnpm --filter @bellum/figma-sync extract`.
 */

/** Une couleur en composantes 0..1, comme l'attend l'API Figma. */
export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

/**
 * La valeur d'une couleur dans UN mode : soit une couleur, soit un ALIAS vers
 * une autre variable CSS (`var(--bellum-primary-500)` → `{ kind: 'alias',
 * ref: '--bellum-primary-500' }`). Un alias reste un alias : recopier la
 * valeur casserait le lien que Figma sait tenir entre deux variables.
 */
export type ColorValue = { kind: 'color'; rgba: Rgba } | { kind: 'alias'; ref: string }

/** Une couleur de la collection `Primitives` (un seul mode, masquée des sélecteurs). */
export interface PrimitiveColor {
  /** Chemin Figma, ex. `primary/500`, `semantic/success`. */
  name: string
  /** Le vrai nom CSS, ex. `--bellum-primary-500` — sert au code syntax WEB. */
  cssVar: string
  value: Rgba
}

/** Une couleur de la collection `Color`, modes Light (`:root`) et Dark (`.dark`). */
export interface ModeColor {
  name: string
  cssVar: string
  light: ColorValue
  dark: ColorValue
}

/** Une dimension en px (rayon, espacement). `cssVar` absent = pas de variable CSS dans le code. */
export interface DimensionToken {
  name: string
  cssVar?: string
  /** La classe Tailwind qui pose cette valeur quand aucune variable CSS ne la porte (`rounded-md`). */
  className?: string
  value: number
}

export interface ShadowLayer {
  x: number
  y: number
  blur: number
  spread: number
  /** Couleur RÉSOLUE pour ce mode (Figma n'a pas d'effet par mode). */
  color: Rgba
  /** La variable CSS d'origine quand la couleur était un `var(…)`, pour la lier. */
  ref?: string
}

export interface ShadowToken {
  /** ex. `card`, `elevated`, `glow-violet`. */
  name: string
  /** La variable CSS (`--shadow-card`) ; absente pour une ombre du thème Tailwind (voir `className`). */
  cssVar?: string
  /** La classe Tailwind (`shadow-md`) quand l'ombre vient du thème Tailwind, pas de tokens.css. */
  className?: string
  light: ShadowLayer[]
  dark: ShadowLayer[]
}

export interface TextStyleToken {
  /** ex. `display`, `body`, `mono`. */
  name: string
  /** La classe CSS source, ex. `.text-body`. */
  className: string
  fontFamily: string
  fontWeight: number
  /** px */
  fontSize: number
  /** Multiplicateur (1.5 = 150 %). */
  lineHeight: number
  /** em (0.03 = 3 %). */
  letterSpacingEm: number
  /** La variable CSS de la couleur par défaut du style. */
  color: string
}

export interface MotionTokens {
  ease: { name: string; bezier: [number, number, number, number] }[]
  durations: { name: string; ms: number }[]
}

/**
 * Ce que l'extraction n'a PAS pris, et pourquoi. Un token absent ou illisible
 * atterrit ici — il n'est jamais remplacé par une valeur devinée.
 */
export interface SkippedToken {
  /** Variable CSS, classe, ou nom de bloc (`zIndex`, `EASE`…). */
  cssVar: string
  /** `fichier:ligne` relatif à la racine du dépôt. */
  source: string
  reason: string
  /**
   * `true` pour une exclusion VOULUE (ex. une valeur qui dépend du `@media` —
   * pas un token de mode), jamais pour une vraie anomalie (valeur illisible ou
   * absente). Le plugin la journalise en `info`, pas en `warn` : la planche
   * « Non importés » continue de lister les deux avec leur raison.
   */
  intended?: boolean
}

export interface TokenSet {
  sources: string[]
  primitives: PrimitiveColor[]
  colors: ModeColor[]
  radius: DimensionToken[]
  spacing: DimensionToken[]
  zIndex: DimensionToken[]
  shadows: ShadowToken[]
  textStyles: TextStyleToken[]
  motion: MotionTokens
  skipped: SkippedToken[]
}

export interface SourceFile {
  /** Chemin relatif à la racine du dépôt, recopié tel quel dans `source`. */
  path: string
  content: string
}

export interface TokenSources {
  tokensCss: SourceFile
  indexCss: SourceFile
  tailwindConfig: SourceFile
  motionTs: SourceFile
  /** Le thème par défaut de Tailwind INSTALLÉ (`stubs/config.full.js`) : rayons et ombres que le config n'étend pas. */
  tailwindDefaults: SourceFile
}
