import { SHELL_BREAKPOINT } from '../../spec/catalog'
import type { Block, OverlaySpec, PageSpec, Surface } from '../../spec/types'
import { MODAL_KINDS } from '../../spec/validate'
import type { Registry } from '../components/engine'
import type { Recipe } from '../components/recipe'
import {
  figmaPageOf,
  filterSheetFrameName,
  frameName,
  pageWidths,
  renderBlock,
  renderFrame,
  splitFilters,
  type PageCtx,
} from '../pages/render'
import {
  append,
  box,
  ensurePage,
  findOnPage,
  FRAMES_PER_YIELD,
  paint,
  type Scene,
  settleFills,
  text,
  wrapInPlace,
  yieldToHost,
} from '../scene'
import { findTemplateVariant } from '../templates/layout'

/**
 * Le RENDU D'UNE SURCOUCHE : un cadre de la taille de l'ÉCRAN (1440 × 900 en bureau, 390 × 844 en
 * mobile), rogné, qui empile trois calques :
 *
 * 1. `parent` — la page qui ouvre la surcouche, dessinée par le même moteur que les pages (ou le
 *    gabarit nu quand la page n'est pas maquettée) ;
 * 2. `scrim` — pour les familles MODALES seulement, un voile pleine taille LIÉ à la variable
 *    `guide/veil` : le code pose `bg-black/80` (Dialog) et `bg-black/50` (Sheet) en littéral, aucune
 *    variable ne porte ce voile — `guide/veil` est le seul voile de tokens.css, et une couleur ne naît
 *    jamais dans Figma ;
 * 3. `overlay` — la surcouche, composée des composants du catalogue et placée selon sa famille.
 *
 * Le PLACEMENT est une règle, jamais une donnée de spec : en mobile, une famille modale est TOUJOURS
 * un panneau bas pleine largeur (Sheet `bottom`, pied en colonne, primaire en haut) — jamais la
 * modale centrée de `w-[calc(100%-2rem)]` que le code pose encore.
 */

/** Les hauteurs d'écran (px) : celles des cadres de pages (900 en bureau, 844 sur un téléphone de 390). */
export const VIEWPORT_HEIGHT = { desktop: 900, mobile: 844 } as const
/** Une surcouche se dessine à 1440 (bureau) et 390 (téléphone), selon ses viewports — le backoffice aussi (Q7). */
const WIDTH = { desktop: 1440, mobile: 390 } as const
/** `max-w-lg` de `dialog.tsx` / `alert-dialog.tsx` — sous le plafond de 560 px d'un Dialog (RUX-24). */
const DIALOG_WIDTH = 512
/** La palette de commandes : un Dialog centré de 640 px (RUX-07). */
const COMMAND_WIDTH = 640
/** Le panneau latéral droit : 480 px (RUX-24 ; le code pose `sm:max-w-sm`), décollé de 12 px (`inset-y-3 right-3`). */
const SHEET_WIDTH = 480
const SHEET_INSET = 12
/** Au-delà de 4 champs, le panneau bas mobile prend toute la hauteur (`100dvh`, RUX-24). */
const MAX_FIELDS_SHORT_SHEET = 4
const FIELDS: readonly string[] = [
  'Input',
  'Textarea',
  'Select',
  'PasswordField',
  'InputOTP',
  'Checkbox',
  'Switch',
  'RadioGroup',
  'Slider',
  'SearchInput',
]
/** Marge d'un toast et d'un menu ancré au bord de l'écran. */
const EDGE = { desktop: 24, mobile: 16 } as const
/** Hauteur d'ancrage d'un menu, d'un popover, d'une info-bulle : sous l'entête de page. */
const ANCHOR_Y = { desktop: 136, mobile: 120 } as const

const SURFACE_LABEL: Record<Surface, string> = { app: 'App', site: 'Site', dm: 'DM' }

/** La page Figma des surcouches d'une surface. */
export const overlayPageOf = (surface: Surface): string => `Overlays — ${SURFACE_LABEL[surface]}`

