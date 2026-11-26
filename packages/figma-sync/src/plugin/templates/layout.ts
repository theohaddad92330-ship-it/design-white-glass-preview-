import { SHELL_BREAKPOINT, TEMPLATES, WIDTHS } from '../../spec/catalog'
import type { Surface } from '../../spec/types'
import { instantiate, layOutGrid, type Registry, variantName } from '../components/engine'
import {
  append,
  box,
  clear,
  findOnPage,
  FRAMES_PER_YIELD,
  type Scene,
  settleFills,
  styleBox,
  text,
  yieldToHost,
} from '../scene'
import { BACKOFFICE_RULES, COMMON_RULES, LAYOUTS, RESPONSIVE_RULES } from './rules'

type Zone = (typeof LAYOUTS)[keyof typeof LAYOUTS]['zones'][number]

/**
 * Les NEUF gabarits, en COMPONENT_SET Figma `Template / <id>` : une variante
 * par largeur de référence × état (défaut + états obligatoires du contrat).
 * Construits en INSTANCES des composants (Sidebar, MobileTabBar, EmptyState,
 * Skeleton…) et en auto-layout : FILL + largeurs min/max + retour à la ligne —
 * un gabarit redimensionné à la main se réorganise tout seul (l'`aside` passe
 * sous le contenu quand la place manque, le contenu s'arrête à sa largeur max).
 */

type TemplateId = keyof typeof TEMPLATES
type Shell = (typeof LAYOUTS)[TemplateId]['shell']
export type TemplateState = 'default' | 'empty' | 'emptyFiltered' | 'loading' | 'error'

/** Marges et écarts : tokens `Spacing` (32 = `8`, 16 = `4`, 24 = `6`). */
export const PAD_DESKTOP = 32
export const PAD_MOBILE = 16
export const ZONE_GAP = 24
/** Au-delà, le contenu ne s'étire plus : il se centre (1920 → 1600 de contenu, marges et sidebar comprises). */
export const CONTENT_MAX = 1600
/** À ≥ 2560 : on AJOUTE de l'usage (maître-détail, KPI), on n'étire pas. */
export const WIDE = 2560
/** La fiche posée à côté de la liste en maître-détail. */
export const PREVIEW_WIDTH = 640
/** Sous cette largeur (et ≥ 768), la Sidebar est réduite aux icônes. */
export const SIDEBAR_EXPANDED_FROM = 1024
/**
 * Largeur minimale du contenu principal à côté d'une colonne latérale : 600 +
 * 24 + 320 = 944 px de contenu, atteints à 1280 (sidebar 256, marges 64) et
 * pas à 1024 — c'est ce qui fait apparaître l'`aside` à côté SEULEMENT à ≥ 1280.
 */
export const PRIMARY_MIN = 600

/** Un jeu par gabarit ET par état : 16 largeurs × 4 états dépasseraient la grille lisible (≤ 30). */
export const templateSetName = (id: string, state: TemplateState = 'default'): string =>
  `Template / ${id} / state=${state}`

/**
 * La variante BACKOFFICE d'un gabarit à coque d'app (Q7, RUX-08 révisé) : le même gabarit, la coque du DM
 * (`BackofficeRail` / `BackofficeTopBar`). Une page `dm` de gabarit `list`, `detail`, `dashboard`… part de
 * ce jeu, jamais de celui de l'app. `admin-table` a la coque backoffice dans son propre jeu.
 */
export const backofficeSetName = (id: string): string => `Template / ${id} / shell=backoffice`

/** Les gabarits qui ont une variante backoffice : ceux dont la coque est celle de l'app. */
const withBackofficeVariant = (id: TemplateId): boolean => LAYOUTS[id].shell === 'app'

/** Les largeurs demandées, dans l'ordre de référence (bureau d'abord). */
export const widthsOf = (wanted: readonly number[] = WIDTHS): number[] => WIDTHS.filter(w => wanted.includes(w))

/** Les états qu'un GABARIT dessine : les obligatoires, puis les facultatifs (qu'une page déclare ou non). */
export const statesOf = (id: TemplateId): TemplateState[] => {
  const def = TEMPLATES[id]
  return ['default', ...def.states, ...('optionalStates' in def ? def.optionalStates : [])]
}

const isMobile = (width: number): boolean => width < SHELL_BREAKPOINT

// ─── Dessin d'une variante ──────────────────────────────────────────────────

