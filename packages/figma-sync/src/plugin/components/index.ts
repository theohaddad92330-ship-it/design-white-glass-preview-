import iconsJson from '../../../generated/icons.json'
import { COMPONENTS } from '../../spec/catalog'
import { append, box, ensurePage, findOnPage, type Scene, text } from '../scene'
import {
  buildComponent,
  buildIcons,
  buildOrder,
  combinations,
  emptyRegistry,
  familyPage,
  ICON_PAGE,
  type Registry,
} from './engine'
import { FAMILIES, type Family, type Part, type Recipe } from './recipe'
import { ACTIONS } from './recipes/actions'
import { CHARTS } from './recipes/charts'
import { CONTROLS } from './recipes/controls'
import { DATA } from './recipes/data'
import { FEEDBACK } from './recipes/feedback'
import { FORMS } from './recipes/forms'
import { IDENTITY } from './recipes/identity'
import { NAVIGATION } from './recipes/navigation'
import { SURFACES } from './recipes/surfaces'

type ComponentId = keyof typeof COMPONENTS

/**
 * Toutes les recettes — UNE par composant du catalogue. `satisfies` fait
 * échouer la compilation si un composant du contrat n'a pas de recette (ou si
 * une recette n'est pas au contrat).
 */
export const RECIPES = {
  ...ACTIONS,
  ...FORMS,
  ...NAVIGATION,
  ...DATA,
  ...CHARTS,
  ...CONTROLS,
  ...IDENTITY,
  ...SURFACES,
  ...FEEDBACK,
} satisfies Record<ComponentId, Recipe>

const recipes: Readonly<Record<string, Recipe>> = RECIPES
const axesOf = (id: string): Readonly<Record<string, readonly string[]>> =>
  (COMPONENTS as Record<string, { variants: Readonly<Record<string, readonly string[]>> }>)[id]?.variants ?? {}

export const familyOf = (id: string): Family => recipes[id]?.family ?? 'Données'

/** Toutes les icônes lucide que les recettes dessinent (toutes variantes confondues) — la liste que `extract` lit. */
export function iconsUsed(): string[] {
  const out = new Set<string>()
  const visit = (p: Part): void => {
    if (p.kind === 'icon') out.add(p.icon)
    if (p.kind === 'box') p.children.forEach(visit)
  }
  for (const [id, r] of Object.entries(recipes)) for (const combo of combinations(axesOf(id))) visit(r.draw(combo))
  return [...out].sort()
}

interface ComponentsReport {
  components: number
  sets: number
  variants: number
  icons: number
  missing: string[]
}

/** Construit les icônes puis chaque composant sur la page de sa famille ; la page « Components » sert d'index. */
export async function drawComponents(s: Scene): Promise<{ reg: Registry; report: ComponentsReport }> {
  const reg = emptyRegistry()
  const pages = new Map<Family, PageNode>()
  for (const f of FAMILIES) {
    const page = ensurePage(s.api, familyPage(f))
    await page.loadAsync()
    pages.set(f, page)
  }
  buildIcons(s, pages.get(ICON_PAGE) as PageNode, iconsJson as Readonly<Record<string, string>>, reg)

  const cursor = new Map<Family, number>()
  const report: ComponentsReport = { components: 0, sets: 0, variants: 0, icons: reg.icons.size, missing: [] }
  for (const id of buildOrder(recipes)) {
    const recipe = recipes[id] as Recipe
    const page = pages.get(recipe.family) as PageNode
    const y = cursor.get(recipe.family) ?? 0
    const r = await buildComponent(s, page, id as ComponentId, recipe, reg, { x: 0, y })
    cursor.set(recipe.family, y + r.height + 120)
    report.components++
    report.sets += r.sets
    report.variants += r.variants
    report.missing.push(...[...r.missing].map(m => `${id} : ${m}`))
  }
  const index = s.api.root.children.find(p => p.name === 'Components')
  if (index) await drawIndex(s, index, report)
  return { reg, report }
}

async function drawIndex(s: Scene, page: PageNode, report: ComponentsReport): Promise<void> {
  await page.loadAsync()
  findOnPage<FrameNode>(page, 'Index des composants', 'FRAME')?.remove()
  const f = box(s, 'Index des composants', {
    direction: 'column',
    gap: 12,
    padX: 32,
    padY: 32,
    fill: 'surface/1',
    stroke: 'border/default',
    radius: 'lg',
    align: 'start',
    width: 720,
  })
  page.appendChild(f)
  append(f, await text(s, 'title', 'Composants', { style: 'title' }))
  f.appendChild(
    await text(
      s,
      'count',
      `${report.components} composants · ${report.variants} variantes · ${report.icons} icônes — construits depuis le code (packages/ui, coque de l’app).`,
      { style: 'body', maxChars: 70 },
    ),
  )
  for (const fam of FAMILIES) {
    const ids = Object.entries(recipes)
      .filter(([, r]) => r.family === fam)
      .map(([id]) => id)
    append(f, await text(s, `family/${fam}`, `${familyPage(fam)} — ${ids.join(', ')}`, { style: 'body', maxChars: 70 }))
  }
}