export const overlayFrameName = (id: string, width: number): string => `${id} · ${width}`

/** Les largeurs d'une surcouche : 1440 puis 390, selon ses viewports. */
export const overlayWidths = (o: Pick<OverlaySpec, 'viewports'>): number[] =>
  (['desktop', 'mobile'] as const).filter(v => o.viewports.includes(v)).map(v => WIDTH[v])

type ActionList = NonNullable<OverlaySpec['actions']>

/** Le nombre de champs de saisie d'un corps de surcouche (piles et grilles comprises). */
const fieldCount = (blocks: readonly Block[]): number =>
  blocks.reduce(
    (n, b) =>
      n +
      (b.type === 'component' && FIELDS.includes(b.component) ? 1 : 0) +
      ('children' in b && b.children ? fieldCount(b.children) : 0),
    0,
  )

/**
 * En mobile, une famille modale de plus de 4 champs occupe tout l'écran ; la recherche globale du backoffice
 * aussi (⌘K en plein écran, Q7 — la palette de l'app garde son panneau bas).
 */
const fullHeight = (o: OverlaySpec, mobile: boolean): boolean =>
  mobile &&
  MODAL_KINDS.includes(o.kind) &&
  (fieldCount(o.body ?? []) > MAX_FIELDS_SHORT_SHEET || (o.surface === 'dm' && o.kind === 'command'))

const button = (a: ActionList[number]): Block => ({
  type: 'component',
  component: 'Button',
  props: { variant: a.variant ?? 'outline', content: { label: a.label } },
})

/** Le pied : en rangée à droite en bureau ; en colonne, primaire EN HAUT, en mobile (`flex-col-reverse`). */
const footer = (actions: ActionList, mobile: boolean): Block[] =>
  actions.length === 0
    ? []
    : [
        mobile
          ? {
              type: 'stack',
              direction: 'column',
              gap: '2',
              align: 'stretch',
              children: [...actions].reverse().map(button),
            }
          : { type: 'stack', direction: 'row', gap: '2', justify: 'end', children: actions.map(button) },
      ]

/** Le bloc racine de la surcouche : le composant du catalogue que sa famille et le viewport désignent. */
function overlayBlock(o: OverlaySpec, mobile: boolean): Block {
  const actions = o.actions ?? []
  const body = o.body ?? []
  const titles = { title: o.title, ...(o.description ? { description: o.description } : {}) }
  const modal = MODAL_KINDS.includes(o.kind)
  if (modal && mobile)
    return {
      type: 'component',
      component: 'Sheet',
      props: { side: 'bottom', content: titles },
      children: [...body, ...footer(actions, true)],
    }
  switch (o.kind) {
    case 'confirm': {
      const [cancel, confirm] = actions
      return {
        type: 'component',
        component: 'ConfirmationDialog',
        props: {
          variant: o.destructive ? 'danger' : 'confirm',
          content: { ...titles, cancel: cancel?.label ?? '', confirm: confirm?.label ?? '' },
        },
      }
    }
    case 'sheet':
      return {
        type: 'component',
        component: 'Sheet',
        props: { side: 'right', content: titles },
        children: [...body, ...footer(actions, false)],
      }
    case 'popover':
      return {
        type: 'component',
        component: 'Popover',
        props: {},
        children: [{ type: 'text', text: o.title, style: 'label' }, ...body, ...footer(actions, false)],
      }
    case 'dropdown':
      return {
        type: 'component',
        component: 'DropdownMenu',
        props: { content: { trigger: o.trigger }, items: o.items },
      }
    case 'tooltip':
      return { type: 'component', component: 'Tooltip', props: { content: { label: o.title } } }
    case 'toast':
      return {
        type: 'component',
        component: 'Toast',
        props: { variant: o.destructive ? 'destructive' : 'default', content: titles },
      }
    default:
      return {
        type: 'component',
        component: 'Dialog',
        props: { content: titles },
        children: [...body, ...footer(actions, false)],
      }
  }
}

