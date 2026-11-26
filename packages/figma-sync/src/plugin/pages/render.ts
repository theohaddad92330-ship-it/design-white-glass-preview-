import { COMPONENTS, DEFAULT_PAGE_WIDTHS, SHELL_BREAKPOINT, TEMPLATES, WIDTHS } from '../../spec/catalog'
import { columnLabel, columnMobileRole, columnPriority } from '../../spec/types'
import type { Block, PageSpec, Surface, TableColumn } from '../../spec/types'
import { defaultOf, instantiate, recolor, type Registry } from '../components/engine'
import { demoTable, demoText } from './demo-fill'
import type { Recipe } from '../components/recipe'
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
import { findTemplateVariant, statesOf, type TemplateState, WIDE } from '../templates/layout'

/**
 * Le RENDU D'UNE PAGE : une `PageSpec` → un cadre par largeur (et par état),
 * sur la page Figma de sa surface et de son domaine. Chaque cadre part d'une
 * INSTANCE du gabarit à cette largeur, détachée (Figma ne sait pas remplir un
 * cadre d'instance) : la coque, la position du titre, des filtres et des
 * états sont donc celles du gabarit, à l'identique dans toutes les pages.
 */

type ComponentId = keyof typeof COMPONENTS

/** Libellés FR des domaines (nom de la page Figma). Un domaine absent garde son nom de code, capitalisé. */
const DOMAIN_LABELS: Readonly<Record<string, string>> = {
  accounts: 'Comptes',
  contacts: 'Contacts',
  analysis: 'Analyses',
  billing: 'Facturation',
  settings: 'Réglages',
  chat: 'Laura',
  missions: 'Missions',
  onboarding: 'Onboarding',
  auth: 'Authentification',
}

export function figmaPageOf(spec: Pick<PageSpec, 'surface' | 'domain'>): string {
  if (spec.surface === 'site') return 'Site'
  const label = DOMAIN_LABELS[spec.domain] ?? spec.domain.charAt(0).toUpperCase() + spec.domain.slice(1)
  return `${spec.surface === 'app' ? 'App' : 'DM'} — ${label}`
}

/** Insère une largeur juste avant les largeurs mobiles (< `SHELL_BREAKPOINT`) — bureau d'abord (GA-28). */
function insertBeforeMobile(widths: readonly number[], width: number): number[] {
  const splitAt = widths.findIndex(w => w < SHELL_BREAKPOINT)
  const result = [...widths]
  result.splice(splitAt === -1 ? result.length : splitAt, 0, width)
  return result
}

/**
 * Les largeurs où une page est dessinée : celles demandées (ou, à défaut, les
 * largeurs par défaut de sa surface), filtrées par ses viewports —
 * `desktop` = ≥ 768, `mobile` = < 768.
 */
export function pageWidths(
  spec: Pick<PageSpec, 'surface' | 'viewports' | 'template'>,
  wanted?: readonly number[],
): number[] {
  // L'ordre DEMANDÉ est gardé (1440, 1920, 2560, 1280, 1024, 390, 360 par défaut) : bureau d'abord.
  const known: readonly number[] = WIDTHS
  const base: readonly number[] = wanted?.length
    ? wanted.filter(w => known.includes(w))
    : // RUX-49 (docs/revue-ux.md T3.0) : une page `list` dessine aussi 768 par défaut, en plus des
      // largeurs par défaut de sa surface (les pages `list` sont les plus consultées sur tablette) —
      // bureau d'abord, 768 juste avant les largeurs mobiles.
      spec.template === 'list' && !(DEFAULT_PAGE_WIDTHS[spec.surface] as readonly number[]).includes(768)
      ? insertBeforeMobile(DEFAULT_PAGE_WIDTHS[spec.surface], 768)
      : DEFAULT_PAGE_WIDTHS[spec.surface]
  return base.filter(w => spec.viewports.includes(w >= SHELL_BREAKPOINT ? 'desktop' : 'mobile'))
}

export const frameName = (id: string, width: number, state: TemplateState): string =>
  `${id} · ${width}${state === 'default' ? '' : ` · ${state}`}`

/** Le cadre de la FEUILLE BASSE des filtres d'une page du backoffice, sous 768 (à côté de la page). */
export const filterSheetFrameName = (id: string, width: number): string => `${id} · ${width} · filtres`