async function slotFrame(s: Scene, id: TemplateId, slot: string, width: number): Promise<FrameNode> {
  const required = (TEMPLATES[id].required as readonly string[]).includes(slot)
  const f = box(s, slot, {
    direction: 'column',
    gap: 8,
    padX: 16,
    padY: 16,
    fill: 'guide/veil',
    stroke: 'guide/halo',
    dashed: true,
    radius: 'md',
    align: 'start',
    minHeight: slot === 'primary' || slot === 'thread' ? (isMobile(width) ? 240 : 360) : 56,
  })
  append(f, await text(s, 'slot-label', `${slot}${required ? ' · obligatoire' : ''}`, { style: 'caption' }))
  return f
}

interface ZoneCtx {
  s: Scene
  reg: Registry
  id: TemplateId
  width: number
  state: TemplateState
  /** La coque dessinée : celle du gabarit, ou `backoffice` pour la variante DM d'un gabarit à coque d'app. */
  shell: Shell
}

async function fillState(z: ZoneCtx, primary: FrameNode): Promise<void> {
  if (z.state === 'default') return
  clear(primary)
  styleBox(z.s, primary, { direction: 'column', gap: 12, align: 'stretch', minHeight: primary.minHeight ?? undefined })
  const put = (inst: InstanceNode | null, what: string): void => {
    if (!inst) {
      z.s.log.error(`Gabarit ${z.id} : ${what} introuvable — lancer « Composants » d’abord`)
      return
    }
    append(primary, inst, { fillWidth: true })
  }
  if (z.state === 'empty')
    put(
      instantiate(z.s, z.reg, 'EmptyState', {
        values: { size: 'md', align: 'center' },
        content: {
          title: 'Titre de l’état vide',
          description: 'Une phrase qui dit quoi faire ensuite.',
          action: 'Action principale',
        },
      }),
      'EmptyState',
    )
  // RUX-14 (docs/revue-ux.md T5) : un 2ᵉ état vide, distinct de « jamais rempli » — une vue
  // FILTRÉE qui ne rend rien invite à RETIRER un filtre, pas à créer quelque chose.
  if (z.state === 'emptyFiltered')
    put(
      instantiate(z.s, z.reg, 'EmptyState', {
        values: { size: 'md', align: 'center' },
        content: {
          title: 'Aucun résultat ne passe ces filtres',
          description: 'Retire un ou plusieurs filtres pour élargir la recherche.',
          action: 'Retirer les filtres',
        },
      }),
      'EmptyState',
    )
  if (z.state === 'loading') {
    const shape = LAYOUTS[z.id].loading
    const count = shape === 'table' ? 1 : 3
    for (let k = 0; k < count; k++) put(instantiate(z.s, z.reg, 'Skeleton', { values: { shape } }), 'Skeleton')
  }
  if (z.state === 'error')
    put(
      instantiate(z.s, z.reg, 'GenericProblemMessage', {
        content: { title: 'Je n’ai pas pu charger ce contenu.', description: 'Réessaie — tes filtres sont conservés.' },
      }),
      'GenericProblemMessage',
    )
}

async function drawZone(z: ZoneCtx, zone: Zone, into: FrameNode, index: number): Promise<void> {
  const { s, id, width } = z
  const layout = LAYOUTS[id]
  if (typeof zone === 'string') {
    const f = await slotFrame(s, id, zone, width)
    if (zone === 'primary' && layout.wide === 'master-detail' && width >= WIDE) {
      const row = box(s, `zone/${index}`, { direction: 'row', gap: ZONE_GAP, align: 'start' })
      append(into, row, { fillWidth: true })
      append(row, f, { fillWidth: true })
      f.minWidth = PRIMARY_MIN
      await fillState(z, f)
      await preview(z, row)
      return
    }
    append(into, f, { fillWidth: true })
    if (zone === 'primary') await fillState(z, f)
    return
  }
  const mobile = isMobile(width)
  const row = box(s, `zone/${index}`, {
    direction: mobile ? 'column' : 'row',
    gap: ZONE_GAP,
    align: 'start',
    wrap: !mobile,
  })
  if (!mobile) row.counterAxisSpacing = ZONE_GAP
  append(into, row, { fillWidth: true })
  const isHeaderRow = zone.row.includes('header')
  for (const cell of zone.row) {
    if (typeof cell !== 'string') {
      const col = box(s, `column/${cell.column.join('+')}`, { direction: 'column', gap: ZONE_GAP, align: 'stretch' })
      append(row, col, { fillWidth: true })
      if (!mobile) col.minWidth = PRIMARY_MIN
      for (const slot of cell.column) {
        const f = await slotFrame(s, id, slot, width)
        append(col, f, { fillWidth: true })
        if (slot === 'primary') await fillState(z, f)
      }
      continue
    }
    const f = await slotFrame(s, id, cell, width)
    const side = layout.side[cell]
    if (mobile) append(row, f, { fillWidth: true })
    else if (side) {
      append(row, f)
      f.resize(side, f.height)
      f.layoutSizingHorizontal = 'FIXED'
    } else if (isHeaderRow && cell === 'actions') {
      append(row, f)
      f.layoutSizingHorizontal = 'HUG'
    } else {
      append(row, f, { fillWidth: true })
      f.minWidth = isHeaderRow ? 240 : Object.keys(layout.side).length ? PRIMARY_MIN : 0
      if (cell === 'primary' && layout.primaryMax) f.maxWidth = layout.primaryMax
    }
    if (cell === 'primary') await fillState(z, f)
  }
  if (!mobile && layout.wide === 'master-detail' && width >= WIDE && zone.row.includes('primary')) await preview(z, row)
}