/** Largeur FIXE du calque `overlay` (px), ou `undefined` = il suit son composant (menu, popover…). */
function panelWidth(o: OverlaySpec, width: number): number | undefined {
  const mobile = width < SHELL_BREAKPOINT
  if (MODAL_KINDS.includes(o.kind))
    return mobile ? width : o.kind === 'sheet' ? SHEET_WIDTH : o.kind === 'command' ? COMMAND_WIDTH : DIALOG_WIDTH
  if (o.kind === 'toast' && mobile) return width - 2 * EDGE.mobile
  return undefined
}

/** Place le calque `overlay` dans l'écran, selon la famille. */
function place(o: OverlaySpec, panel: FrameNode, width: number, height: number): void {
  const mobile = width < SHELL_BREAKPOINT
  const edge = mobile ? EDGE.mobile : EDGE.desktop
  const clampX = (x: number): number => Math.max(edge, Math.min(x, width - panel.width - edge))
  if (MODAL_KINDS.includes(o.kind) && mobile) {
    panel.x = 0
    panel.y = height - panel.height
  } else if (o.kind === 'sheet') {
    panel.x = width - panel.width - SHEET_INSET
    panel.y = SHEET_INSET
  } else if (MODAL_KINDS.includes(o.kind)) {
    panel.x = (width - panel.width) / 2
    panel.y = Math.max(edge, (height - panel.height) / 2)
  } else if (o.kind === 'toast') {
    // En bas à droite en bureau ; EN HAUT sous 768, la `MobileTabBar` occupe le bas (RUX-25).
    panel.x = mobile ? edge : width - panel.width - edge
    panel.y = mobile ? edge : height - panel.height - edge
  } else {
    // Menu, popover, info-bulle : ancrés sous l'entête, côté des actions de page (à droite).
    panel.x = clampX(width - panel.width - 2 * edge)
    panel.y = Math.min(mobile ? ANCHOR_Y.mobile : ANCHOR_Y.desktop, height - panel.height - edge)
  }
}

/** Le calque `parent` : la page qui ouvre la surcouche, ou le gabarit nu. */
async function drawParent(
  s: Scene,
  reg: Registry,
  recipes: Readonly<Record<string, Recipe>>,
  templates: PageNode,
  o: OverlaySpec,
  pages: readonly PageSpec[],
  width: number,
): Promise<FrameNode | null> {
  if ('page' in o.parent) {
    const id = o.parent.page
    const spec = pages.find(p => p.id === id)
    if (!spec) {
      s.log.error(`${o.id} : page parente ${id} absente du registre`)
      return null
    }
    return renderFrame(s, reg, recipes, templates, spec, width, 'default')
  }
  const variant = findTemplateVariant(templates, o.parent.template, width, o.surface)
  if (!variant) {
    s.log.error(`${o.id} : gabarit ${o.parent.template} à ${width} px absent — lancer « Gabarits » d’abord`)
    return null
  }
  return variant.createInstance().detachInstance()
}

