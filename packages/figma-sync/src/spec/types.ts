/**
 * ════════════════════════════════════════════════════════════════════════
 *  LE CONTRAT DES SPECS DE PAGES — ce que chaque lot suivant écrit.
 * ════════════════════════════════════════════════════════════════════════
 *
 * Une page de BellumAI (app, site ou backoffice DM) se décrit par une
 * `PageSpec` : un GABARIT (`TemplateId`), ses SLOTS remplis de `Block`, et
 * ses ÉTATS obligatoires (vide, chargement, erreur). Le plugin Figma lit ces
 * specs et dessine chaque page à partir des mêmes gabarits — c'est ainsi que
 * ~160 écrans s'harmonisent : ils ne peuvent pas inventer leur mise en page,
 * seulement remplir des slots.
 *
 * Trois règles, tenues par le TYPE et par `validatePage` au runtime :
 *
 * 1. Tailles et couleurs UNIQUEMENT par nom de token (`ColorToken`,
 *    `SpaceToken`, `RadiusToken`, `TextStyleName`). Aucune valeur brute
 *    (`#fff`, `16px`) n'est représentable : un token naît dans
 *    `apps/web/src/styles/tokens.css`, jamais dans une spec ni dans Figma.
 * 2. Un composant ne se cite que s'il est au catalogue (`COMPONENTS`), et
 *    seulement avec des variantes qui existent dans son fichier source.
 * 3. Une page dessine TOUS les états de son gabarit — un écran sans état
 *    « vide » se découvre en démo, pas en maquette.
 *
 * Les écarts constatés dans le code (une durée hors `DURATION`, un bouton
 * doublé…) se notent en `uxNotes`, avec leur `fichier:ligne` : la maquette est
 * la cible, la note dit ce que le code fait encore autrement.
 */

import type { COMPONENTS, TEMPLATES, WIDTHS } from './catalog'
import type { COLOR_TOKENS, RADIUS_TOKENS, SHADOW_TOKENS, SPACE_TOKENS, TEXT_STYLES } from './token-names.generated'

// ─── Tokens citables ──────────────────────────────────────────────────────

/** Une couleur de la collection `Color` (modes clair/sombre), ex. `text/primary`, `bg/default`, `soft/danger/bg`. */
export type ColorToken = (typeof COLOR_TOKENS)[number]
/** Un pas de l'échelle d'espacement Tailwind : `'4'` = 16 px (n × 4 px). */
type SpaceToken = (typeof SPACE_TOKENS)[number]
/** `sm` 6 · `md` 10 · `lg` 14 · `xl` 20 · `shadcn` 10 ; classes Tailwind `rounded-sm` 6 · `rounded-md` 8 · `rounded-xl` 12 (px). */
type RadiusToken = (typeof RADIUS_TOKENS)[number]
/** Un style de texte de tokens.css (`.text-display` … `.text-mono`). */
type TextStyleName = (typeof TEXT_STYLES)[number]
/** Une ombre (`card`, `elevated`, `glow-violet` de tokens.css ; `sm`, `md`, `lg` du thème Tailwind installé). */
type ShadowName = (typeof SHADOW_TOKENS)[number]

// ─── Composants ───────────────────────────────────────────────────────────

type Catalog = typeof COMPONENTS

/** Tout composant citable par une spec — l'inventaire réel de `packages/ui` + la coque de l'app. */
type ComponentId = keyof Catalog

type VariantProps<C extends ComponentId> = {
  -readonly [K in keyof Catalog[C]['variants']]?: Catalog[C]['variants'][K] extends readonly (infer V)[] ? V : never
}

type ContentProps<C extends ComponentId> = Catalog[C]['content'] extends readonly []
  ? { content?: never }
  : { content?: Partial<Record<Catalog[C]['content'][number], string>> }

type ItemsProps<C extends ComponentId> = Catalog[C] extends { items: true | number }
  ? { items?: string[] }
  : { items?: never }

/**
 * Le rôle d'une colonne sous 768 px, quand chaque ligne devient une carte (RUX-15, `docs/revue-ux.md`
 * §4) : `title` porte le nom de la ligne, `meta` une deuxième information en avant (« prochaine
 * action » partout où elle existe), `field` une paire étiquette/valeur ordinaire, `hidden` disparaît.
 * Une colonne peut rester une simple chaîne (compatibilité, aucun rôle déclaré) : le rendu retombe
 * alors sur la priorité de POSITION (1 = la plus à gauche).
 */
type MobileColumnRole = 'title' | 'meta' | 'field' | 'hidden'
export type TableColumn = string | { label: string; mobile?: MobileColumnRole; priority?: number }

type TableProps<C extends ComponentId> = Catalog[C] extends { table: true }
  ? { table?: { columns: TableColumn[]; rows: string[][] } }
  : { table?: never }