/** Maître-détail (≥ 2560) : la fiche de l'élément sélectionné, à côté de la liste. Un emplacement nommé, jamais une fausse fiche. */
async function preview(z: ZoneCtx, row: FrameNode): Promise<void> {
  const f = box(z.s, 'preview', {
    direction: 'column',
    gap: 8,
    padX: 16,
    padY: 16,
    fill: 'guide/veil',
    stroke: 'guide/halo',
    dashed: true,
    radius: 'md',
    align: 'start',
    minHeight: 360,
  })
  append(row, f)
  f.resize(PREVIEW_WIDTH, f.height)
  f.layoutSizingHorizontal = 'FIXED'
  append(
    f,
    await text(z.s, 'slot-label', 'fiche de l’élément sélectionné · gabarit detail (maître-détail ≥ 2560)', {
      style: 'caption',
      maxChars: 70,
    }),
  )
}

/**
 * L'en-tête et le pied de page du site : une BANDE pleine largeur (le fond, le trait) qui centre le slot
 * dans le MÊME conteneur borné que le contenu (défaut D, 25/09/2026 — le pied de page partait de x=0).
 */
async function band(z: ZoneCtx, comp: ComponentNode, slot: 'nav' | 'footer', pad: number): Promise<void> {
  const footer = slot === 'footer'
  const f = box(z.s, `band/${slot}`, {
    direction: 'column',
    padX: pad,
    padY: footer ? 48 : 16,
    align: 'center',
    stroke: 'border/default',
    strokeSide: footer ? 'top' : 'bottom',
  })
  append(comp, f, { fillWidth: true })
  const inner = await slotFrame(z.s, z.id, slot, z.width)
  append(f, inner, { fillWidth: true })
  inner.maxWidth = LAYOUTS[z.id].maxWidth ?? CONTENT_MAX
}