async function renderOverlayFrame(
  s: Scene,
  reg: Registry,
  recipes: Readonly<Record<string, Recipe>>,
  templates: PageNode,
  o: OverlaySpec,
  pages: readonly PageSpec[],
  width: number,
): Promise<FrameNode | null> {
  const mobile = width < SHELL_BREAKPOINT
  const height = VIEWPORT_HEIGHT[mobile ? 'mobile' : 'desktop']
  const parent = await drawParent(s, reg, recipes, templates, o, pages, width)
  if (!parent) return null
  const root = s.api.createFrame()
  root.name = overlayFrameName(o.id, width)
  root.layoutMode = 'NONE'
  root.resize(width, height)
  root.clipsContent = true
  root.fills = paint(s, 'bg/default')
  parent.name = 'parent'
  root.appendChild(parent)
  parent.x = 0
  parent.y = 0
  if (MODAL_KINDS.includes(o.kind)) {
    const scrim = s.api.createRectangle()
    scrim.name = 'scrim'
    scrim.resize(width, height)
    scrim.fills = paint(s, 'guide/veil')
    root.appendChild(scrim)
  }
  const fixed = panelWidth(o, width)
  const sheet = o.kind === 'sheet' && !mobile
  const tall = fullHeight(o, mobile)
  const panel = box(s, 'overlay', {
    direction: 'column',
    align: 'stretch',
    width: fixed,
    height: sheet ? height - 2 * SHEET_INSET : tall ? height : undefined,
  })
  root.appendChild(panel)
  const p: PageCtx = { s, reg, recipes, width, slot: 'overlay', pageId: o.id }
  try {
    await renderBlock(p, overlayBlock(o, mobile), panel)
  } catch (e) {
    root.remove()
    throw e
  }
  const surface = panel.children[0]
  if (surface && 'layoutSizingHorizontal' in surface) {
    if (fixed !== undefined) surface.layoutSizingHorizontal = 'FILL'
    if (sheet || tall) surface.layoutSizingVertical = 'FILL'
  }
  // En mobile, chaque bouton du pied prend la largeur du panneau (cible pleine largeur, primaire en haut).
  if (mobile && surface && 'findAll' in surface)
    for (const b of surface.findAll(n => n.type === 'INSTANCE' && n.name === 'Button'))
      if (b.parent && 'layoutMode' in b.parent && b.parent.layoutMode === 'VERTICAL' && 'layoutSizingHorizontal' in b)
        b.layoutSizingHorizontal = 'FILL'
  // Un toast a une largeur fixe (360 px, `max-w` du code) : sa phrase passe à la ligne, elle ne l'élargit pas.
  if (o.kind === 'toast' && surface && 'findAll' in surface)
    for (const t of surface.findAll(n => n.type === 'TEXT' && n.visible && (n as TextNode).characters.length > 24))
      wrapInPlace(t as TextNode, surface)
  settleFills(panel)
  place(o, panel, width, height)
  return root
}

const FRAME_GAP = 160

interface OverlayRenderResult {
  frames: number
  page: string
}

/** Toutes les surcouches d'une surface, sur sa page « Overlays — … » : une rangée par surcouche. */
export async function renderOverlays(
  s: Scene,
  reg: Registry,
  recipes: Readonly<Record<string, Recipe>>,
  surface: Surface,
  overlays: readonly OverlaySpec[],
  pages: readonly PageSpec[],
): Promise<OverlayRenderResult> {
  const name = overlayPageOf(surface)
  const templates = s.api.root.children.find(p => p.name === 'Templates')
  if (!templates) {
    s.log.error('Surcouches : la page « Templates » manque — lancer « Gabarits » d’abord')
    return { frames: 0, page: name }
  }
  await templates.loadAsync()
  const page = ensurePage(s.api, name)
  await page.loadAsync()
  const mine = overlays.filter(o => o.surface === surface)
  const keep = new Set<string>()
  let frames = 0
  let y = 0
  let sinceYield = 0
  for (const o of mine) {
    let x = 0
    for (const width of overlayWidths(o)) {
      const fname = overlayFrameName(o.id, width)
      keep.add(fname)
      findOnPage<FrameNode>(page, fname, 'FRAME')?.remove()
      let frame: FrameNode | null = null
      try {
        frame = await renderOverlayFrame(s, reg, recipes, templates, o, pages, width)
      } catch (e) {
        s.log.error(`${fname} : cadre non dessiné — ${e instanceof Error ? e.message : String(e)}`)
        continue
      }
      if (!frame) continue
      page.appendChild(frame)
      frame.x = x
      frame.y = y
      x += width + FRAME_GAP
      frames++
      sinceYield++
      if (sinceYield >= FRAMES_PER_YIELD) {
        sinceYield = 0
        await yieldToHost()
      }
    }
    const notesName = `UX — ${o.id}`
    keep.add(notesName)
    findOnPage<FrameNode>(page, notesName, 'FRAME')?.remove()
    const notes = await drawNotes(s, o, notesName)
    page.appendChild(notes)
    notes.x = x
    notes.y = y
    y += VIEWPORT_HEIGHT.desktop + FRAME_GAP
  }
  // Une surcouche retirée du registre part : pas de cadre fantôme.
  for (const n of [...page.children]) if (!keep.has(n.name)) n.remove()
  s.log.info(`${name} : ${mine.length} surcouche(s), ${frames} cadre(s)`)
  return { frames, page: name }
}

