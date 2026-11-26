import { COMPONENTS } from '../../spec/catalog'
import {
  append,
  bindRadius,
  box,
  clear,
  findOnPage,
  FRAMES_PER_YIELD,
  paint,
  type Scene,
  settleFills,
  styleBox,
  text,
  yieldToHost,
} from '../scene'
import { withCapacity } from './capacity'
import { FAMILIES, type Family, type Part, REAL_COPY, type Recipe, type Values } from './recipe'

/**
 * Le MOTEUR des composants : une recette → un COMPONENT_SET Figma (une
 * variante par combinaison d'axes du catalogue), idempotent.
 *
 * Idempotence : chaque jeu est RETROUVÉ par son nom sur sa page, chaque
 * variante par son nom dans le jeu ; une variante retrouvée est VIDÉE puis
 * redessinée — son identité (et donc les instances posées dans les gabarits
 * et les pages) survit à la synchronisation.
 */

/** Au-delà, la grille des variantes devient illisible : on découpe par le premier axe. */
export const MAX_VARIANTS_PER_SET = 30

export const familyPage = (f: Family): string => `Components — ${f}`
export const ICON_PAGE: Family = 'Identité'

type ComponentId = keyof typeof COMPONENTS
type Axes = Readonly<Record<string, readonly string[]>>

/** Un jeu construit : les valeurs FIXÉES par le découpage, et le nœud Figma. */
interface Chunk {
  fixed: Values
  node: ComponentSetNode | ComponentNode
}

export interface Registry {
  components: Map<string, Chunk[]>
  icons: Map<string, ComponentNode>
}

export const emptyRegistry = (): Registry => ({ components: new Map(), icons: new Map() })

// ─── Combinaisons ───────────────────────────────────────────────────────────

export function combinations(axes: Axes): Values[] {
  let out: Record<string, string>[] = [{}]
  for (const [axis, values] of Object.entries(axes)) {
    out = out.flatMap(o => values.map(v => ({ ...o, [axis]: v })))
  }
  return out
}

/** Le découpage : un seul jeu si ≤ 30 variantes, sinon un jeu par valeur du premier axe. */
export function chunksOf(id: string, axes: Axes): { name: string; fixed: Values; axes: Axes }[] {
  const total = Object.values(axes).reduce((n, v) => n * v.length, 1)
  const [first, ...rest] = Object.entries(axes)
  if (total <= MAX_VARIANTS_PER_SET || !first) return [{ name: id, fixed: {}, axes }]
  const restAxes = Object.fromEntries(rest)
  return first[1].map(value => ({ name: `${id} / ${first[0]}=${value}`, fixed: { [first[0]]: value }, axes: restAxes }))
}

export const variantName = (v: Values): string =>
  Object.entries(v)
    .map(([k, x]) => `${k}=${x}`)
    .join(', ')

/** La valeur par défaut d'un axe : `default` s'il existe, sinon la première. */
export const defaultOf = (values: readonly string[]): string =>
  values.includes('default') ? 'default' : (values[0] ?? '')

// ─── Icônes ─────────────────────────────────────────────────────────────────

const ICON_BOX = 24

/**
 * Une icône lucide = UN composant `Icon / <nom>` (jamais une variante par
 * icône) ; les composants qui en portent une exposent une propriété
 * INSTANCE_SWAP. Le tracé vient de lucide-react (generated/icons.json) ; le
 * trait est relié à `text/primary` puis recoloré à l'instance.
 */
