import { COMPONENTS } from '../../spec/catalog'
import { PAGES } from '../../spec/pages'
import type { Block, PageSpec, TableColumn } from '../../spec/types'
import { demoTable } from '../pages/demo-fill'
import type { BoxPart, Part } from './recipe'

/**
 * La CAPACITÉ d'un composant à entrées (onglets, filtres, sommaire…) ou d'un tableau : le nombre
 * d'`item/N` / `row/N` que sa recette dessine. Elle était écrite à la main (8, 6, 4…) et les pages
 * en demandaient plus — « SectionSidebarNav : 16 entrées demandées, 8 dessinées » (défaut K,
 * 25/09/2026) : le sommaire des réglages perdait la moitié de ses sections, sans erreur.
 * Elle est désormais CALCULÉE : le maximum demandé par le registre des pages (jamais sous la
 * capacité d'auteur de la recette). Le surplus est dessiné caché ; une page n'en montre que ce
 * qu'elle fournit.
 */

function walk(blocks: readonly Block[] | undefined, visit: (b: Block) => void): void {
  for (const b of blocks ?? []) {
    visit(b)
    if (b.type === 'stack' || b.type === 'grid') walk(b.children, visit)
    if (b.type === 'component' && b.children) walk(b.children, visit)
  }
}

/** Le plus grand nombre d'entrées (`items`) et de lignes (`table.rows`) demandé, par composant. */
export function demandOf(pages: readonly PageSpec[]): { items: Map<string, number>; rows: Map<string, number> } {
  const items = new Map<string, number>()
  const rows = new Map<string, number>()
  const up = (m: Map<string, number>, id: string, n: number): void => void m.set(id, Math.max(m.get(id) ?? 0, n))
  for (const page of pages) {
    const all = [
      ...Object.values(page.slots as Record<string, Block[] | undefined>),
      ...Object.values(page.states as Record<string, Block[] | undefined>),
    ]
    for (const blocks of all)
      walk(blocks, b => {
        if (b.type !== 'component') return
        const props = b.props as { items?: readonly string[]; table?: { rows: readonly unknown[] } }
        if (props.items) up(items, b.component, props.items.length)
        // Les lignes RÉELLES que le rendu posera (le jeu de démonstration remplace les emplacements).
        if (props.table)
          up(rows, b.component, demoTable(props.table as { columns: TableColumn[]; rows: string[][] }).rows.length)
      })
  }
  return { items, rows }
}

const DEMAND = demandOf(PAGES)

const ITEM = /^item\/(\d+)$/
const ROW = /^row\/(\d+)$/

/** Une copie profonde d'une partie, numérotée `k` (son nom et le numéro final de ses textes d'auteur). */
function renumber(part: Part, from: number, to: number, prefix: 'item' | 'row'): Part {
  const name = part.name === `${prefix}/${from}` ? `${prefix}/${to}` : part.name
  if (part.kind === 'box')
    return { ...part, name, children: part.children.map(c => renumber(c, from, to, prefix)), hidden: part.hidden }
  if (part.kind === 'text') return { ...part, name, value: part.value.replace(new RegExp(` ${from}$`), ` ${to}`) }
  return { ...part, name }
}

function extend(root: BoxPart, pattern: RegExp, prefix: 'item' | 'row', capacity: number): BoxPart {
  const numbered = root.children.filter(c => pattern.test(c.name))
  if (numbered.length === 0)
    return { ...root, children: root.children.map(c => (c.kind === 'box' ? extend(c, pattern, prefix, capacity) : c)) }
  const last = numbered.reduce((a, z) =>
    Number(pattern.exec(z.name)?.[1]) > Number(pattern.exec(a.name)?.[1]) ? z : a,
  )
  const n = Number(pattern.exec(last.name)?.[1])
  if (capacity <= n) return root
  const extra: Part[] = []
  for (let k = n + 1; k <= capacity; k++) extra.push({ ...renumber(last, n, k, prefix), hidden: true })
  const at = root.children.indexOf(last) + 1
  return { ...root, children: [...root.children.slice(0, at), ...extra, ...root.children.slice(at)] }
}

/** L'arbre d'une recette, ses entrées et ses lignes portées à la capacité demandée par le registre. */
export function withCapacity(id: string, root: BoxPart, demand = DEMAND): BoxPart {
  const def = (COMPONENTS as Record<string, { items?: true | number; table?: true }>)[id]
  let out = root
  if (def?.items === true) out = extend(out, ITEM, 'item', demand.items.get(id) ?? 0)
  if (def?.table) out = extend(out, ROW, 'row', demand.rows.get(id) ?? 0)
  return out
}