const SPACE = (token: string): number => Number(token) * 4
/** Au-delà de cette largeur naturelle, un texte de page est un paragraphe (il passe à la ligne). */
const LABEL_MAX_PX = 240
const PLACEHOLDER_HEIGHT = { sm: 120, md: 240, lg: 360 } as const

export interface PageCtx {
  s: Scene
  reg: Registry
  recipes: Readonly<Record<string, Recipe>>
  width: number
  slot: string
  pageId: string
  /** La surface de la page (absente pour une surcouche) : le backoffice a ses tableaux à rôles sous 768. */
  surface?: Surface
}

/**
 * Les indices des colonnes VISIBLES d'un tableau, par PRIORITÉ (RUX-15, `docs/revue-ux.md` §4) —
 * remplace l'ancienne règle positionnelle « 2 premières colonnes » : la « prochaine action » d'un
 * compte ne disparaît plus sous prétexte qu'elle est la sixième. ≥ 1024 : toutes. 768–1023 : les
 * quatre priorités les plus hautes (par POSITION si aucune n'est déclarée — compatibilité). < 768 :
 * les colonnes de rôle `title`/`meta` (par POSITION, deux au plus, si aucun rôle n'est déclaré) —
 * masquées, jamais supprimées (GA-29).
 */
export function visibleColumnIndices(width: number, columns: readonly TableColumn[]): Set<number> {
  if (width >= 1024) return new Set(columns.map((_, i) => i))
  const byPriority = columns.map((col, i) => ({ i, p: columnPriority(col, i) })).sort((a, b) => a.p - b.p)
  if (width >= SHELL_BREAKPOINT) return new Set(byPriority.slice(0, Math.min(4, columns.length)).map(x => x.i))
  const roled = columns
    .map((col, i) => ({ i, role: columnMobileRole(col) }))
    .filter(x => x.role === 'title' || x.role === 'meta')
  if (roled.length > 0) return new Set(roled.map(x => x.i))
  return new Set(byPriority.slice(0, Math.min(2, columns.length)).map(x => x.i))
}

/**
 * Les colonnes LATÉRALES (320 px au plus) : un contenu y est traité comme sur un téléphone —
 * tableau à 2 colonnes visibles (les autres masquées, pas supprimées), bouton pleine largeur.
 */
const NARROW_SLOTS = new Set(['aside', 'history', 'sectionNav'])

/** Un bouton dans une colonne étroite : pleine largeur, libellé coupé « … » (le code est `whitespace-nowrap`). */
function fullWidthButton(inst: InstanceNode): void {
  inst.layoutSizingHorizontal = 'FILL'
  const label = inst.findOne(n => n.type === 'TEXT' && n.name === 'label') as TextNode | null
  if (!label) return
  label.textAutoResize = 'HEIGHT'
  label.layoutSizingHorizontal = 'FILL'
  label.textTruncation = 'ENDING'
  label.maxLines = 1
}

/** Colonnes d'une grille : toutes à ≥ 1440 (+2 pour les KPI à ≥ 2560), 4 au plus de 1280 à 1439, 2 de 768 à 1279, `columnsMobile` dessous. */
export function gridColumns(width: number, columns: number, columnsMobile: number | undefined, slot: string): number {
  if (width < SHELL_BREAKPOINT) return columnsMobile ?? 1
  if (width < 1280) return Math.min(columns, 2)
  // De 1280 à 1439, une grille de 6 donne des cellules de 160 px : un chiffre en `display` s'y casse.
  if (width < 1440) return Math.min(columns, 4)
  if (slot === 'kpis' && width >= WIDE) return Math.min(12, columns + 2)
  return columns
}

function fillTable(p: PageCtx, inst: InstanceNode, table: { columns: TableColumn[]; rows: string[][] }): void {
  const shown = visibleColumnIndices(NARROW_SLOTS.has(p.slot) ? 0 : p.width, table.columns)
  const headLabels = table.columns.map(columnLabel)
  const rows = inst.findAll(n => n.name === 'head' || /^row\/\d+$/.test(n.name))
  const capacity = rows.filter(r => r.name !== 'head').length
  if (table.rows.length > capacity) p.s.log.warn(`${p.pageId} : ${table.rows.length} lignes, ${capacity} dessinées`)
  for (const row of rows) {
    const r = row.name === 'head' ? -1 : Number(row.name.split('/')[1]) - 1
    const values = r < 0 ? headLabels : table.rows[r]
    row.visible = values !== undefined
    if (!values || !('findAll' in row)) continue
    for (const cell of row.findAll(n => /^cell\/\d+$/.test(n.name))) {
      const c = Number(cell.name.split('/')[1]) - 1
      cell.visible = shown.has(c) && values[c] !== undefined
      const label = 'findOne' in cell ? (cell.findOne(n => n.type === 'TEXT') as TextNode | null) : null
      if (label && values[c] !== undefined) label.characters = values[c] ?? ''
    }
  }
}