async function drawVariant(z: ZoneCtx, comp: ComponentNode): Promise<void> {
  const { s, reg, id, width } = z
  const layout = LAYOUTS[id]
  const mobile = isMobile(width)
  const pad = mobile ? PAD_MOBILE : PAD_DESKTOP
  clear(comp)
  const backoffice = z.shell === 'backoffice'
  const appShell = z.shell === 'app' || backoffice
  styleBox(s, comp, {
    direction: appShell && !mobile ? 'row' : 'column',
    fill: 'bg/default',
    align: 'stretch',
    width,
    minHeight: mobile ? 844 : 900,
    clip: true,
  })
  // Défaut J (25/09/2026) : les pages sont longues et défilent — le cadre prend TOUTE leur hauteur (HUG,
  // plancher 900 / 844), jamais un 900 px fixe qui coupe le bas. Seule la LARGEUR est fixe.
  if (appShell && !mobile) {
    comp.resize(width, 900)
    comp.primaryAxisSizingMode = 'FIXED'
    comp.counterAxisSizingMode = 'AUTO'
  } else {
    comp.counterAxisSizingMode = 'FIXED'
    comp.primaryAxisSizingMode = 'AUTO'
  }

  if (appShell && !mobile) {
    const state = width < SIDEBAR_EXPANDED_FROM ? 'collapsed' : 'expanded'
    const nav = backoffice ? 'BackofficeRail' : 'Sidebar'
    const sidebar = instantiate(s, reg, nav, { values: backoffice ? { state } : { variant: 'sidebar', state } })
    if (sidebar) append(comp, sidebar, { fillHeight: true })
    else s.log.error(`Gabarit ${id} : ${nav} introuvable — lancer « Composants » d’abord`)
  }
  // Le backoffice sous 768 : sa barre du HAUT (menu, environnement, recherche ⌘K), jamais la barre d'onglets de l'app.
  if (backoffice && mobile) {
    const bar = instantiate(s, reg, 'BackofficeTopBar')
    if (bar) append(comp, bar, { fillWidth: true })
    else s.log.error(`Gabarit ${id} : BackofficeTopBar introuvable — lancer « Composants » d’abord`)
  }
  const outerZones: string[] =
    layout.shell === 'site' ? layout.zones.filter((zn): zn is string => zn === 'nav' || zn === 'footer') : []
  if (outerZones.includes('nav')) await band(z, comp, 'nav', pad)

  // La zone de contenu : prend la place, centre une colonne bornée.
  const main = box(s, 'main', { direction: 'column', padX: pad, padY: pad, align: 'center' })
  append(comp, main, { fillWidth: !appShell || mobile, grow: true })
  // En bureau, c'est `main` qui DONNE la hauteur de la rangée (HUG, plancher 900) et la Sidebar qui la suit
  // (FILL) : deux enfants FILL dans une rangée HUG la laisseraient à 900 px, le bas coupé (défaut J).
  if (appShell && !mobile) {
    main.layoutSizingVertical = 'HUG'
    main.minHeight = 900
  }
  const content = box(s, 'content', { direction: 'column', gap: ZONE_GAP, align: 'stretch' })
  append(main, content, { fillWidth: true })
  content.maxWidth =
    layout.maxWidth ??
    (layout.wide === 'master-detail' && width >= WIDE ? CONTENT_MAX + ZONE_GAP + PREVIEW_WIDTH : CONTENT_MAX)
  if (layout.shell === 'none') main.primaryAxisAlignItems = 'CENTER'

  let index = 0
  for (const zone of layout.zones) {
    if (outerZones.includes(zone as string)) continue
    await drawZone(z, zone, content, index++)
  }
  if (outerZones.includes('footer')) await band(z, comp, 'footer', pad)

  if (z.shell === 'app' && mobile) {
    const bar = instantiate(s, reg, 'MobileTabBar')
    if (bar) append(comp, bar, { fillWidth: true })
    else s.log.error(`Gabarit ${id} : MobileTabBar introuvable — lancer « Composants » d’abord`)
  }
  settleFills(comp, new Set(['actions']))
}

// ─── Le jeu de variantes + l'annotation ────────────────────────────────────

async function annotation(s: Scene, page: PageNode, id: TemplateId, x: number, y: number): Promise<void> {
  const name = `Règles — ${id}`
  const old = findOnPage<FrameNode>(page, name, 'FRAME')
  old?.remove()
  const layout = LAYOUTS[id]
  const f = box(s, name, {
    direction: 'column',
    gap: 8,
    padX: 24,
    padY: 24,
    fill: 'surface/1',
    stroke: 'border/default',
    radius: 'lg',
    align: 'start',
    width: 480,
  })
  page.appendChild(f)
  append(f, await text(s, 'title', templateSetName(id), { style: 'heading' }))
  append(f, await text(s, 'description', TEMPLATES[id].description, { style: 'body', maxChars: 70 }))
  append(f, await text(s, 'rule', layout.rule, { style: 'body', maxChars: 70 }))
  f.appendChild(
    await text(
      s,
      'slots',
      `Slots : ${TEMPLATES[id].slots.join(' · ')} — obligatoires : ${TEMPLATES[id].required.join(', ')}`,
      {
        style: 'caption',
        maxChars: 70,
      },
    ),
  )
  append(
    f,
    await text(s, 'widths', `Largeurs : ${WIDTHS.join(' · ')} px — un jeu par état`, {
      style: 'caption',
      maxChars: 70,
    }),
  )
  f.x = x
  f.y = y
}

async function commonRules(s: Scene, page: PageNode): Promise<void> {
  const name = 'Règles communes des gabarits'
  findOnPage<FrameNode>(page, name, 'FRAME')?.remove()
  const f = box(s, name, {
    direction: 'column',
    gap: 8,
    padX: 32,
    padY: 32,
    fill: 'surface/1',
    stroke: 'border/default',
    radius: 'lg',
    align: 'start',
    width: 720,
  })
  page.appendChild(f)
  append(
    f,
    await text(s, 'title', 'Harmonisation — ce qui est au même endroit dans les neuf gabarits', {
      style: 'title',
      maxChars: 70,
    }),
  )
  for (const r of COMMON_RULES) append(f, await text(s, 'rule', `• ${r}`, { style: 'body', maxChars: 70 }))
  append(f, await text(s, 'responsive', 'La grille responsive', { style: 'heading' }))
  for (const r of RESPONSIVE_RULES) append(f, await text(s, 'rule', `• ${r}`, { style: 'body', maxChars: 70 }))
  append(f, await text(s, 'backoffice', 'Le backoffice (DM) — coque et mobile', { style: 'heading' }))
  for (const r of BACKOFFICE_RULES) append(f, await text(s, 'rule', `• ${r}`, { style: 'body', maxChars: 70 }))
  f.x = -800
  f.y = 0
}