export function buildIcons(s: Scene, page: PageNode, svgs: Readonly<Record<string, string>>, reg: Registry): void {
  let x = 0
  for (const [name, inner] of Object.entries(svgs)) {
    const compName = `Icon / ${name}`
    const found = findOnPage<ComponentNode>(page, compName, 'COMPONENT')
    const comp = found ?? s.api.createComponent()
    if (!found) page.appendChild(comp)
    clear(comp)
    comp.name = compName
    comp.layoutMode = 'NONE'
    comp.resize(ICON_BOX, ICON_BOX)
    comp.fills = []
    comp.description = `Icône lucide « ${name} » (lucide-react, trait 2). Se pose par INSTANCE_SWAP, jamais en variante.`
    const svg = s.api.createNodeFromSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`,
    )
    for (const child of [...svg.children]) {
      comp.appendChild(child)
      recolor(s, child, 'text/primary')
      if ('constraints' in child) child.constraints = { horizontal: 'SCALE', vertical: 'SCALE' }
    }
    svg.remove()
    comp.x = x
    comp.y = -200
    x += ICON_BOX + 16
    reg.icons.set(name, comp)
  }
}

/** Relie tout trait et tout fond d'un tracé à une couleur de variable. */
export function recolor(s: Scene, node: SceneNode, color: string): void {
  const visit = (n: SceneNode): void => {
    if ('strokes' in n && Array.isArray(n.strokes) && n.strokes.length > 0) n.strokes = paint(s, color)
    if (n.type !== 'FRAME' && n.type !== 'COMPONENT' && n.type !== 'INSTANCE' && 'fills' in n) {
      if (Array.isArray(n.fills) && n.fills.length > 0) n.fills = paint(s, color)
    }
    if ('children' in n) for (const c of n.children) visit(c)
  }
  visit(node)
}

// ─── Rendu d'une partie ─────────────────────────────────────────────────────

/** Ce que le rendu a relié à une propriété de composant, pour la poser APRÈS la création des propriétés. */
interface PropRef {
  node: SceneNode
  field: 'characters' | 'visible' | 'mainComponent'
  prop: string
  type: 'TEXT' | 'BOOLEAN' | 'INSTANCE_SWAP'
  defaultValue: string | boolean
}

interface RenderCtx {
  s: Scene
  reg: Registry
  refs: PropRef[]
  /** Les icônes et composants cités mais absents (pour le journal et les tests). */
  missing: Set<string>
}

async function renderPart(ctx: RenderCtx, part: Part, into: FrameNode | ComponentNode): Promise<void> {
  const { s } = ctx
  let node: SceneNode | null = null
  switch (part.kind) {
    case 'box': {
      const f = box(s, part.name, part.style)
      for (const c of part.children) await renderPart(ctx, c, f)
      node = f
      break
    }
    case 'text': {
      const tn = await text(s, part.name, part.value, part.opts)
      if (part.prop)
        ctx.refs.push({ node: tn, field: 'characters', prop: part.prop, type: 'TEXT', defaultValue: part.value })
      node = tn
      // Un texte de démonstration lié à une propriété se MASQUE quand la page ne le fournit pas : il porte
      // sa bascule `show <prop>` (défauts A du 25/09/2026 — « Libellé » à côté de chaque Switch).
      // Une partie cachée dans CETTE variante n'est pas liée : une bascule liée la rendrait visible.
      if (part.prop && !part.toggle && !part.hidden && !REAL_COPY.has(part.value))
        ctx.refs.push({ node: tn, field: 'visible', prop: showProp(part.prop), type: 'BOOLEAN', defaultValue: true })
      break
    }
    case 'icon': {
      const inst = iconInstance(ctx, part.icon, part.size, part.color)
      if (!inst) return
      inst.name = part.name
      if (part.prop) {
        const main = ctx.reg.icons.get(part.icon)
        if (main)
          ctx.refs.push({
            node: inst,
            field: 'mainComponent',
            prop: part.prop,
            type: 'INSTANCE_SWAP',
            defaultValue: main.id,
          })
      }
      node = inst
      break
    }
    case 'shape': {
      const shape = part.shape === 'rect' ? s.api.createRectangle() : s.api.createEllipse()
      shape.name = part.name
      shape.resize(part.width, part.height)
      shape.fills = part.fill ? paint(s, part.fill, part.fillOpacity) : []
      shape.strokes = part.stroke ? paint(s, part.stroke) : []
      if (part.stroke) shape.strokeWeight = part.strokeWidth ?? 1
      if (shape.type === 'RECTANGLE') bindRadius(s, shape, part.radius)
      else if (part.arc)
        shape.arcData = { startingAngle: part.arc.start, endingAngle: part.arc.end, innerRadius: part.arc.inner }
      node = shape
      break
    }
    case 'ref': {
      const inst = instantiate(ctx.s, ctx.reg, part.component, { values: part.values, content: part.content })
      if (!inst) {
        ctx.missing.add(`composant ${part.component}`)
        return
      }
      inst.name = part.name
      node = inst
      break
    }
  }
  append(into, node, { fillWidth: part.fillWidth, fillHeight: part.fillHeight, grow: part.grow })
  // Un texte qui prend la place restante (placeholder d'un champ) se tronque « … » au lieu de déborder.
  if (node.type === 'TEXT' && part.grow) {
    node.layoutSizingHorizontal = 'FILL'
    node.textTruncation = 'ENDING'
    node.maxLines = 1
  }
  if (node.type === 'TEXT' && part.kind === 'text' && part.truncate) {
    node.textAutoResize = 'HEIGHT'
    node.layoutSizingHorizontal = 'FILL'
    node.textTruncation = 'ENDING'
    node.maxLines = part.truncate
  }
  if (node.type === 'TEXT' && part.kind === 'text' && part.minChars)
    node.minWidth = Math.ceil(part.minChars * (part.opts.size ?? 14) * 0.6)
  if (part.absolute && 'layoutPositioning' in node) {
    node.layoutPositioning = 'ABSOLUTE'
    node.x = part.at?.x ?? 0
    node.y = part.at?.y ?? 0
  }
  if (part.hidden) node.visible = false
  if (part.toggle)
    ctx.refs.push({ node, field: 'visible', prop: part.toggle, type: 'BOOLEAN', defaultValue: !part.hidden })
}

/** La bascule BOOLEAN d'un texte de propriété : `show description` pour `description`. */
const showProp = (prop: string): string => `show ${prop}`

function iconInstance(ctx: RenderCtx, icon: string, size: number, color: string): InstanceNode | null {
  const main = ctx.reg.icons.get(icon)
  if (!main) {
    ctx.missing.add(`icône ${icon}`)
    return null
  }
  const inst = main.createInstance()
  inst.resize(size, size)
  recolor(ctx.s, inst, color)
  return inst
}

// ─── Construction d'un composant ────────────────────────────────────────────

interface BuildResult {
  variants: number
  sets: number
  missing: Set<string>
}

async function drawVariant(
  ctx: RenderCtx,
  id: string,
  comp: ComponentNode,
  recipe: Recipe,
  values: Values,
): Promise<void> {
  clear(comp)
  // Capacité d'entrées / de lignes = le maximum demandé par le registre (défaut K, 25/09/2026).
  const root = withCapacity(id, recipe.draw(values))
  styleBox(ctx.s, comp, root.style)
  for (const c of root.children) await renderPart(ctx, c, comp)
  settleFills(comp)
}

function describe(id: ComponentId, recipe: Recipe): string {
  const def = COMPONENTS[id]
  const lines = [recipe.usage, '', `Source : ${def.source}`]
  if (recipe.touch)
    lines.push(
      'Tactile : plancher 44 px sous pointeur grossier (pointer-coarse:min-h-11, GA-30/32) — posé sur les instances des largeurs mobiles.',
    )
  for (const n of recipe.notes ?? []) lines.push(`Écart : ${n}`)
  return lines.join('\n')
}

/** Pose les propriétés TEXT / BOOLEAN / INSTANCE_SWAP sur le jeu (ou le composant seul), puis y relie les nœuds. */
function applyProperties(target: ComponentSetNode | ComponentNode, refs: PropRef[], reg: Registry): void {
  for (const [key, def] of Object.entries(target.componentPropertyDefinitions)) {
    if (def.type !== 'VARIANT') target.deleteComponentProperty(key)
  }
  const keys = new Map<string, string>()
  for (const r of refs) {
    if (keys.has(r.prop)) continue
    const preferred =
      r.type === 'INSTANCE_SWAP'
        ? [...reg.icons.values()].flatMap(c => (c.key ? [{ type: 'COMPONENT' as const, key: c.key }] : []))
        : undefined
    keys.set(
      r.prop,
      target.addComponentProperty(
        r.prop,
        r.type,
        r.defaultValue,
        preferred ? { preferredValues: preferred } : undefined,
      ),
    )
  }
  for (const r of refs) {
    const key = keys.get(r.prop)
    if (!key) continue
    r.node.componentPropertyReferences = { ...(r.node.componentPropertyReferences ?? {}), [r.field]: key }
  }
}

/** Range les variantes en grille : lignes = toutes les valeurs sauf le dernier axe, colonnes = le dernier axe. */
export function layOutGrid(set: ComponentSetNode, comps: ComponentNode[], combos: Values[], axes: Axes): void {
  const lastAxis = Object.keys(axes).at(-1)
  const columns = lastAxis ? (axes[lastAxis] ?? []) : []
  const GAP = 24
  const PAD = 32
  const colWidth = new Map<string, number>()
  const rowKeys: string[] = []
  const rowHeight = new Map<string, number>()
  combos.forEach((v, idx) => {
    const comp = comps[idx] as ComponentNode
    const col = lastAxis ? (v[lastAxis] ?? '') : ''
    const row = variantName(Object.fromEntries(Object.entries(v).filter(([k]) => k !== lastAxis)))
    if (!rowKeys.includes(row)) rowKeys.push(row)
    colWidth.set(col, Math.max(colWidth.get(col) ?? 0, comp.width))
    rowHeight.set(row, Math.max(rowHeight.get(row) ?? 0, comp.height))
  })
  const colX = new Map<string, number>()
  let x = PAD
  for (const c of columns.length ? columns : ['']) {
    colX.set(c, x)
    x += (colWidth.get(c) ?? 0) + GAP
  }
  const rowY = new Map<string, number>()
  let y = PAD
  for (const r of rowKeys) {
    rowY.set(r, y)
    y += (rowHeight.get(r) ?? 0) + GAP
  }
  combos.forEach((v, idx) => {
    const comp = comps[idx] as ComponentNode
    const col = lastAxis ? (v[lastAxis] ?? '') : ''
    const row = variantName(Object.fromEntries(Object.entries(v).filter(([k]) => k !== lastAxis)))
    comp.x = colX.get(col) ?? PAD
    comp.y = rowY.get(row) ?? PAD
  })
  set.resize(Math.max(x - GAP + PAD, 1), Math.max(y - GAP + PAD, 1))
}

/** Variantes de composants construites depuis le dernier rendu de la main (voir `yieldToHost`, `../scene`). */
let sinceYield = 0

async function drawnOne(): Promise<void> {
  sinceYield++
  if (sinceYield >= FRAMES_PER_YIELD) {
    sinceYield = 0
    await yieldToHost()
  }
}

export async function buildComponent(
  s: Scene,
  page: PageNode,
  id: ComponentId,
  recipe: Recipe,
  reg: Registry,
  origin: { x: number; y: number },
): Promise<BuildResult & { height: number }> {
  const def = COMPONENTS[id]
  const axes = def.variants as Axes
  const chunks: Chunk[] = []
  const missing = new Set<string>()
  let variants = 0
  let y = origin.y
  for (const chunk of chunksOf(id, axes)) {
    const combos = combinations(chunk.axes)
    const ctx: RenderCtx = { s, reg, refs: [], missing }
    let node: ComponentSetNode | ComponentNode
    if (Object.keys(chunk.axes).length === 0) {
      const found = findOnPage<ComponentNode>(page, chunk.name, 'COMPONENT')
      const comp = found ?? s.api.createComponent()
      if (!found) page.appendChild(comp)
      comp.name = chunk.name
      await drawVariant(ctx, id, comp, recipe, chunk.fixed)
      applyProperties(comp, ctx.refs, reg)
      node = comp
      variants += 1
      await drawnOne()
    } else {
      const existing = findOnPage<ComponentSetNode>(page, chunk.name, 'COMPONENT_SET')
      const comps: ComponentNode[] = []
      for (const combo of combos) {
        const name = variantName(combo)
        const found = existing?.children.find((c): c is ComponentNode => c.type === 'COMPONENT' && c.name === name)
        const comp = found ?? s.api.createComponent()
        if (!found) page.appendChild(comp)
        comp.name = name
        await drawVariant(ctx, id, comp, recipe, { ...chunk.fixed, ...combo })
        comps.push(comp)
        await drawnOne()
      }
      let set: ComponentSetNode
      if (existing) {
        set = existing
        for (const c of comps) if (c.parent !== set) set.appendChild(c)
        const keep = new Set(comps.map(c => c.name))
        for (const c of [...set.children]) if (!keep.has(c.name)) c.remove()
      } else {
        set = s.api.combineAsVariants(comps, page)
      }
      set.name = chunk.name
      set.fills = []
      applyProperties(set, ctx.refs, reg)
      layOutGrid(set, comps, combos, chunk.axes)
      node = set
      variants += combos.length
    }
    node.description = describe(id, recipe)
    node.x = origin.x
    node.y = y
    y += node.height + 80
    chunks.push({ fixed: chunk.fixed, node })
  }
  reg.components.set(id, chunks)
  for (const m of missing) s.log.error(`${id} : ${m} introuvable — partie non dessinée`)
  return { variants, sets: chunks.length, missing, height: y - origin.y }
}

/** L'ordre de construction : un composant cité par un autre (`ref`) est construit AVANT lui. */
export function buildOrder(recipes: Readonly<Record<string, Recipe>>): string[] {
  const deps = new Map<string, Set<string>>()
  for (const [id, r] of Object.entries(recipes)) {
    const found = new Set<string>()
    const axes = (COMPONENTS as Record<string, { variants: Axes }>)[id]?.variants ?? {}
    for (const combo of combinations(axes)) {
      const visit = (p: Part): void => {
        if (p.kind === 'ref') found.add(p.component)
        if (p.kind === 'box') p.children.forEach(visit)
      }
      visit(r.draw(combo))
    }
    deps.set(id, found)
  }
  const out: string[] = []
  const visit = (id: string, stack: string[]): void => {
    if (out.includes(id)) return
    if (stack.includes(id)) throw new Error(`Cycle de composants : ${[...stack, id].join(' → ')}`)
    for (const d of deps.get(id) ?? []) visit(d, [...stack, id])
    out.push(id)
  }
  for (const id of Object.keys(recipes)) visit(id, [])
  return out
}

// ─── Relire le fichier (gabarits et pages sans reconstruire les composants) ─

export async function readRegistry(s: Scene, familyOf: (id: string) => Family): Promise<Registry> {
  const reg = emptyRegistry()
  for (const f of FAMILIES) {
    const page = s.api.root.children.find(p => p.name === familyPage(f))
    if (!page) continue
    await page.loadAsync()
    for (const n of page.children) {
      if (n.type === 'COMPONENT' && n.name.startsWith('Icon / ')) reg.icons.set(n.name.slice(7), n)
    }
  }
  for (const [id, def] of Object.entries(COMPONENTS)) {
    const page = s.api.root.children.find(p => p.name === familyPage(familyOf(id)))
    if (!page) continue
    const chunks: Chunk[] = []
    for (const chunk of chunksOf(id, def.variants as Axes)) {
      const node = page.children.find(
        (n): n is ComponentSetNode | ComponentNode =>
          n.name === chunk.name && (n.type === 'COMPONENT_SET' || n.type === 'COMPONENT'),
      )
      if (node) chunks.push({ fixed: chunk.fixed, node })
    }
    if (chunks.length) reg.components.set(id, chunks)
  }
  return reg
}

// ─── Instancier (gabarits, pages) ───────────────────────────────────────────

interface InstanceProps {
  values?: Values
  content?: Readonly<Record<string, string>>
  items?: readonly string[]
}

/**
 * Une instance d'un composant du catalogue, avec ses variantes (défaut = `default`
 * ou la première valeur), ses textes et ses entrées. `null` si le composant
 * n'est pas (encore) dans le fichier — l'appelant le journalise.
 */
export function instantiate(s: Scene, reg: Registry, id: string, props: InstanceProps = {}): InstanceNode | null {
  const def = (COMPONENTS as Record<string, { variants: Axes }>)[id]
  const chunks = reg.components.get(id)
  if (!def || !chunks) return null
  const values: Record<string, string> = {}
  for (const [axis, list] of Object.entries(def.variants)) {
    const wanted = props.values?.[axis]
    values[axis] = wanted && list.includes(wanted) ? wanted : defaultOf(list)
  }
  const chunk = chunks.find(c => Object.entries(c.fixed).every(([k, v]) => values[k] === v)) ?? chunks[0]
  if (!chunk) return null
  let main: ComponentNode | undefined
  if (chunk.node.type === 'COMPONENT') main = chunk.node
  else {
    const rest = Object.fromEntries(Object.entries(values).filter(([k]) => !(k in chunk.fixed)))
    const name = variantName(rest)
    main = chunk.node.children.find((c): c is ComponentNode => c.type === 'COMPONENT' && c.name === name)
  }
  if (!main) return null
  const inst = main.createInstance()
  // Nommée par son composant (et non par sa variante) : c'est ce qu'on lit dans le calque.
  inst.name = id
  const defs = chunk.node.componentPropertyDefinitions
  const keyOf = (name: string): string | undefined => Object.keys(defs).find(d => d.split('#')[0] === name)
  const set: Record<string, string | boolean> = {}
  const given = props.content ?? {}
  for (const [k, v] of Object.entries(given)) {
    const key = keyOf(k)
    const type = key ? defs[key]?.type : undefined
    if (key && type === 'TEXT') set[key] = v
    else if (key && type === 'INSTANCE_SWAP' && reg.icons.get(v)) set[key] = reg.icons.get(v)?.id ?? ''
    else if (!setNested(inst, k, v))
      s.log.warn(`${id} : pas de propriété « ${k} » (ou icône « ${v} » absente) — ignoré`)
  }
  // Un texte de démonstration NON fourni par la page se masque (sa bascule `show <prop>`).
  for (const [key, def] of Object.entries(defs)) {
    if (def.type !== 'TEXT') continue
    const name = key.split('#')[0] ?? key
    const toggle = keyOf(showProp(name))
    if (!toggle || defs[toggle]?.type !== 'BOOLEAN') continue
    if (!(name in given) && !REAL_COPY.has(String(def.defaultValue))) set[toggle] = false
  }
  if (Object.keys(set).length) inst.setProperties(set)
  if (props.items) setItems(s, inst, id, props.items)
  return inst
}

/**
 * Un texte de page qui n'est pas une propriété du composant mais une PARTIE nommée (défaut K, 25/09/2026) :
 * le `trigger` d'un DropdownMenu est un Button imbriqué (son libellé), la `value` d'une Progress est la
 * proportion de son `indicator` (un pourcentage). `false` = rien de tel : l'appelant journalise.
 */
function setNested(inst: InstanceNode, key: string, value: string): boolean {
  const part = inst.findOne(n => n.name === key)
  if (part?.type === 'TEXT') {
    part.characters = value
    return true
  }
  if (part && 'findOne' in part) {
    const label = part.findOne(n => n.type === 'TEXT' && n.name === 'label') as TextNode | null
    if (label) label.characters = value
    return label !== null
  }
  const indicator = key === 'value' ? inst.findOne(n => n.name === 'indicator') : null
  const pct = Number(value)
  if (indicator && 'resize' in indicator && /^\d+(\.\d+)?$/.test(value) && pct <= 100) {
    indicator.resize(Math.max(1, Math.round((inst.width * pct) / 100)), indicator.height)
    return true
  }
  return false
}

function setItems(s: Scene, inst: InstanceNode, id: string, labels: readonly string[]): void {
  const slots = inst
    .findAll(n => /^item\/\d+$/.test(n.name))
    .sort((a, z) => Number(a.name.split('/')[1]) - Number(z.name.split('/')[1]))
  if (labels.length > slots.length)
    s.log.warn(`${id} : ${labels.length} entrées demandées, ${slots.length} dessinées — le surplus n'est pas rendu`)
  slots.forEach((slot, idx) => {
    const label = labels[idx]
    slot.visible = label !== undefined
    if (label === undefined || !('findOne' in slot)) return
    const tn = slot.findOne(n => n.type === 'TEXT' && n.name === 'label') as TextNode | null
    if (tn) tn.characters = label
  })
}