async function renderComponent(
  p: PageCtx,
  block: Extract<Block, { type: 'component' }>,
  into: FrameNode,
): Promise<void> {
  const { s } = p
  const id = block.component as ComponentId
  const props = block.props as Record<string, unknown>
  const values: Record<string, string> = {}
  for (const axis of Object.keys(COMPONENTS[id].variants))
    if (typeof props[axis] === 'string') values[axis] = props[axis]
  const inst = instantiate(s, p.reg, id, {
    values,
    // Les emplacements (« Compte exemple 1 ») deviennent les fiches du jeu de démonstration (défaut B).
    content: props.content
      ? Object.fromEntries(Object.entries(props.content as Record<string, string>).map(([k, v]) => [k, demoText(v)]))
      : undefined,
    items: (props.items as string[] | undefined)?.map(demoText),
  })
  if (!inst) {
    s.log.error(`${p.pageId} : composant ${id} absent du fichier — lancer « Composants » d’abord`)
    return
  }
  const recipe = p.recipes[id]
  const full = instanceValues(id, values)
  // Une barre dont la page donne la proportion (`value` → `indicator`) garde sa largeur d'auteur : étirée,
  // sa proportion serait fausse.
  const proportioned =
    typeof (props.content as Record<string, string> | undefined)?.value === 'string' &&
    inst.findOne(n => n.name === 'indicator') !== null
  const narrow = p.width < SHELL_BREAKPOINT || NARROW_SLOTS.has(p.slot)
  const wanted = typeof recipe?.stretch === 'function' ? recipe.stretch(full) : recipe?.stretch
  // `narrow` : HUG en bureau, étiré (et défilant) seulement là où il ne tient pas (défaut H, 25/09/2026).
  // Un champ de saisie prend toute la largeur d'un téléphone (défaut I).
  const phoneField = FIELDS.has(id) && p.width < SHELL_BREAKPOINT
  const stretch = !proportioned && (phoneField || (wanted === 'narrow' ? narrow : wanted === true))
  const table = props.table as { columns: TableColumn[]; rows: string[][] } | undefined
  // Le backoffice sous 768 : un tableau devient une liste de cartes-lignes à rôles, jamais un défilement horizontal.
  if (table && backofficePhone(p) && !block.children?.length) {
    inst.remove()
    await renderRoleTable(p, demoTable(table), into)
    return
  }
  if (table) fillTable(p, inst, demoTable(table))
  const nested = BORDERED.has(id) && insideCard(into)
  if (block.children?.length) {
    const frame = inst.detachInstance()
    if (nested) flattenNested(s, id, frame)
    const content = frame.findOne(n => n.name === 'content' && n.type === 'FRAME') as FrameNode | null
    const target = content ?? frame
    if (content) for (const c of [...content.children]) c.remove()
    append(into, frame, { fillWidth: stretch })
    for (const child of block.children) await renderBlock(p, child, target)
    return
  }
  append(into, inst, { fillWidth: stretch })
  if (nested) flattenNested(s, id, inst)
  // Un conteneur posé sans enfants ne montre pas son « Contenu » d'auteur (défaut A, 25/09/2026).
  for (const n of inst.findAll(x => x.type === 'TEXT' && x.name === 'placeholder' && x.parent?.name === 'content'))
    n.visible = false
  if (p.width < SHELL_BREAKPOINT) wrapLongLabels(inst)
  else if (id === 'Button' && NARROW_SLOTS.has(p.slot)) fullWidthButton(inst)
  const touch = p.width < SHELL_BREAKPOINT ? recipe?.touch?.(full) : null
  if (touch?.minHeight) inst.minHeight = touch.minHeight
  if (touch?.minWidth) inst.minWidth = touch.minWidth
}

// ─── Le backoffice (DM) sous 768 : tableaux à rôles, filtres en feuille basse (Q7, 25/09/2026) ───

/** Une page du backoffice dessinée sur un téléphone. */
const backofficePhone = (p: Pick<PageCtx, 'surface' | 'width'>): boolean =>
  p.surface === 'dm' && p.width < SHELL_BREAKPOINT

