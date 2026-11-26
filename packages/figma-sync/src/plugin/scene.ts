import type { Rgba, TokenSet } from '../extract/types'
import type { Log, VariableLike } from './api'
import { pickFont } from './plan'
import type { VariableIndex } from './variables'

/**
 * Le sous-ensemble de l'API Figma dont les CONSTRUCTEURS (composants,
 * gabarits, pages) ont besoin. Le vrai `figma` s'y assigne tel quel ; le faux
 * (`fake-scene.ts`) en rend un arbre en mémoire qu'un test peut parcourir —
 * c'est ce qui prouve « aucune couleur sans variable » et l'idempotence sans
 * ouvrir Figma.
 */
interface DrawApi {
  createFrame(): FrameNode
  createComponent(): ComponentNode
  createText(): TextNode
  createRectangle(): RectangleNode
  createEllipse(): EllipseNode
  createNodeFromSvg(svg: string): FrameNode
  combineAsVariants(nodes: readonly ComponentNode[], parent: PageNode): ComponentSetNode
  createPage(): PageNode
  root: { children: readonly PageNode[] }
  variables: {
    setBoundVariableForPaint(paint: SolidPaint, field: 'color', variable: Variable | null): SolidPaint
  }
  loadFontAsync(font: FontName): Promise<void>
  listAvailableFontsAsync(): Promise<Font[]>
  getLocalTextStylesAsync(): Promise<TextStyle[]>
  getLocalEffectStylesAsync(): Promise<EffectStyle[]>
}

/** Tout ce qu'un constructeur reçoit : l'API, les variables, les polices chargées, le journal. */
export interface Scene {
  api: DrawApi
  tokens: TokenSet
  vars: VariableIndex
  log: Log
  fonts: Map<number, FontName>
  mono: FontName
  textStyles: Map<string, TextStyle>
  effectStyles: Map<string, EffectStyle>
}

const asVariable = (v: VariableLike | undefined): Variable | undefined => v as unknown as Variable | undefined

export async function prepareScene(api: DrawApi, tokens: TokenSet, vars: VariableIndex, log: Log): Promise<Scene> {
  const available = await api.listAvailableFontsAsync()
  const fonts = new Map<number, FontName>()
  for (const weight of [400, 500, 600, 700]) {
    const { fontName, fallback } = pickFont(available, 'Geist', weight)
    if (fallback && weight === 400) log.warn(`Composants : ${fallback}`)
    await api.loadFontAsync(fontName)
    fonts.set(weight, fontName)
  }
  const monoPick = pickFont(available, 'Geist Mono', 500)
  await api.loadFontAsync(monoPick.fontName)
  const textStyles = new Map((await api.getLocalTextStylesAsync()).map(s => [s.name, s]))
  for (const s of textStyles.values()) await api.loadFontAsync(s.fontName)
  const effectStyles = new Map((await api.getLocalEffectStylesAsync()).map(s => [s.name, s]))
  return { api, tokens, vars, log, fonts, mono: monoPick.fontName, textStyles, effectStyles }
}

// ─── Couleurs : TOUJOURS liées à une variable ───────────────────────────────

/** Une couleur est un nom de variable Figma (`text/primary`, `primary/500`) — jamais une valeur. */
export type ColorName = string

/**
 * Une peinture LIÉE. Un nom inconnu n'est pas remplacé par une couleur devinée :
 * on journalise et on ne peint rien (le trou se voit, il ne ment pas).
 */
export function paint(s: Scene, name: ColorName, opacity = 1): Paint[] {
  const v = asVariable(s.vars.byName.get(name))
  if (!v) {
    s.log.error(`Couleur « ${name} » absente des variables — rien n'est peint`)
    return []
  }
  // La couleur de BASE est ce que Figma montre si la liaison ne se résout pas (variable recréée, collection
  // masquée) : la valeur claire de la variable, jamais un noir par défaut — défaut L du 25/09/2026, Button
  // `default` vu noir sur la page des composants alors qu'il est violet (#5b3ee8) dans button.tsx.
  const { r, g, b } = lightValueOf(s.tokens, name) ?? { r: 0, g: 0, b: 0 }
  const base: SolidPaint = { type: 'SOLID', color: { r, g, b }, opacity }
  return [s.api.variables.setBoundVariableForPaint(base, 'color', v)]
}

const LIGHT = new WeakMap<TokenSet, Map<string, Rgba>>()

