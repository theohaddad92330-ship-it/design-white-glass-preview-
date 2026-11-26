import type { BoxStyle, ColorName, TextOptions } from '../scene'

/**
 * La RECETTE d'un composant : une fonction pure « valeurs de variante → arbre
 * de parties », écrite en lisant le fichier source (classes Tailwind, cva).
 * Le moteur (`engine.ts`) la rend en nœuds Figma liés aux variables, une fois
 * par combinaison de variantes. Aucune couleur n'y est une valeur : ce sont des
 * NOMS de variables (`text/primary`, `primary/500`).
 */

/** Les pages Figma des composants (une par famille). */
export const FAMILIES = ['Actions', 'Formulaires', 'Données', 'Navigation', 'Retours', 'Surfaces', 'Identité'] as const
export type Family = (typeof FAMILIES)[number]

/** Les valeurs de variante d'UNE combinaison (`{ variant: 'outline', size: 'sm' }`). */
export type Values = Readonly<Record<string, string>>

interface Common {
  name: string
  fillWidth?: boolean
  fillHeight?: boolean
  grow?: boolean
  /** Caché dans cette variante. */
  hidden?: boolean
  /** Nom d'une propriété BOOLEAN du composant qui montre/cache la partie (ex. `show icon`). */
  toggle?: string
  /** Hors du flux auto-layout, posé en (0,0) de son parent (les arcs superposés d'un anneau) — ou en `at`. */
  absolute?: boolean
  /** Position d'une partie `absolute` dans son parent (px, peut être négative : une zone tactile qui déborde). */
  at?: { x: number; y: number }
}

export interface BoxPart extends Common {
  kind: 'box'
  style: BoxStyle
  children: Part[]
}

interface TextPart extends Common {
  kind: 'text'
  value: string
  /** Propriété TEXT du composant (une clé `content` du catalogue : `label`, `title`…). */
  prop?: string
  opts: TextOptions
  /**
   * Remplit la largeur de son parent et se coupe « … » après N lignes (`truncate` / `line-clamp-N`
   * du code) : un contenu de page long ne pousse plus la largeur de son composant.
   */
  truncate?: 1 | 2
  /**
   * Largeur minimale en caractères d'un texte étiré : dans une rangée qui passe à la ligne (`wrap`), c'est
   * elle qui fait passer la valeur SOUS le libellé plutôt que de les écraser tous deux (défaut C, 25/09/2026).
   */
  minChars?: number
}

interface IconPart extends Common {
  kind: 'icon'
  /** Nom lucide en kebab-case (`search`, `chevron-down`). */
  icon: string
  size: number
  color: ColorName
  /** Propriété INSTANCE_SWAP (jamais une variante par icône). */
  prop?: string
}

interface ShapePart extends Common {
  kind: 'shape'
  shape: 'rect' | 'ellipse'
  width: number
  height: number
  fill?: ColorName
  fillOpacity?: number
  stroke?: ColorName
  strokeWidth?: number
  radius?: string | number
  /** Arc d'ellipse (radians, `inner` = rayon intérieur 0..1) : une part d'anneau (Donut). */
  arc?: { start: number; end: number; inner: number }
}

/** Une instance d'un AUTRE composant du catalogue (le bouton d'un état vide, le spinner d'un bouton). */
interface RefPart extends Common {
  kind: 'ref'
  component: string
  values?: Values
  content?: Readonly<Record<string, string>>
}

export type Part = BoxPart | TextPart | IconPart | ShapePart | RefPart

export interface Recipe {
  family: Family
  /** Quand l'utiliser — la première ligne de la description Figma. */
  usage: string
  /**
   * Plancher tactile (px) quand le code porte `pointer-coarse:min-h-11` (GA-30/32) —
   * posé sur les instances des largeurs mobiles. Une fonction : le bouton `link`
   * n'en a pas (le code le neutralise).
   */
  touch?: (v: Values) => { minHeight?: number; minWidth?: number } | null
  /** Ce que la maquette ne peut pas rendre fidèlement, ou ce que le code fait hors tokens. */
  notes?: readonly string[]
  /**
   * Dans une page, l'instance prend toute la largeur de son slot (tableau, bandeau, carte). Une
   * fonction quand seule une variante s'étire (SearchInput `md` = `w-full`, `sm` = `w-48 lg:w-64`).
   * `'narrow'` : largeur de son contenu (HUG), étiré seulement sous 768 px ou dans une colonne étroite, où il
   * défile (segments, ModeTabs — défaut H du 25/09/2026).
   */
  stretch?: boolean | 'narrow' | ((v: Values) => boolean)
  draw(v: Values): BoxPart
}

/**
 * Les textes d'auteur qui sont de la VRAIE copie du produit (le code les écrit tels quels) : ils restent
 * affichés quand une page ne les fournit pas. Tout autre texte lié à une propriété (« Libellé »,
 * « Description », « Une phrase de description. ») est une valeur de DÉMONSTRATION : une page qui ne le
 * fournit pas le MASQUE (propriété BOOLEAN `show <prop>`), elle ne le laisse jamais fuir (25/09/2026).
 */
export const REAL_COPY: ReadonlySet<string> = new Set([
  'Sur cette page', // section-sidebar-nav.tsx:52
  'Aujourd’hui', // la barre de l'app et la frise (i18n nav.items)
  '••••••••', // valeur masquée d'un champ mot de passe
  'Mot de passe',
  'Crédits',
  'Je n’ai pas pu charger ce contenu.', // GenericProblemMessage (chat.json, onboarding.json)
  'Réessaie dans un instant.',
  'non mesuré', // « non mesuré » n'est jamais 0 (GA-18/19)
  '—',
])

// ─── Petits constructeurs de parties (lisibilité des recettes) ─────────────

export const b = (name: string, style: BoxStyle, children: Part[] = [], extra: Partial<BoxPart> = {}): BoxPart => ({
  kind: 'box',
  name,
  style,
  children,
  ...extra,
})

export const t = (name: string, value: string, opts: TextOptions, extra: Partial<TextPart> = {}): TextPart => ({
  kind: 'text',
  name,
  value,
  opts,
  ...extra,
})

export const i = (icon: string, size: number, color: ColorName, extra: Partial<IconPart> = {}): IconPart => ({
  kind: 'icon',
  name: extra.name ?? `icon`,
  icon,
  size,
  color,
  ...extra,
})

export const rect = (name: string, width: number, height: number, extra: Partial<ShapePart> = {}): ShapePart => ({
  kind: 'shape',
  shape: 'rect',
  name,
  width,
  height,
  ...extra,
})

export const dot = (name: string, size: number, fill: ColorName, extra: Partial<ShapePart> = {}): ShapePart => ({
  kind: 'shape',
  shape: 'ellipse',
  name,
  width: size,
  height: size,
  fill,
  ...extra,
})

export const ref = (
  component: string,
  values: Values = {},
  content: Record<string, string> = {},
  extra: Partial<RefPart> = {},
): RefPart => ({
  kind: 'ref',
  name: component,
  component,
  values,
  content,
  ...extra,
})

/** Les N entrées d'un composant à `items` : `item/1`…`item/N` (le rendu de page les renomme et cache le surplus). */
export function items(
  labels: readonly string[],
  draw: (label: string, index: number) => Part[],
  style: (index: number) => BoxStyle,
): BoxPart[] {
  return labels.map((label, index) => b(`item/${index + 1}`, style(index), draw(label, index)))
}