/** Une colonne de STATUT : elle reste sur la ligne mobile, en badge. */
const STATUS_HEADER = /^(statut|état|état serveur|santé|présence|conforme|résultat|rôle)$/i

/**
 * Les rôles mobiles des colonnes d'un tableau du backoffice : la 1ʳᵉ est le TITRE, la première colonne de
 * statut reste en badge, la colonne SANS entête porte l'action principale de la ligne (« Retirer ») ; les
 * autres sont des CHAMPS, dans la fiche de la ligne. Rien n'est supprimé (GA-29).
 */
function mobileRoles(columns: readonly TableColumn[]): { status: number; action: number; fields: number[] } {
  const status = columns.findIndex((c, k) => k > 0 && STATUS_HEADER.test(columnLabel(c).trim()))
  const action = columns.findIndex((c, k) => k > 0 && columnLabel(c).trim() === '')
  const fields = columns.map((_, k) => k).filter(k => k > 0 && k !== status && k !== action)
  return { status, action, fields }
}

/**
 * Le tableau à rôles mobiles : une carte-ligne par ligne — titre, statut, action et chevron (44 px) sur la
 * ligne ; la fiche (étiquette / valeur des autres colonnes) sous la ligne, dépliée sur la PREMIÈRE seule.
 * Une valeur absente (cellule vide) ne fait aucune paire : on n'affiche pas ce qu'on n'a pas.
 */
async function renderRoleTable(
  p: PageCtx,
  table: { columns: TableColumn[]; rows: string[][] },
  into: FrameNode,
): Promise<void> {
  const { s } = p
  const { status, action, fields } = mobileRoles(table.columns)
  const list = box(s, 'MobileRoleTable', { direction: 'column', gap: 8, align: 'stretch' })
  append(into, list, { fillWidth: true })
  for (const [k, row] of table.rows.entries()) {
    const card = box(s, `role-row/${k + 1}`, {
      direction: 'column',
      padX: 12,
      padY: 4,
      gap: 4,
      align: 'stretch',
      fill: 'bg/default',
      stroke: 'border/default',
      radius: 'shadcn',
    })
    append(list, card, { fillWidth: true })
    const line = box(s, 'line', { direction: 'row', gap: 8, align: 'center' })
    append(card, line, { fillWidth: true })
    line.minHeight = 44
    const title = await text(s, 'title', row[0] || '—', { size: 14, weight: 500 })
    append(line, title, { fillWidth: true })
    title.textTruncation = 'ENDING'
    title.maxLines = 1
    const statusValue = status >= 0 ? row[status] : undefined
    if (statusValue) {
      const badge = instantiate(s, p.reg, 'Badge', { content: { label: statusValue } })
      if (badge) {
        badge.name = 'status'
        append(line, badge)
      }
    }
    const actionValue = action >= 0 ? row[action] : undefined
    if (actionValue) {
      const button = instantiate(s, p.reg, 'Button', {
        values: { variant: 'outline', size: 'sm' },
        content: { label: actionValue },
      })
      if (button) {
        button.name = 'action'
        append(line, button)
        button.minHeight = 44
      }
    }
    const pairs = fields.filter(c => row[c])
    if (pairs.length === 0) continue
    const open = k === 0
    const toggle = box(s, 'toggle', { direction: 'row', width: 44, height: 44, align: 'center', justify: 'center' })
    append(line, toggle)
    const chevron = p.reg.icons.get('chevron-down')?.createInstance()
    if (chevron) {
      chevron.resize(20, 20)
      recolor(s, chevron, 'text/muted')
      if (open) chevron.rotation = 180
      toggle.appendChild(chevron)
    }
    const details = box(s, 'details', { direction: 'column', align: 'stretch', padBottom: 8 })
    append(card, details, { fillWidth: true })
    details.visible = open
    for (const c of pairs) {
      const pair = instantiate(s, p.reg, 'DataRow', {
        content: { label: columnLabel(table.columns[c]), value: row[c] ?? '' },
      })
      if (!pair) continue
      append(details, pair, { fillWidth: true })
      wrapLongLabels(pair)
    }
  }
}

const isSearch = (b: Block): boolean => b.type === 'component' && b.component === 'SearchInput'