export const columnLabel = (col: TableColumn): string => (typeof col === 'string' ? col : col.label)
/** 1 = la plus prioritaire ; une colonne sans priorité déclarée vaut sa POSITION (compatibilité). */
export const columnPriority = (col: TableColumn, index: number): number =>
  typeof col === 'string' ? index + 1 : (col.priority ?? index + 1)
export const columnMobileRole = (col: TableColumn): MobileColumnRole | undefined =>
  typeof col === 'string' ? undefined : col.mobile

/**
 * Les props d'un composant dans une spec : ses axes de variante (typés depuis
 * le catalogue), ses textes (`content`), et selon le composant une liste de
 * libellés (`items`) ou un tableau (`table`).
 *
 * @example { variant: 'default', size: 'sm', content: { label: 'Relancer' } } // Button
 */
type ComponentProps<C extends ComponentId> = VariantProps<C> & ContentProps<C> & ItemsProps<C> & TableProps<C>

// ─── Blocs ────────────────────────────────────────────────────────────────

/**
 * Un composant du catalogue, avec ses props. `children` n'est admis que pour
 * les conteneurs (`children: true` au catalogue : Card, Dialog, Sheet…).
 */
type ComponentBlock = {
  [C in ComponentId]: {
    type: 'component'
    component: C
    props: ComponentProps<C>
    children?: Catalog[C] extends { children: true } ? Block[] : never
  }
}[ComponentId]

/** Un texte, toujours dans un style de tokens.css. `color` par défaut = celle du style. */
interface TextBlock {
  type: 'text'
  text: string
  style: TextStyleName
  color?: ColorToken
}

/** Une pile (auto-layout Figma, flex dans le code). */
interface StackBlock {
  type: 'stack'
  direction: 'row' | 'column'
  gap: SpaceToken
  padding?: SpaceToken
  align?: 'start' | 'center' | 'end' | 'stretch'
  justify?: 'start' | 'center' | 'end' | 'between'
  fill?: ColorToken
  stroke?: ColorToken
  radius?: RadiusToken
  shadow?: ShadowName
  /** `true` = occupe la place restante dans sa pile parente. */
  grow?: boolean
  children: Block[]
}

/** Une grille de colonnes égales (KPI, cartes). `columnsMobile` défaut 1. */
interface GridBlock {
  type: 'grid'
  columns: 1 | 2 | 3 | 4 | 5 | 6 | 12
  columnsMobile?: 1 | 2
  gap: SpaceToken
  children: Block[]
}

/**
 * Un emplacement réservé à un contenu que Figma ne rend pas fidèlement
 * (graphe, carte, organigramme, image). Il porte un libellé : jamais une
 * fausse donnée dessinée. Au rendu, un `chart` devient le composant de graphe
 * du catalogue que son libellé désigne (barres, courbe, anneau, cascade,
 * heatmap…), titré par ce libellé ; les autres, une surface token discrète.
 */
interface PlaceholderBlock {
  type: 'placeholder'
  kind: 'chart' | 'map' | 'graph' | 'image' | 'custom'
  label: string
  height: 'sm' | 'md' | 'lg'
}

/** L'arbre de contenu d'un slot. */
export type Block = ComponentBlock | TextBlock | StackBlock | GridBlock | PlaceholderBlock

// ─── Gabarits et pages ────────────────────────────────────────────────────

type Templates = typeof TEMPLATES

/**
 * Les gabarits : `list`, `detail`, `dashboard`, `settings`, `wizard`, `chat`,
 * `auth`, `marketing`, `admin-table`. Leurs slots et états sont au catalogue.
 */
type TemplateId = keyof Templates

/** Les slots nommés d'un gabarit, ex. `SlotOf<'list'>` = `'header' | 'filters' | 'primary' | …`. */
type SlotOf<T extends TemplateId> = Templates[T]['slots'][number]

/** Les états obligatoires d'un gabarit (sous-ensemble de vide / chargement / erreur). */
type StateOf<T extends TemplateId> = Templates[T]['states'][number]

/** Les états FACULTATIFS d'un gabarit : déclarés par la page quand ils ont un sens (ex. `settings` vide). */
type OptionalStateOf<T extends TemplateId> = Templates[T] extends {
  optionalStates: readonly (infer S extends string)[]
}
  ? S
  : never

export type Surface = 'app' | 'site' | 'dm'

/** `desktop` = 1440 px, `mobile` = 390 px (la borne est 768 px, GA-28). */
type Viewport = 'desktop' | 'mobile'

/** Une largeur de référence (px) : `desktop` = 768 → 3440, `mobile` = 320 → 430 (`WIDTHS`, borne 768). */
type Width = (typeof WIDTHS)[number]