/** La valeur en mode clair d'une couleur (primitive ou sémantique, alias résolus). */
function lightValueOf(tokens: TokenSet, name: ColorName): Rgba | undefined {
  let byName = LIGHT.get(tokens)
  if (!byName) {
    const byVar = new Map<string, Rgba>()
    for (const p of tokens.primitives) byVar.set(p.cssVar, p.value)
    const colors = new Map(tokens.colors.map(c => [c.cssVar, c]))
    const resolve = (cssVar: string, depth = 0): Rgba | undefined => {
      const known = byVar.get(cssVar)
      if (known || depth > 8) return known
      const c = colors.get(cssVar)
      if (!c) return undefined
      const v = c.light.kind === 'color' ? c.light.rgba : resolve(c.light.ref, depth + 1)
      if (v) byVar.set(cssVar, v)
      return v
    }
    byName = new Map<string, Rgba>()
    for (const p of tokens.primitives) byName.set(p.name, p.value)
    for (const c of tokens.colors) {
      const v = resolve(c.cssVar)
      if (v) byName.set(c.name, v)
    }
    LIGHT.set(tokens, byName)
  }
  return byName.get(name)
}

// ─── Dimensions : liées quand un token a exactement cette valeur ────────────

type SpaceField = 'itemSpacing' | 'counterAxisSpacing' | 'paddingLeft' | 'paddingRight' | 'paddingTop' | 'paddingBottom'
const CORNERS = ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'] as const

/**
 * Un espacement en px : lié à la variable `Spacing` de même valeur si elle
 * existe (16 → `4`), sinon posé brut (6 px = `gap-1.5`, hors échelle des tokens).
 * Rend `false` quand la valeur n'a pas de token, pour que l'appelant le compte.
 */
export function bindSpace(s: Scene, node: FrameNode | ComponentNode, field: SpaceField, px: number): boolean {
  const token = s.tokens.spacing.find(t => t.value === px)
  const v = token ? asVariable(s.vars.byName.get(token.name)) : undefined
  node[field] = px
  if (v) node.setBoundVariable(field, v)
  return px === 0 || !!v
}

/** Rayon : un nom de token (`md`) ou des px ; `full` = pilule (9999, sans token). */
export function bindRadius(
  s: Scene,
  node: FrameNode | ComponentNode | RectangleNode,
  radius: string | number | undefined,
): boolean {
  if (radius === undefined || radius === 'none' || radius === 0) {
    for (const c of CORNERS) node[c] = 0
    return true
  }
  if (radius === 'full') {
    for (const c of CORNERS) node[c] = 9999
    return true
  }
  // Lié seulement quand le code CITE la variable (`rounded-lg` = `var(--radius)` → `shadcn`) ; un nombre
  // (`rounded-md` = calc(var(--radius) - 2px) = 8 px) reste brut : l'égalité de valeur n'est pas une source.
  const token = typeof radius === 'string' ? s.tokens.radius.find(t => t.name === radius) : undefined
  const px = typeof radius === 'number' ? radius : (token?.value ?? 0)
  const v = token ? asVariable(s.vars.byName.get(token.name)) : undefined
  for (const c of CORNERS) {
    node[c] = px
    if (v) node.setBoundVariable(c, v)
  }
  return !!v
}

// ─── Nœuds ─────────────────────────────────────────────────────────────────

export interface BoxStyle {
  direction?: 'row' | 'column'
  gap?: number
  padX?: number
  padY?: number
  padTop?: number
  padBottom?: number
  fill?: ColorName
  fillOpacity?: number
  stroke?: ColorName
  strokeWidth?: number
  /** Trait d'un seul côté (onglet souligné, séparateur de ligne). */
  strokeSide?: 'bottom' | 'top' | 'right' | 'left'
  dashed?: boolean
  /** Anneau de focus : un contour EXTÉRIEUR (le `ring-*` du code), qui remplace la bordure. */
  ring?: ColorName
  ringWidth?: number
  radius?: string | number
  align?: 'start' | 'center' | 'end' | 'stretch'
  justify?: 'start' | 'center' | 'end' | 'between'
  /** Largeur / hauteur fixes (px) ; absentes = s'ajuste au contenu. */
  width?: number
  height?: number
  minWidth?: number
  minHeight?: number
  opacity?: number
  shadow?: string
  wrap?: boolean
  clip?: boolean
  /**
   * Défile en largeur (le `overflow-x-auto` du code) : contenu rogné, défilement horizontal en
   * prototype. Un tel cadre n'impose PAS la largeur de son contenu à son parent — c'est le but.
   */
  scrollX?: boolean
  /** Toujours sombre, quel que soit le thème (la bulle d'aide du code) : mode Dark explicite de la collection Color. */
  mode?: 'dark'
}