/** Les blocs sans leurs recherches (une pile vidée disparaît). */
function withoutSearch(blocks: readonly Block[]): Block[] {
  return blocks.flatMap((b): Block[] => {
    if (isSearch(b)) return []
    if (b.type === 'stack' || b.type === 'grid') {
      const children = withoutSearch(b.children)
      return children.length ? [{ ...b, children }] : []
    }
    return [b]
  })
}

const searchesOf = (blocks: readonly Block[]): Block[] =>
  blocks.flatMap(b => (isSearch(b) ? [b] : b.type === 'stack' || b.type === 'grid' ? searchesOf(b.children) : []))

/** Une pile de boutons seuls (« Rechercher » à côté du champ) n'est pas un filtre : elle reste sur la page. */
const onlyButtons = (blocks: readonly Block[]): boolean =>
  blocks.every(b =>
    b.type === 'component'
      ? b.component === 'Button'
      : b.type === 'stack' || b.type === 'grid'
        ? onlyButtons(b.children)
        : false,
  )

/**
 * Les filtres d'une page du backoffice sous 768 : la recherche reste sur la page, pleine largeur ; le reste
 * (pastilles, sélecteurs, bascules) passe dans une FEUILLE BASSE ouverte par « Filtres ». `sheet` vide = rien
 * à replier (la page n'a qu'une recherche).
 */
export function splitFilters(blocks: readonly Block[]): { inline: Block[]; sheet: Block[] } {
  const rest = withoutSearch(blocks)
  if (rest.length === 0 || onlyButtons(rest)) return { inline: [...blocks], sheet: [] }
  const trigger: Block = {
    type: 'component',
    component: 'Button',
    props: { variant: 'outline', content: { label: 'Filtres' } },
  }
  return { inline: [...searchesOf(blocks), trigger], sheet: rest }
}

/** Le composant de graphe qui dessine un emplacement `chart`, lu dans son libellé (défaut F). */
function chartFor(label: string): ComponentId {
  const l = label.toLowerCase()
  if (/waterfall|cascade/.test(l)) return 'WaterfallChart'
  if (/heatmap|chaleur/.test(l)) return 'Heatmap'
  if (/cohorte/.test(l)) return 'CohortGrid'
  if (/empil/.test(l)) return 'StackedBar'
  if (/anneau|donut|taux de réalisation|répartition/.test(l)) return 'Donut'
  if (/sparkline|courbe|trajectoire|dans le temps|par jour|évolution|tendance|mois|24 ?h/.test(l)) return 'Sparkline'
  return 'BarChart'
}

/** Les champs de saisie qu'une rangée n'écrase pas sur téléphone (défaut I). */
const FIELDS: ReadonlySet<string> = new Set(['SearchInput', 'Input', 'Select'])

/** Les surfaces BORDÉES du catalogue : une carte, une liste en carte, une zone de danger. */
const BORDERED = new Set(['Card', 'SectionCard', 'SettingsGroup', 'DataList', 'DangerZone'])

/** Une surface bordée au-dessus de `into` (jusqu'au cadre de page) : ce qu'on pose dedans est DÉJÀ dans une carte. */
function insideCard(into: BaseNode): boolean {
  for (let up: BaseNode | null = into; up && up.type !== 'PAGE'; up = up.parent)
    if (BORDERED.has(up.name) && 'strokes' in up && up.strokes.length > 0) return true
  return false
}

/**
 * Défaut E (25/09/2026) : une liste ou une carte posée dans une carte n'a pas sa propre bordure — la carte
 * dans la carte est le motif que tout le design system refuse. Une liste s'aplatit (ni trait, ni fond, ni
 * ombre) ; une carte imbriquée devient un panneau de surface (fond `surface/1`, sans trait ni ombre).
 */
function flattenNested(s: Scene, id: string, node: FrameNode | InstanceNode): void {
  node.strokes = []
  if ('effectStyleId' in node) void node.setEffectStyleIdAsync('')
  node.fills = id === 'DataList' ? [] : paint(s, 'surface/1')
}

/** Les valeurs complètes d'une instance (les axes absents prennent leur défaut). */
function instanceValues(id: ComponentId, values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [axis, list] of Object.entries(COMPONENTS[id].variants) as [string, readonly string[]][])
    out[axis] = values[axis] && list.includes(values[axis]) ? values[axis] : defaultOf(list)
  return out
}

/**
 * Sur téléphone, un libellé long (> 24 caractères, ex. un bouton-lien) passe à la
 * ligne dans la largeur de son slot au lieu de déborder de l'écran.
 */