/**
 * Une note d'UX attachée à la page :
 * - `ecart`    : le code fait autrement que la maquette (à corriger dans le code) ;
 * - `decision` : un arbitrage déjà tranché qui explique un choix de la maquette.
 * `source` = `chemin/relatif/au/depot.tsx:ligne` — vérifié par le test du registre.
 */
export interface UxNote {
  kind: 'ecart' | 'decision'
  text: string
  source: `${string}:${number}`
}

interface PageSpecOf<T extends TemplateId> {
  /** `<surface>/<slug>`, unique, ex. `app/accounts`. Nom du cadre Figma. */
  id: `${Surface}/${string}`
  surface: Surface
  /** Domaine métier (accounts, contacts, billing…) — regroupe les pages dans Figma. */
  domain: string
  /** Le fichier de route source, relatif à la racine, ex. `apps/web/src/routes/accounts/index.tsx`. */
  route: string
  /** Le titre tel qu'affiché à l'écran (FR). */
  title: string
  template: T
  viewports: readonly Viewport[]
  /** Le contenu de chaque slot. Les slots `required` du gabarit sont obligatoires. */
  slots: Partial<Record<SlotOf<T>, Block[]>>
  /** Pour chaque état obligatoire (et chaque état facultatif déclaré), ce qui REMPLACE le slot `primary`. */
  states: Record<StateOf<T>, Block[]> & Partial<Record<OptionalStateOf<T>, Block[]>>
  uxNotes: UxNote[]
}

/** Une page, quel que soit son gabarit (union discriminée sur `template`). */
export type PageSpec = { [T in TemplateId]: PageSpecOf<T> }[TemplateId]

// ─── Surcouches (overlays) ────────────────────────────────────────────────

/**
 * Les familles de surcouches. Cinq sont MODALES (`dialog`, `confirm`, `wizard`, `command`, `sheet` :
 * la page derrière est assombrie et inerte) ; quatre sont ANCRÉES ou passagères (`popover`,
 * `dropdown`, `tooltip`, `toast` : aucun voile, la page reste lisible).
 */
type OverlayKind = 'dialog' | 'confirm' | 'wizard' | 'command' | 'sheet' | 'popover' | 'dropdown' | 'tooltip' | 'toast'

/** Les variantes de bouton qu'une action de surcouche peut prendre (celles de `Button`). */
type ActionVariant = Catalog['Button']['variants']['variant'][number]

/**
 * Un bouton du pied d'une surcouche, dans l'ordre de LECTURE : le primaire en DERNIER (à droite en
 * bureau, EN HAUT en mobile — le `flex-col-reverse` de `DialogFooter`). Défaut `outline`.
 */
interface OverlayAction {
  label: string
  variant?: ActionVariant
}

/**
 * Une SURCOUCHE maquettée : posée sur sa page parente (une `PageSpec` du registre, ou un gabarit nu
 * quand la page n'est pas maquettée), assombrie par un voile LIÉ à une variable pour les familles
 * modales. Le plugin choisit le contenant selon la famille et le viewport — une spec ne dit jamais
 * « centré » : en mobile, une modale est TOUJOURS un panneau bas pleine largeur.
 *
 * Règles tenues par `validateOverlay` :
 * - destructif ⇒ le bouton primaire est `destructive` et porte un VERBE explicite (jamais « OK »,
 *   « Oui », « Confirmer ») ;
 * - famille modale ⇒ une note d'UX dit où va le focus et ce que fait Échap ;
 * - le backoffice (`dm`) est dessiné en bureau ET sur téléphone (Q7, 25/09/2026).
 */
export interface OverlaySpec {
  /** `<surface>/overlays/<slug>`, unique. Nom du cadre Figma. */
  id: `${Surface}/overlays/${string}`
  surface: Surface
  kind: OverlayKind
  /** La page qui l'ouvre : `{ page: 'app/accounts' }` (registre `PAGES`) ou `{ template: 'list' }`. */
  parent: { page: `${Surface}/${string}` } | { template: TemplateId }
  /** Le composant source : `fichier:ligne` de l'ouverture (`<Dialog`, `<Sheet`…). */
  source: `${string}:${number}`
  /** Le titre tel qu'affiché (FR) ; pour une info-bulle, son texte. */
  title: string
  description?: string
  /** Détruit, efface ou retire ; pour un toast : un ÉCHEC (variante `destructive`). */
  destructive: boolean
  viewports: readonly Viewport[]
  /** Le corps (champs, texte, listes) en blocs du catalogue. Absent pour une confirmation, un toast, une info-bulle. */
  body?: Block[]
  /** Le pied : les boutons, primaire en dernier. */
  actions?: OverlayAction[]
  /** Les entrées d'un menu (`dropdown`), dans l'ordre ; une entrée destructive se nomme par son verbe. */
  items?: string[]
  /** Le libellé du déclencheur d'un menu (`dropdown`). */
  trigger?: string
  uxNotes: UxNote[]
}