/** La fiche d'une surcouche à côté de ses cadres : famille, source, et ses notes d'UX (focus, Échap, écarts). */
async function drawNotes(s: Scene, o: OverlaySpec, name: string): Promise<FrameNode> {
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
  append(f, await text(s, 'title', o.title, { style: 'heading', maxChars: 70 }), { fillWidth: true })
  const meta = `${o.kind}${o.destructive ? ' · destructif' : ''} — ${o.source}`
  append(f, await text(s, 'source', meta, { style: 'mono', color: 'text/muted', maxChars: 70 }), { fillWidth: true })
  for (const n of o.uxNotes) {
    const label = n.kind === 'ecart' ? 'Écart' : 'Décision'
    append(f, await text(s, `note/${n.kind}`, `${label} — ${n.text}`, { style: 'body', maxChars: 70 }), {
      fillWidth: true,
    })
  }
  return f
}

/**
 * Les FEUILLES BASSES de filtres du backoffice (Q7, 25/09/2026) : sous 768, une page DM ne garde que sa
 * recherche et un bouton « Filtres » ; ses autres filtres s'ouvrent dans un panneau bas pleine largeur,
 * dessiné par le même moteur qu'une surcouche (`sheet` → `Sheet` bas en mobile), posé À CÔTÉ des cadres
 * de la page, sur sa page Figma. Une page sans autre filtre que sa recherche n'en a pas.
 */
export async function renderFilterSheets(
  s: Scene,
  reg: Registry,
  recipes: Readonly<Record<string, Recipe>>,
  specs: readonly PageSpec[],
  wanted?: readonly number[],
): Promise<number> {
  const templates = s.api.root.children.find(p => p.name === 'Templates')
  if (!templates) return 0
  let frames = 0
  let sinceYield = 0
  for (const spec of specs.filter(x => x.surface === 'dm')) {
    const sheet = splitFilters((spec.slots as Partial<Record<string, Block[]>>).filters ?? []).sheet
    if (sheet.length === 0) continue
    const page = ensurePage(s.api, figmaPageOf(spec))
    await page.loadAsync()
    const phones = pageWidths(spec, wanted).filter(w => w < SHELL_BREAKPOINT)
    const row = page.children.filter(n => phones.some(w => n.name === frameName(spec.id, w, 'default')))
    let x = Math.max(0, ...row.map(n => n.x + n.width + FRAME_GAP))
    const y = row[0]?.y ?? 0
    for (const width of phones) {
      const o: OverlaySpec = {
        id: `dm/overlays/filtres-${spec.id.slice(3).replace(/\//g, '-')}`,
        surface: 'dm',
        kind: 'sheet',
        parent: { page: spec.id },
        source: 'apps/dashboard-manager/src/ui/FilterBar.tsx:44',
        title: 'Filtres',
        destructive: false,
        viewports: ['mobile'],
        body: sheet,
        actions: [{ label: 'Réinitialiser' }, { label: 'Afficher les résultats', variant: 'default' }],
        uxNotes: [],
      }
      const name = filterSheetFrameName(spec.id, width)
      findOnPage<FrameNode>(page, name, 'FRAME')?.remove()
      let frame: FrameNode | null = null
      try {
        frame = await renderOverlayFrame(s, reg, recipes, templates, o, specs, width)
      } catch (e) {
        s.log.error(`${name} : cadre non dessiné — ${e instanceof Error ? e.message : String(e)}`)
        continue
      }
      if (!frame) continue
      frame.name = name
      page.appendChild(frame)
      frame.x = x
      frame.y = y
      x += width + FRAME_GAP
      frames++
      sinceYield++
      if (sinceYield >= FRAMES_PER_YIELD) {
        sinceYield = 0
        await yieldToHost()
      }
    }
  }
  return frames
}