const LONG_LABEL = 24
function wrapLongLabels(inst: InstanceNode): void {
  const long = inst.findAll(
    n => n.type === 'TEXT' && n.visible && (n as TextNode).characters.length > LONG_LABEL,
  ) as TextNode[]
  if (long.length === 0) return
  inst.layoutSizingHorizontal = 'FILL'
  for (const tn of long) wrapInPlace(tn, inst)
}

export async function renderBlock(p: PageCtx, block: Block, into: FrameNode): Promise<void> {
  const { s } = p
  switch (block.type) {
    case 'component':
      await renderComponent(p, block, into)
      return
    case 'text': {
      // Une ÉTIQUETTE (courte) tient sur une ligne, à sa largeur ; un PARAGRAPHE s'étire, borné à 70 caractères.
      const size = s.tokens.textStyles.find(x => x.name === block.style)?.fontSize ?? 14
      const label = block.text.length * size * 0.6 <= LABEL_MAX_PX
      const tn = await text(s, 'text', demoText(block.text), {
        style: block.style,
        color: block.color,
        maxChars: label ? undefined : 70,
      })
      append(into, tn)
      return
    }
    case 'stack': {
      // Défaut I (25/09/2026) : sous 768, une rangée qui porte un champ de saisie (la recherche et l'action
      // principale côte à côte) s'EMPILE, chaque enfant pleine largeur — la recherche n'est plus écrasée.
      const stacked =
        block.direction === 'row' &&
        p.width < SHELL_BREAKPOINT &&
        block.children.some(c => c.type === 'component' && FIELDS.has(c.component))
      const row = block.direction === 'row' && !stacked
      const f = box(s, 'stack', {
        direction: row ? 'row' : 'column',
        gap: SPACE(block.gap),
        padX: block.padding ? SPACE(block.padding) : 0,
        padY: block.padding ? SPACE(block.padding) : 0,
        align: block.align ?? (row ? 'center' : 'stretch'),
        justify: block.justify,
        fill: block.fill,
        stroke: block.stroke,
        radius: block.radius,
        shadow: block.shadow,
        // Une rangée passe à la ligne quand la place manque : rien ne déborde, à aucune largeur.
        wrap: row,
      })
      if (row) f.counterAxisSpacing = SPACE(block.gap)
      append(into, f, { grow: block.grow, fillWidth: !row || block.grow })
      for (const c of block.children) await renderBlock(p, c, f)
      if (stacked) for (const c of f.children) if ('layoutSizingHorizontal' in c) c.layoutSizingHorizontal = 'FILL'
      return
    }
    case 'grid': {
      const cols = gridColumns(p.width, block.columns, block.columnsMobile, p.slot)
      const grid = box(s, `grid/${cols}`, { direction: 'column', gap: SPACE(block.gap), align: 'stretch' })
      append(into, grid, { fillWidth: true })
      for (let start = 0; start < block.children.length; start += cols) {
        const line = box(s, 'grid-row', { direction: 'row', gap: SPACE(block.gap), align: 'stretch' })
        append(grid, line, { fillWidth: true })
        for (let k = 0; k < cols; k++) {
          const cell = box(s, 'grid-cell', { direction: 'column', align: 'stretch' })
          append(line, cell, { fillWidth: true })
          const child = block.children[start + k]
          if (child) await renderBlock(p, child, cell)
        }
      }
      return
    }
    case 'placeholder': {
      // Défaut F (25/09/2026) : plus de rectangle gris en pointillés. Un GRAPHE est un composant du catalogue
      // (sa forme d'exemple, jamais une valeur inventée), titré par le libellé de la spec ; le reste (carte,
      // organigramme, image) est une surface token discrète qui porte son libellé.
      const chart = block.kind === 'chart' ? chartFor(block.label) : null
      const f = box(s, chart ? `chart/${chart}` : `placeholder/${block.kind}`, {
        direction: 'column',
        gap: 12,
        padX: chart ? 0 : 16,
        padY: chart ? 0 : 16,
        fill: chart ? undefined : 'surface/1',
        radius: chart ? undefined : 'lg',
        align: chart ? 'stretch' : 'center',
        justify: chart ? 'start' : 'center',
        minHeight: chart ? undefined : PLACEHOLDER_HEIGHT[block.height],
      })
      append(into, f, { fillWidth: true })
      append(f, await text(s, 'label', block.label, { style: 'caption', color: 'text/muted', maxChars: 70 }))
      if (!chart) return
      const inst = instantiate(s, p.reg, chart, {})
      if (!inst) {
        s.log.error(`${p.pageId} : composant ${chart} absent du fichier — lancer « Composants » d’abord`)
        return
      }
      append(f, inst, { fillWidth: true })
      return
    }
  }
}