const ALIGN: Record<string, 'MIN' | 'CENTER' | 'MAX'> = { start: 'MIN', center: 'CENTER', end: 'MAX', stretch: 'MIN' }

/** Applique un style de boîte à un cadre auto-layout (jamais de couleur brute). */
export function styleBox(s: Scene, node: FrameNode | ComponentNode, style: BoxStyle): void {
  node.layoutMode = style.direction === 'column' ? 'VERTICAL' : 'HORIZONTAL'
  node.primaryAxisSizingMode = 'AUTO'
  node.counterAxisSizingMode = 'AUTO'
  bindSpace(s, node, 'itemSpacing', style.gap ?? 0)
  bindSpace(s, node, 'paddingLeft', style.padX ?? 0)
  bindSpace(s, node, 'paddingRight', style.padX ?? 0)
  bindSpace(s, node, 'paddingTop', style.padTop ?? style.padY ?? 0)
  bindSpace(s, node, 'paddingBottom', style.padBottom ?? style.padY ?? 0)
  node.primaryAxisAlignItems =
    style.justify === 'between' ? 'SPACE_BETWEEN' : (ALIGN[style.justify ?? 'start'] ?? 'MIN')
  node.counterAxisAlignItems = ALIGN[style.align ?? 'center'] ?? 'CENTER'
  node.fills = style.fill ? paint(s, style.fill, style.fillOpacity) : []
  node.strokes = style.stroke ? paint(s, style.stroke) : []
  if (style.ring) {
    node.strokes = paint(s, style.ring)
    node.strokeAlign = 'OUTSIDE'
    node.strokeWeight = style.ringWidth ?? 2
  } else if (style.stroke) {
    const w = style.strokeWidth ?? 1
    node.strokeAlign = 'INSIDE'
    if (style.strokeSide) {
      node.strokeTopWeight = style.strokeSide === 'top' ? w : 0
      node.strokeBottomWeight = style.strokeSide === 'bottom' ? w : 0
      node.strokeLeftWeight = style.strokeSide === 'left' ? w : 0
      node.strokeRightWeight = style.strokeSide === 'right' ? w : 0
    } else node.strokeWeight = w
    if (style.dashed) node.dashPattern = [4, 4]
  }
  bindRadius(s, node, style.radius)
  if (style.wrap) node.layoutWrap = 'WRAP'
  if (style.clip !== undefined) node.clipsContent = style.clip
  if (style.scrollX) {
    node.clipsContent = true
    node.overflowDirection = 'HORIZONTAL'
  }
  if (style.opacity !== undefined) node.opacity = style.opacity
  if (style.width !== undefined || style.height !== undefined) {
    node.resize(style.width ?? Math.max(node.width, 1), style.height ?? Math.max(node.height, 1))
    const horizontal = node.layoutMode === 'HORIZONTAL'
    if (style.width !== undefined) {
      if (horizontal) node.primaryAxisSizingMode = 'FIXED'
      else node.counterAxisSizingMode = 'FIXED'
    }
    if (style.height !== undefined) {
      if (horizontal) node.counterAxisSizingMode = 'FIXED'
      else node.primaryAxisSizingMode = 'FIXED'
    }
  }
  if (style.minWidth !== undefined) node.minWidth = style.minWidth
  if (style.minHeight !== undefined) node.minHeight = style.minHeight
  if (style.mode === 'dark' && s.vars.color.dark)
    node.setExplicitVariableModeForCollection(
      s.vars.color.collection as unknown as VariableCollection,
      s.vars.color.dark,
    )
  if (style.shadow) {
    const effect = s.effectStyles.get(`shadow/${style.shadow}/light`)
    if (effect) void node.setEffectStyleIdAsync(effect.id)
  }
}

export function box(s: Scene, name: string, style: BoxStyle = {}): FrameNode {
  const f = s.api.createFrame()
  f.name = name
  styleBox(s, f, style)
  return f
}