/** Cadres de gabarits construits depuis le dernier rendu de la main (voir `yieldToHost`, `../scene`). */
let sinceYield = 0

/** Un jeu de variantes (une par largeur) d'un gabarit, dans un état et une coque ; posé en (0, y). */
async function drawSet(
  s: Scene,
  reg: Registry,
  page: PageNode,
  ws: readonly number[],
  set: { id: TemplateId; name: string; state: TemplateState; shell: Shell; y: number },
): Promise<ComponentSetNode> {
  const { id, state } = set
  const existing = findOnPage<ComponentSetNode>(page, set.name, 'COMPONENT_SET')
  const combos = ws.map(w => ({ width: String(w) }))
  const comps: ComponentNode[] = []
  for (const combo of combos) {
    const name = variantName(combo)
    const found = existing?.children.find((c): c is ComponentNode => c.type === 'COMPONENT' && c.name === name)
    const comp = found ?? s.api.createComponent()
    if (!found) page.appendChild(comp)
    comp.name = name
    await drawVariant({ s, reg, id, width: Number(combo.width), state, shell: set.shell }, comp)
    comps.push(comp)
    sinceYield++
    if (sinceYield >= FRAMES_PER_YIELD) {
      sinceYield = 0
      await yieldToHost()
    }
  }
  let node: ComponentSetNode
  if (existing) {
    node = existing
    for (const c of comps) if (c.parent !== node) node.appendChild(c)
    const keep = new Set(comps.map(c => c.name))
    for (const c of [...node.children]) if (!keep.has(c.name)) c.remove()
  } else node = s.api.combineAsVariants(comps, page)
  node.name = set.name
  node.fills = []
  const coque = set.shell === 'backoffice' ? '\nCoque : backoffice (DM).' : ''
  node.description = `${TEMPLATES[id].description}\n\nÉtat : ${state}.${coque}\n${LAYOUTS[id].rule}\n\nRègles : docs/gabarits.md (packages/figma-sync).`
  layOutGrid(node, comps, combos, { width: combos.map(c => c.width) })
  node.x = 0
  node.y = set.y
  return node
}

export async function drawTemplates(
  s: Scene,
  reg: Registry,
  page: PageNode,
  widths: readonly number[] = WIDTHS,
): Promise<number> {
  await commonRules(s, page)
  const ws = widthsOf(widths)
  let y = 0
  let variants = 0
  for (const id of Object.keys(TEMPLATES) as TemplateId[]) {
    const top = y
    let right = 0
    const sets = statesOf(id).map(state => ({ name: templateSetName(id, state), state, shell: LAYOUTS[id].shell }))
    // La variante backoffice (DM) d'un gabarit à coque d'app : état par défaut seul — les pages y posent leurs états.
    if (withBackofficeVariant(id))
      sets.push({ name: backofficeSetName(id), state: 'default', shell: 'backoffice' as Shell })
    for (const def of sets) {
      const set = await drawSet(s, reg, page, ws, { id, ...def, y })
      right = Math.max(right, set.width)
      y += set.height + 80
      variants += ws.length
    }
    await annotation(s, page, id, right + 80, top)
    y += 160
  }
  return variants
}

/**
 * Retrouve la variante d'un gabarit à une largeur (état `default`) — pour les pages. Une page du backoffice
 * (`dm`) part de la variante `backoffice` d'un gabarit à coque d'app.
 */
export function findTemplateVariant(
  page: PageNode,
  id: string,
  width: number,
  surface?: Surface,
): ComponentNode | null {
  const backoffice = surface === 'dm' && id in LAYOUTS && withBackofficeVariant(id as TemplateId)
  const set = findOnPage<ComponentSetNode>(
    page,
    backoffice ? backofficeSetName(id) : templateSetName(id),
    'COMPONENT_SET',
  )
  const name = variantName({ width: String(width) })
  return set?.children.find((c): c is ComponentNode => c.type === 'COMPONENT' && c.name === name) ?? null
}