/** Le cadre d'un slot — cherché HORS des instances (la Sidebar a aussi un `header`). */
function findSlot(root: FrameNode, name: string): FrameNode | null {
  for (const child of root.children) {
    if (child.type !== 'FRAME') continue
    if (child.name === name) return child
    const found = findSlot(child, name)
    if (found) return found
  }
  return null
}

/** Un cadre de page : le gabarit à cette largeur, détaché, ses slots remplis (ou cachés s'ils sont vides). */
export async function renderFrame(
  s: Scene,
  reg: Registry,
  recipes: Readonly<Record<string, Recipe>>,
  templates: PageNode,
  spec: PageSpec,
  width: number,
  state: TemplateState,
): Promise<FrameNode | null> {
  const variant = findTemplateVariant(templates, spec.template, width, spec.surface)
  if (!variant) {
    s.log.error(`${spec.id} : gabarit ${spec.template} à ${width} px absent — lancer « Gabarits » d’abord`)
    return null
  }
  const frame = variant.createInstance().detachInstance()
  frame.name = frameName(spec.id, width, state)
  try {
    await fillFrame(s, reg, recipes, spec, width, state, frame)
  } catch (e) {
    // Un cadre à moitié rempli ne reste pas sur la page courante (où Figma pose toute instance neuve).
    frame.remove()
    throw e
  }
  return frame
}

async function fillFrame(
  s: Scene,
  reg: Registry,
  recipes: Readonly<Record<string, Recipe>>,
  spec: PageSpec,
  width: number,
  state: TemplateState,
  frame: FrameNode,
): Promise<void> {
  const slots = spec.slots as Partial<Record<string, Block[]>>
  const stateBlocks = state === 'default' ? undefined : (spec.states as Partial<Record<string, Block[]>>)[state]
  for (const slot of TEMPLATES[spec.template].slots as readonly string[]) {
    const f = findSlot(frame, slot)
    if (!f) continue
    const given = slot === 'primary' && stateBlocks ? stateBlocks : slots[slot]
    const phone = backofficePhone({ surface: spec.surface, width })
    const blocks = phone && slot === 'filters' && given ? splitFilters(given).inline : given
    if (!blocks?.length) {
      // On n'affiche pas ce qu'on n'a pas : un slot vide ne se dessine pas.
      f.visible = false
      continue
    }
    for (const c of [...f.children]) c.remove()
    f.fills = []
    f.strokes = []
    f.dashPattern = []
    f.paddingLeft = f.paddingRight = f.paddingTop = f.paddingBottom = 0
    f.minHeight = null
    const p: PageCtx = { s, reg, recipes, width, slot, pageId: spec.id, surface: spec.surface }
    for (const b of blocks) await renderBlock(p, b, f)
  }
  // Le maître-détail (≥ 2560) : la fiche est une surface token, pas un guide en pointillés (défaut F).
  const preview = findSlot(frame, 'preview')
  if (preview) {
    preview.fills = paint(s, 'surface/1')
    preview.strokes = []
    preview.dashPattern = []
  }
  settleFills(frame, HUG_SLOTS)
}

const FRAME_GAP = 160
/** Le slot `actions` d'un entête reste à sa largeur, aligné à droite (gabarits). */
const HUG_SLOTS: ReadonlySet<string> = new Set(['actions'])

interface PageRenderResult {
  frames: number
  pages: string[]
}