/** Ajoute un enfant puis, s'il le faut, l'étire — Figma refuse `FILL` hors d'un parent auto-layout. */
export function append(
  parent: FrameNode | ComponentNode | PageNode,
  child: SceneNode,
  sizing: { fillWidth?: boolean; fillHeight?: boolean; grow?: boolean } = {},
): void {
  parent.appendChild(child)
  if (!('layoutSizingHorizontal' in child) || parent.type === 'PAGE') return
  // Un PARAGRAPHE (borné à 70 caractères, D81) s'étire jusqu'à sa largeur de LECTURE — jamais jusqu'à
  // la longueur de son texte d'auteur, que la page remplace par un contenu plus long — et se replie
  // dans un parent plus étroit (360 px) sans jamais descendre sous un plancher lisible (défaut C du
  // 25/09/2026 : « Ce/que/ces/régla/ges » replié à la largeur d'un titre voisin).
  if (child.type === 'TEXT' && child.textAutoResize === 'HEIGHT' && parent.layoutMode !== 'NONE') {
    const reading = READING.get(child) ?? child.width
    child.maxWidth = reading
    child.minWidth = Math.min(reading, readableFloor(child))
    child.layoutSizingHorizontal = 'FILL'
  }
  if (sizing.fillWidth) child.layoutSizingHorizontal = 'FILL'
  // Un texte étiré passe à la ligne dans sa largeur (Figma le met en HEIGHT).
  if (sizing.fillWidth && child.type === 'TEXT') child.textAutoResize = 'HEIGHT'
  if (sizing.fillHeight) child.layoutSizingVertical = 'FILL'
  if (sizing.grow) child.layoutGrow = 1
}

export interface TextOptions {
  /** Un style `text/<nom>` de tokens.css — prioritaire. */
  style?: string
  size?: number
  weight?: number
  mono?: boolean
  color?: ColorName
  /** Largeur maximale de lecture, en caractères (D81 : 70 pour un texte). */
  maxChars?: number
  underline?: boolean
}

/**
 * Un texte : un style `text/*` s'il y en a un, sinon taille + graisse du code
 * (la classe Tailwind), toujours coloré par une variable. La couleur par
 * défaut est celle du style (tokens.css), sinon `text/primary`.
 */
export async function text(s: Scene, name: string, characters: string, o: TextOptions = {}): Promise<TextNode> {
  const t = s.api.createText()
  t.name = name
  const style = o.style ? s.textStyles.get(`text/${o.style}`) : undefined
  t.fontName = o.mono ? s.mono : (s.fonts.get(o.weight ?? 400) ?? (s.fonts.get(400) as FontName))
  t.characters = characters
  if (style) await t.setTextStyleIdAsync(style.id)
  else if (o.size) t.fontSize = o.size
  if (o.underline) t.textDecoration = 'UNDERLINE'
  const styleDef = o.style ? s.tokens.textStyles.find(x => x.name === o.style) : undefined
  const defaultColor = styleDef ? colorNameOf(s, styleDef.color) : undefined
  t.fills = paint(s, o.color ?? defaultColor ?? 'text/primary')
  const size = style ? (styleDef?.fontSize ?? 14) : (o.size ?? 14)
  SIZE.set(t, size)
  if (o.maxChars) {
    // Borné en lecture (D81) : replié dès l'auteur, jamais seulement au-delà de `maxChars`
    // caractères. Une valeur COURTE au moment d'écrire la recette (un texte de composant lié à
    // une propriété, ex. `description`) peut être remplacée par un contenu de page bien plus
    // long à l'instanciation — la décision de replier ne peut pas dépendre de la longueur du
    // texte D'AUTEUR, sinon la page qui pose le vrai contenu déborde silencieusement.
    t.textAutoResize = 'HEIGHT'
    t.resize(Math.round(Math.min(characters.length, o.maxChars) * size * CHAR_WIDTH), t.height)
    READING.set(t, Math.round(o.maxChars * size * CHAR_WIDTH))
  } else t.textAutoResize = 'WIDTH_AND_HEIGHT'
  return t
}

/** Largeur moyenne d'un caractère, en fraction de la taille de police. */
const CHAR_WIDTH = 0.6
/** Un texte qui passe à la ligne garde au moins 12 caractères par ligne (`render-quality-*.test.ts`). */
const READABLE_CHARS = 12
/** La taille (px) d'un texte, style compris (un style `text/*` ne se relit pas dans `fontSize` partout). */
const SIZE = new WeakMap<object, number>()
/** La largeur de lecture (px) d'un paragraphe, posée à sa création — sa `maxWidth` une fois dans un auto-layout. */
const READING = new WeakMap<object, number>()

/** Le plancher lisible (px) d'un texte qui passe à la ligne. */
const readableFloor = (t: TextNode): number =>
  Math.min(
    FLOOR_MAX,
    Math.ceil(READABLE_CHARS * (SIZE.get(t) ?? (typeof t.fontSize === 'number' ? t.fontSize : 14)) * CHAR_WIDTH),
  )
/** Un titre de 36 px n'exige pas 260 px : le plancher s'arrête là (il tient dans un téléphone de 320). */
const FLOOR_MAX = 160

/**
 * Un texte d'instance qu'on fait passer à la ligne (libellé long sur téléphone) : lui ET ses cadres
 * jusqu'à l'instance prennent la largeur disponible — sinon il se replie dans une boîte qui HUG, à zéro.
 */