export async function renderSurface(
  s: Scene,
  reg: Registry,
  recipes: Readonly<Record<string, Recipe>>,
  surface: Surface,
  specs: readonly PageSpec[],
  wanted?: readonly number[],
): Promise<PageRenderResult> {
  const templates = s.api.root.children.find(p => p.name === 'Templates')
  if (!templates) {
    s.log.error('Pages : la page « Templates » manque — lancer « Gabarits » d’abord')
    return { frames: 0, pages: [] }
  }
  await templates.loadAsync()
  const byPage = new Map<string, PageSpec[]>()
  for (const spec of specs.filter(x => x.surface === surface)) {
    const name = figmaPageOf(spec)
    byPage.set(name, [...(byPage.get(name) ?? []), spec])
  }
  let frames = 0
  let sinceYield = 0
  for (const [name, list] of byPage) {
    const page = ensurePage(s.api, name)
    await page.loadAsync()
    let y = 0
    for (const spec of list) {
      const keep = new Set<string>()
      // Les états facultatifs du gabarit ne se dessinent que si la page les déclare.
      const declared = spec.states as Partial<Record<string, unknown>>
      for (const state of statesOf(spec.template).filter(st => st === 'default' || declared[st] !== undefined)) {
        let x = 0
        let rowHeight = 0
        for (const width of pageWidths(spec, wanted)) {
          const fname = frameName(spec.id, width, state)
          keep.add(fname)
          findOnPage<FrameNode>(page, fname, 'FRAME')?.remove()
          // Défaut M (25/09/2026) : une exception dans UN cadre arrêtait toute la synchronisation (aucune
          // page DM après « Site »). Elle est journalisée avec le nom du cadre, et on passe au suivant.
          let frame: FrameNode | null = null
          try {
            frame = await renderFrame(s, reg, recipes, templates, spec, width, state)
          } catch (e) {
            s.log.error(`${fname} : cadre non dessiné — ${e instanceof Error ? e.message : String(e)}`)
            continue
          }
          if (!frame) continue
          page.appendChild(frame)
          frame.x = x
          frame.y = y
          x += width + FRAME_GAP
          rowHeight = Math.max(rowHeight, frame.height)
          frames++
          // Un registre complet (toutes les pages × largeurs) ne finit jamais un tour de boucle sans
          // rendre la main : au-delà de FRAMES_PER_YIELD cadres, le worker vitest et l'UI du plugin
          // n'ont plus de fenêtre pour répondre (voir `yieldToHost`, packages/figma-sync/src/plugin/scene.ts).
          sinceYield++
          if (sinceYield >= FRAMES_PER_YIELD) {
            sinceYield = 0
            await yieldToHost()
          }
        }
        if (rowHeight) y += rowHeight + FRAME_GAP
      }
      // Un cadre d'une largeur ou d'un état qui n'est plus demandé part : pas de cadre fantôme.
      for (const n of [...page.children]) if (n.name.startsWith(`${spec.id} · `) && !keep.has(n.name)) n.remove()
    }
    // Le journal dit où la synchronisation en est : si Figma s'arrête, on sait après quelle page.
    s.log.info(`${name} : ${list.length} page(s) dessinée(s)`)
  }
  return { frames, pages: [...byPage.keys()] }
}

/** La page `Rules (UX)` : tous les `uxNotes`, groupés par page, avec leur source `fichier:ligne`. */
export async function renderUxRules(
  s: Scene,
  page: PageNode,
  specs: readonly PageSpec[],
  surface: Surface,
): Promise<number> {
  await page.loadAsync()
  // Une colonne par surface : relancer une surface ne déplace pas les deux autres.
  const x = { app: 0, site: 900, dm: 1800 }[surface]
  let y = 0
  let notes = 0
  for (const spec of specs.filter(x => x.surface === surface)) {
    const name = `UX — ${spec.id}`
    findOnPage<FrameNode>(page, name, 'FRAME')?.remove()
    if (spec.uxNotes.length === 0) continue
    const f = box(s, name, {
      direction: 'column',
      gap: 8,
      padX: 24,
      padY: 24,
      fill: 'surface/1',
      stroke: 'border/default',
      radius: 'lg',
      align: 'start',
      width: 800,
    })
    page.appendChild(f)
    append(f, await text(s, 'title', `${spec.title} — ${spec.id}`, { style: 'heading' }))
    append(f, await text(s, 'route', spec.route, { style: 'caption' }))
    for (const kind of ['ecart', 'decision'] as const) {
      const list = spec.uxNotes.filter(n => n.kind === kind)
      if (!list.length) continue
      append(
        f,
        await text(s, 'kind', kind === 'ecart' ? 'Écarts (le code fait encore autrement)' : 'Décisions', {
          style: 'label',
        }),
      )
      for (const n of list) {
        const line = box(s, `note/${kind}`, { direction: 'column', gap: 4, align: 'start' })
        f.appendChild(line)
        append(line, await text(s, 'text', n.text, { style: 'body', maxChars: 70 }))
        append(line, await text(s, 'source', n.source, { style: 'mono', color: 'text/muted' }))
        notes++
      }
    }
    f.x = x
    f.y = y
    y += f.height + 80
  }
  return notes
}