export function wrapInPlace(t: TextNode, stop: SceneNode): void {
  t.textAutoResize = 'HEIGHT'
  t.layoutSizingHorizontal = 'FILL'
  t.minWidth = Math.max(t.minWidth ?? 0, readableFloor(t))
  let up = t.parent
  while (up && up !== stop && 'layoutMode' in up && up.parent && 'layoutMode' in up.parent) {
    if (up.parent.layoutMode === 'NONE') break
    up.layoutSizingHorizontal = 'FILL'
    up = up.parent
  }
}

/**
 * Après construction d'un arbre (variante de composant, cadre de page) : un enfant FILL (paragraphe,
 * tableau, carte) n'est jamais laissé dans un parent qui HUG — Figma lui donnerait la largeur de son
 * frère le plus étroit (colonne) ou rien du tout (rangée) : « Ce/que/ces/régla/ges », « CG/U » (défaut C
 * du 25/09/2026). Chaque cadre HUG entre lui et le premier ancêtre à largeur connue passe à FILL.
 * `keep` : les cadres qui restent HUG par dessein (le slot `actions` d'un entête, aligné à droite).
 * On ne descend pas dans les instances : leurs composants ont été réglés à leur construction.
 */
export function settleFills(root: FrameNode | ComponentNode, keep: ReadonlySet<string> = new Set()): void {
  const known = (n: SceneNode): boolean => {
    if (!('layoutMode' in n)) return true
    if (n.layoutSizingHorizontal === 'FILL' || n === root) return true
    if (n.parent && 'layoutMode' in n.parent && n.parent.layoutMode === 'HORIZONTAL' && n.layoutGrow === 1) return true
    if (n.layoutMode === 'NONE') return true
    return n.layoutMode === 'HORIZONTAL' ? n.primaryAxisSizingMode === 'FIXED' : n.counterAxisSizingMode === 'FIXED'
  }
  const visit = (n: SceneNode): void => {
    if (n.type === 'INSTANCE' || !('children' in n)) return
    for (const c of n.children) {
      if ('layoutSizingHorizontal' in c && c.layoutSizingHorizontal === 'FILL' && c.visible) {
        let up = c.parent
        while (up && up !== root && up.type !== 'PAGE' && 'layoutMode' in up && !known(up) && !keep.has(up.name)) {
          const grand = up.parent
          if (!grand || !('layoutMode' in grand) || grand.layoutMode === 'NONE') break
          up.layoutSizingHorizontal = 'FILL'
          up = grand
        }
      }
      visit(c)
    }
  }
  visit(root)
}

/** Le nom Figma d'une variable CSS (`--bellum-text-muted` → `text/muted`). */
export function colorNameOf(s: Scene, cssVar: string): ColorName | undefined {
  return s.vars.byCssVar.get(cssVar)?.name
}

/** Retrouve un nœud de premier niveau par nom et type sur une page. */
export function findOnPage<T extends SceneNode>(page: PageNode, name: string, type: T['type']): T | undefined {
  return page.children.find((n): n is T => n.name === name && n.type === type)
}

/** Retrouve ou crée une page Figma par nom (l'ordre des nouvelles pages suit l'ordre des appels). */
export function ensurePage(api: DrawApi, name: string): PageNode {
  const found = api.root.children.find(p => p.name === name)
  if (found) return found
  const p = api.createPage()
  p.name = name
  return p
}

/** Vide un cadre (ses enfants partent), le cadre lui-même garde son identité. */
export function clear(node: FrameNode | ComponentNode): void {
  for (const c of [...node.children]) c.remove()
}

// ─── Rendre la main pendant une longue construction ─────────────────────────

/**
 * Le nombre de cadres (page, gabarit, surcouche, composant) construits entre deux rendus de la main à
 * la boucle d'événements. Mesuré à ~5 ms/cadre sur le registre complet : 20 cadres restent bien sous la
 * seconde même ralenti, avant qu'un long registre ne bloque le RPC du worker vitest (`onTaskUpdate`) ou
 * l'UI du plugin. Un seul endroit (GA-26) : les boucles qui dessinent des cadres l'importent d'ici.
 */
export const FRAMES_PER_YIELD = 20

/**
 * Rend la main à la boucle d'événements via une MACRO-tâche (jamais une micro-tâche, qui ne rendrait
 * jamais la main). Sans cet appel, une construction qui n'attend que des micro-tâches ne répond plus
 * pendant toute sa durée : ni le worker vitest, ni l'UI du plugin en vrai (la barre de progression fige).
 */
export function yieldToHost(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}
