import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { format, resolveConfig } from 'prettier'
import { beforeAll, describe, expect, it } from 'vitest'

import iconsJson from '../../generated/icons.json'
import { extractIcons } from '../extract/icons'
import { REPO_ROOT } from '../extract/tokens'
import type { TokenSet } from '../extract/types'
import tokensJson from '../../generated/tokens.json'
import { COMPONENTS, TEMPLATES, WIDTHS } from '../spec/catalog'
import { accountsPage } from '../spec/pages/app/accounts'
import { PAGES } from '../spec/pages'
import type { PageSpec } from '../spec/types'
import { validatePages } from '../spec/validate'
import { buildComponents, buildPages, buildTemplates, type BuildContext } from './builders'
import { iconsUsed, RECIPES } from './components'
import { chunksOf, combinations, MAX_VARIANTS_PER_SET } from './components/engine'
import { createFakeFigma, createMemoryLog } from './fake-figma'
import { createFakeScene, descendants, type FakeNode } from './fake-scene'
import { overflows } from './layout-probe'
import { FIGMA_PAGES } from './pages'
import { frameName, pageWidths } from './pages/render'
import { templateSetName } from './templates/layout'
import { renderGabaritsDoc } from './templates/rules'
import { upsertPages } from './upsert'
import { syncVariables, type VariableIndex } from './variables'

const tokens = tokensJson as unknown as TokenSet

async function setup() {
  const vars = createFakeFigma()
  const variables: VariableIndex = await syncVariables(vars.api, tokens, createMemoryLog())
  const scene = createFakeScene()
  upsertPages(scene.api as never, FIGMA_PAGES)
  const log = createMemoryLog()
  const ctx: BuildContext = { tokens, variables, log, draw: scene.api }
  return { ctx, scene, log, variableIds: new Set(vars.variables.map(v => v.id)) }
}

type Env = Awaited<ReturnType<typeof setup>>

async function syncAll(env: Env): Promise<void> {
  await buildComponents(env.ctx)
  await buildTemplates(env.ctx)
  await buildPages(env.ctx, 'app', [accountsPage])
}

const page = (env: Env, name: string): FakeNode => {
  const p = env.scene.pages.find(x => x.name === name)
  if (!p) throw new Error(`page ${name} absente`)
  return p
}
const all = (env: Env): FakeNode[] => env.scene.pages.flatMap(descendants)

describe('composants — exhaustivité', () => {
  it('chaque composant du catalogue a une recette, et rien de plus', () => {
    expect(Object.keys(RECIPES).sort()).toEqual(Object.keys(COMPONENTS).sort())
  })

  it('une matrice de plus de 30 variantes est découpée (Button : 9 jeux de 30)', () => {
    for (const [id, def] of Object.entries(COMPONENTS)) {
      for (const chunk of chunksOf(id, def.variants))
        expect(combinations(chunk.axes).length).toBeLessThanOrEqual(MAX_VARIANTS_PER_SET)
    }
    expect(chunksOf('Button', COMPONENTS.Button.variants)).toHaveLength(9)
  })

  it('construit chaque composant avec TOUTES ses variantes, sur la page de sa famille', async () => {
    const env = await setup()
    await buildComponents(env.ctx)
    for (const [id, def] of Object.entries(COMPONENTS)) {
      const family = RECIPES[id as keyof typeof RECIPES].family
      const p = page(env, `Components — ${family}`)
      const expected = combinations(def.variants).length
      const built = chunksOf(id, def.variants)
        .map(c => p.children.find(n => n.name === c.name))
        .reduce((n, node) => n + (node ? (node.type === 'COMPONENT_SET' ? node.children.length : 1) : 0), 0)
      expect(built, id).toBe(expected)
    }
    expect(env.log.lines.filter(l => l.level === 'error')).toEqual([])
  })

  it('la bulle d’aide reste sombre dans les deux thèmes : mode Dark explicite, pas une couleur en dur', async () => {
    const env = await setup()
    await buildComponents(env.ctx)
    const tip = page(env, 'Components — Retours').children.find(n => n.name === 'Tooltip') as FakeNode
    expect(Object.values(tip.explicitMode as Record<string, string>)).toEqual([env.ctx.variables?.color.dark])
  })

  it('les variantes sont rangées en grille, pas empilées en 0,0', async () => {
    const env = await setup()
    await buildComponents(env.ctx)
    const set = page(env, 'Components — Actions').children.find(n => n.name === 'Button / variant=default') as FakeNode
    const positions = new Set(set.children.map(c => `${c.x},${c.y}`))
    expect(positions.size).toBe(set.children.length)
  })

  it('description = quand l’utiliser + chemin source ; propriétés TEXT / INSTANCE_SWAP, jamais une variante par icône', async () => {
    const env = await setup()
    await buildComponents(env.ctx)
    const set = page(env, 'Components — Actions').children.find(n => n.name === 'Button / variant=default') as FakeNode
    expect(set.description).toContain('Source : packages/ui/src/components/button.tsx')
    const types = Object.entries(set.componentPropertyDefinitions).map(([k, d]) => `${k.split('#')[0]}:${d.type}`)
    expect(types).toEqual(expect.arrayContaining(['label:TEXT', 'icon:INSTANCE_SWAP', 'show icon:BOOLEAN']))
    const icons = page(env, 'Components — Identité').children.filter(n => n.name.startsWith('Icon / '))
    expect(icons.every(n => n.type === 'COMPONENT')).toBe(true)
    expect(icons.map(n => n.name.slice(7)).sort()).toEqual(iconsUsed())
  })
})

describe('aucune couleur sans variable', () => {
  let env: Env
  beforeAll(async () => {
    env = await setup()
    await syncAll(env)
  }, 60_000)

  it('tout fond et tout trait posé est LIÉ à une variable existante', () => {
    const unbound: string[] = []
    for (const n of all(env)) {
      for (const field of ['fills', 'strokes'] as const) {
        for (const p of (n[field] ?? []) as (Paint & { boundVariables?: { color?: { id: string } } })[]) {
          const id = p.boundVariables?.color?.id
          if (p.type === 'SOLID' && !(id && env.variableIds.has(id))) unbound.push(`${n.name} (${n.type}).${field}`)
        }
      }
    }
    expect(unbound).toEqual([])
  })

  // Défaut L (25/09/2026) : Button `default` vu NOIR sur la page des composants, violet dans les pages.
  // La couleur de base d'une peinture liée est ce que Figma montre quand la liaison ne se résout pas :
  // elle vaut la valeur claire de la variable, jamais un noir par défaut.
  it('Button variant=default : fond primary/500 (#5b3ee8 de button.tsx), couleur de base = la valeur de la variable', () => {
    const set = descendants(page(env, 'Components — Actions')).find(n => n.name === 'Button / variant=default')
    const main = set?.children.find(c => c.name.includes('size=default') && c.name.includes('state=default'))
    const fill = (main?.fills ?? [])[0] as (SolidPaint & { boundVariables?: { color?: { id: string } } }) | undefined
    const primary = env.ctx.variables?.byName.get('primary/500') as { id: string } | undefined
    expect(fill?.boundVariables?.color?.id).toBe(primary?.id)
    const hex = (c: RGB | undefined): string =>
      `#${[c?.r, c?.g, c?.b]
        .map(x =>
          Math.round((x ?? 0) * 255)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')}`
    expect(hex(fill?.color)).toBe('#5b3ee8')
  })

  // Défaut G (25/09/2026) : « Demander à Laura… » indenté sous le titre. Le code pose le lien de texte
  // avec `h-auto p-0` : aligné sur le texte, à hauteur de ligne, à toutes les tailles.
  it('Button variant=link : aucune marge intérieure ni hauteur fixe, aligné sur le texte voisin', () => {
    for (const size of COMPONENTS.Button.variants.size.filter(x => x !== 'icon')) {
      const style = RECIPES.Button.draw({ variant: 'link', size, state: 'default' }).style
      expect([size, style.padX ?? 0, style.height]).toEqual([size, 0, undefined])
    }
  })

  it('aucun rayon de 8 ou 12 px brut : rounded-md / rounded-xl sont des variables Radius', () => {
    const raw = all(env)
      .filter(n => n.type !== 'TEXT' && [8, 12].includes(Number(n.topLeftRadius)) && !n.boundVariables.topLeftRadius)
      .map(n => `${n.name} (${n.topLeftRadius})`)
    expect(raw).toEqual([])
  })

  it('les ombres Tailwind (shadow-sm/md/lg) sont des styles d’effet posés, pas des notes', async () => {
    const menu = descendants(page(env, 'Components — Actions')).find(n => n.name === 'content') as FakeNode
    expect(menu.effectStyleId).toBeTruthy()
  })

  it('aucune erreur au journal (couleur inconnue, composant ou icône manquants)', () => {
    expect(env.log.lines.filter(l => l.level === 'error').map(l => l.text)).toEqual([])
  })
})

describe('idempotence', () => {
  it('deux synchronisations complètes donnent le même nombre de nœuds', { timeout: 60_000 }, async () => {
    const env = await setup()
    await syncAll(env)
    const first = all(env).length
    const pages = env.scene.pages.length
    await syncAll(env)
    expect(all(env).length).toBe(first)
    expect(env.scene.pages.length).toBe(pages)
  })
})

describe('gabarits', () => {
  let env: Env
  beforeAll(async () => {
    env = await setup()
    await buildComponents(env.ctx)
    await buildTemplates(env.ctx)
  }, 60_000)

  it('les 9 gabarits × leurs états × les 16 largeurs, en instances des composants', () => {
    const p = page(env, 'Templates')
    for (const [id, def] of Object.entries(TEMPLATES)) {
      const optional: readonly string[] = 'optionalStates' in def ? def.optionalStates : []
      for (const state of ['default', ...def.states, ...optional]) {
        const set = p.children.find(n => n.name === templateSetName(id, state as 'default'))
        expect(set?.type, `${id} ${state}`).toBe('COMPONENT_SET')
        expect(set?.children.map(c => c.name)).toEqual(WIDTHS.map(w => `width=${w}`))
      }
      expect(p.children.some(n => n.name === `Règles — ${id}`)).toBe(true)
    }
  })

  it('coque : Sidebar à ≥ 768 (réduite sous 1024), MobileTabBar à 4 onglets sous 768', () => {
    const set = page(env, 'Templates').children.find(n => n.name === templateSetName('list')) as FakeNode
    const at = (w: number) => set.children.find(c => c.name === `width=${w}`) as FakeNode
    const kid = (w: number, name: string) => descendants(at(w)).find(n => n.type === 'INSTANCE' && n.name === name)
    expect(kid(1440, 'Sidebar')?.mainComponent?.name).toBe('variant=sidebar, state=expanded')
    expect(kid(768, 'Sidebar')?.mainComponent?.name).toBe('variant=sidebar, state=collapsed')
    expect(kid(390, 'Sidebar')).toBeUndefined()
    expect(kid(390, 'MobileTabBar')).toBeDefined()
    expect(kid(844, 'MobileTabBar')).toBeUndefined()
  })

  it('chaque slot du contrat est un cadre nommé, dans chaque gabarit', () => {
    for (const [id, def] of Object.entries(TEMPLATES)) {
      const set = page(env, 'Templates').children.find(n => n.name === templateSetName(id)) as FakeNode
      const names = new Set(descendants(set.children[0] as FakeNode).map(n => n.name))
      for (const slot of def.slots) expect(names.has(slot), `${id}.${slot}`).toBe(true)
    }
  })

  it('les états remplacent `primary` par EmptyState / Skeleton / GenericProblemMessage', () => {
    const p = page(env, 'Templates')
    const primary = (state: string) => {
      const set = p.children.find(n => n.name === templateSetName('list', state as 'default')) as FakeNode
      return descendants(set.children[0] as FakeNode).find(n => n.name === 'primary') as FakeNode
    }
    expect(primary('empty').children.map(c => c.name)).toEqual(['EmptyState'])
    expect(primary('loading').children.map(c => c.name)).toEqual(['Skeleton'])
    expect(primary('error').children.map(c => c.name)).toEqual(['GenericProblemMessage'])
  })

  it('settings : la navigation de section et les groupes côte à côte dès 1280, l’aside dessous tant que la place manque', () => {
    const set = page(env, 'Templates').children.find(n => n.name === templateSetName('settings')) as FakeNode
    const at = (w: number) => set.children.find(c => c.name === `width=${w}`) as FakeNode
    const content = (w: number) => descendants(at(w)).find(n => n.name === 'content') as FakeNode
    const primary = descendants(at(1280)).find(n => n.name === 'primary') as FakeNode
    // Le contenu ne s'arrête plus à 720 px (la navigation passait toujours AU-DESSUS des groupes) :
    // ce sont les GROUPES qui s'arrêtent à 720.
    expect(content(1280).maxWidth).toBeGreaterThan(720)
    expect(primary.maxWidth).toBe(720)
    expect(descendants(at(1440)).some(n => n.name === 'aside')).toBe(true)
  })

  it('≥ 2560 : maître-détail dans list et admin-table, jamais en dessous', () => {
    const set = page(env, 'Templates').children.find(n => n.name === templateSetName('list')) as FakeNode
    const has = (w: number) =>
      descendants(set.children.find(c => c.name === `width=${w}`) as FakeNode).some(n => n.name === 'preview')
    expect(has(2560)).toBe(true)
    expect(has(3440)).toBe(true)
    expect(has(1920)).toBe(false)
  })

  it('aucun enfant ne déborde de son parent, aux 16 largeurs, dans les 9 gabarits', () => {
    const problems: string[] = []
    for (const n of page(env, 'Templates').children.filter(c => c.type === 'COMPONENT_SET')) {
      for (const variant of n.children) problems.push(...overflows(variant).map(p => `${n.name} ${p}`))
    }
    expect(problems).toEqual([])
  })
})

describe('pages — la page exemple app/accounts', () => {
  let env: Env
  beforeAll(async () => {
    env = await setup()
    await syncAll(env)
  }, 60_000)

  it('un cadre par largeur par défaut (1440, 1920, 2560, 1280, 1024, 768, 390, 360) et par état, sur « App — Comptes »', () => {
    // RUX-49 (docs/revue-ux.md T3.0) : 1024 rejoint les largeurs par défaut de l'app, et une
    // page `list` (comme app/accounts) dessine aussi 768 par défaut. RUX-14 : app/accounts
    // déclare aussi l'état facultatif `emptyFiltered`.
    const p = page(env, 'App — Comptes')
    const expected = ['default', 'empty', 'loading', 'error', 'emptyFiltered'].flatMap(st =>
      [1440, 1920, 2560, 1280, 1024, 768, 390, 360].map(w => frameName('app/accounts', w, st as 'default')),
    )
    expect(p.children.map(n => n.name)).toEqual(expected)
    expect(pageWidths(accountsPage)).toEqual([1440, 1920, 2560, 1280, 1024, 768, 390, 360])
  })

  it('les slots sont remplis par les blocs de la spec ; l’état remplace `primary`', () => {
    const p = page(env, 'App — Comptes')
    const frame = p.children.find(n => n.name === 'app/accounts · 1440') as FakeNode
    const texts = descendants(frame)
      .filter(n => n.type === 'TEXT')
      .map(n => n.characters)
    expect(texts).toEqual(
      expect.arrayContaining(['Ton portefeuille de comptes', 'Compte', 'Score /10', 'Société Générale', 'Mes favoris']),
    )
    const empty = p.children.find(n => n.name === 'app/accounts · 1440 · empty') as FakeNode
    const primary = descendants(empty).find(n => n.name === 'primary') as FakeNode
    expect(descendants(primary).map(n => n.characters)).toContain('Aucun compte analysé pour l’instant')
  })

  it('tableau : 6 colonnes en bureau, 2 visibles sous 768 (masquées, pas supprimées)', () => {
    const p = page(env, 'App — Comptes')
    const visibleHead = (name: string) => {
      const frame = p.children.find(n => n.name === name) as FakeNode
      const head = descendants(frame).find(n => n.name === 'head') as FakeNode
      return head.children.filter(c => c.visible).length
    }
    expect(visibleHead('app/accounts · 1440')).toBe(6)
    expect(visibleHead('app/accounts · 390')).toBe(2)
  })

  it('RUX-15 : sous 768, ce sont « Compte » (title) et « Prochaine action » (meta) qui restent visibles — pas les 2 premières par position', () => {
    const frame = page(env, 'App — Comptes').children.find(n => n.name === 'app/accounts · 390') as FakeNode
    const head = descendants(frame).find(n => n.name === 'head') as FakeNode
    const visibleLabels = head.children
      .filter(c => c.visible)
      .map(c => descendants(c).find(n => n.type === 'TEXT')?.characters)
    expect(visibleLabels).toEqual(['Compte', 'Prochaine action'])
  })

  it('mobile : cibles tactiles ≥ 44 px sur les boutons', () => {
    const frame = page(env, 'App — Comptes').children.find(n => n.name === 'app/accounts · 390') as FakeNode
    const buttons = descendants(frame).filter(n => n.type === 'INSTANCE' && n.name === 'Button')
    expect(buttons.length).toBeGreaterThan(0)
    for (const b of buttons) {
      if (String(b.mainComponent?.parent?.name).includes('variant=link')) continue
      expect(b.minHeight).toBeGreaterThanOrEqual(44)
    }
  })

  it('aucun débordement à 360 et à 1280', () => {
    const p = page(env, 'App — Comptes')
    for (const w of [360, 1280])
      expect(overflows(p.children.find(n => n.name === `app/accounts · ${w}`) as FakeNode)).toEqual([])
  })

  it('« Rules (UX) » agrège les notes, groupées par page, avec leur source fichier:ligne', () => {
    const f = page(env, 'Rules (UX)').children.find(n => n.name === 'UX — app/accounts') as FakeNode
    const texts = descendants(f)
      .filter(n => n.type === 'TEXT')
      .map(n => n.characters)
    for (const note of accountsPage.uxNotes) expect(texts).toEqual(expect.arrayContaining([note.text, note.source]))
  })
})

/** Une page d'essai qui pose TOUS les composants de données — ce que les lots de pages citeront. */
const DATA_IDS = [
  'KpiTile',
  'Stat',
  'Delta',
  'Sparkline',
  'BarChart',
  'StackedBar',
  'WaterfallChart',
  'Donut',
  'Heatmap',
  'CohortGrid',
  'SegmentBar',
  'Gantt',
] as const
const dataShowcase = {
  id: 'app/vitrine-donnees',
  surface: 'app',
  domain: 'vitrine',
  route: 'apps/web/src/routes/pilotage/index.tsx',
  title: 'Vitrine des données',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [{ type: 'text', text: 'Vitrine', style: 'title' }],
    kpis: [
      {
        type: 'grid',
        columns: 4,
        gap: '4',
        children: [
          { type: 'component', component: 'KpiTile', props: { content: { label: 'MRR', value: '12 400 €' } } },
          { type: 'component', component: 'KpiTile', props: { state: 'unmeasured', delta: 'unknown' } },
        ],
      },
    ],
    primary: DATA_IDS.map(id => ({ type: 'component', component: id, props: {} })),
  },
  states: {
    empty: [{ type: 'component', component: 'EmptyState', props: {} }],
    loading: [{ type: 'component', component: 'Skeleton', props: {} }],
    error: [{ type: 'component', component: 'GenericProblemMessage', props: {} }],
  },
  uxNotes: [],
} as unknown as PageSpec

describe('composants de données — KPI, graphes, planning', () => {
  let env: Env
  beforeAll(async () => {
    env = await setup()
    await buildComponents(env.ctx)
    await buildTemplates(env.ctx)
    await buildPages(env.ctx, 'app', [dataShowcase])
  }, 60_000)

  it('la vitrine est une spec valide', () => {
    expect(validatePages([dataShowcase])).toEqual([])
  })

  it('« non mesuré » n’est jamais 0 : KpiTile sans valeur rend « — », un delta inconnu « non mesuré »', () => {
    const set = (name: string) =>
      page(env, 'Components — Données').children.find(n => n.name === name) as FakeNode | undefined
    const kpi = set('KpiTile') as FakeNode
    const variant = kpi.children.find(c => c.name === 'state=unmeasured, delta=unknown') as FakeNode
    const texts = descendants(variant)
      .filter(n => n.type === 'TEXT' && n.visible)
      .map(n => n.characters)
    expect(texts).toEqual(expect.arrayContaining(['—', 'non mesuré']))
    expect(texts.some(s => /^0\b|^0 ?%/.test(s))).toBe(false)
  })

  it('libellés lisibles : aucun texte de graphe sous 12 px (GA-31), aucune probabilité', () => {
    for (const id of DATA_IDS) {
      const p = page(env, 'Components — Données')
      const nodes = p.children.filter(n => n.name === id || n.name.startsWith(`${id} / `)).flatMap(descendants)
      expect(nodes.length, id).toBeGreaterThan(0)
      const small = nodes.filter(n => n.type === 'TEXT' && !n.textStyleId && Number(n.fontSize ?? 14) < 12)
      expect(
        small.map(n => `${id}/${n.name}`),
        id,
      ).toEqual([])
      expect(nodes.some(n => n.type === 'TEXT' && /probabilit|chance de/i.test(n.characters))).toBe(false)
    }
  })

  it('aucun débordement à 360, 390 et 1440 : les graphes s’étirent, la frise défile dans son cadre', () => {
    const p = page(env, 'App — Vitrine')
    for (const w of [360, 390, 1440]) {
      const frame = p.children.find(n => n.name === `app/vitrine-donnees · ${w}`) as FakeNode
      expect(overflows(frame), String(w)).toEqual([])
    }
  })
})

describe('contrôles — RadioGroup, Stepper, BrailleLoader, SearchEmptyState', () => {
  let env: Env
  beforeAll(async () => {
    env = await setup()
    await buildComponents(env.ctx)
  }, 60_000)
  const set = (family: string, name: string) =>
    page(env, `Components — ${family}`).children.find(n => n.name === name) as FakeNode

  it('SearchEmptyState porte titre, description, icône et action comme le composant réel (plus de `query`)', () => {
    const props = Object.entries(set('Retours', 'SearchEmptyState').componentPropertyDefinitions).map(
      ([k, d]) => `${k.split('#')[0]}:${d.type}`,
    )
    expect(props).toEqual(
      expect.arrayContaining([
        'title:TEXT',
        'description:TEXT',
        'action:TEXT',
        'show action:BOOLEAN',
        'icon:INSTANCE_SWAP',
      ]),
    )
    expect(props.some(p => p.startsWith('query:'))).toBe(false)
  })

  it('RadioGroup : chaque option est une cible de 44 px (GA-30)', () => {
    const options = descendants(set('Formulaires', 'RadioGroup')).filter(n => /^item\/\d+$/.test(n.name))
    expect(options.length).toBeGreaterThan(0)
    for (const o of options) expect(o.minHeight).toBeGreaterThanOrEqual(44)
  })

  it('Stepper : deux orientations, les étapes faites portent une coche, pas une couleur seule', () => {
    const s = set('Navigation', 'Stepper')
    expect(s.children.map(c => c.name).sort()).toEqual(['orientation=horizontal', 'orientation=vertical'])
    const first = descendants(s.children[0] as FakeNode).find(n => n.name === 'item/1') as FakeNode
    expect(descendants(first).some(n => n.name === 'icon' || n.mainComponent?.name === 'Icon / check')).toBe(true)
  })

  it('BrailleLoader : une variante par animation du code', () => {
    expect(set('Retours', 'BrailleLoader').children).toHaveLength(17)
  })
})

describe('débordements — corrigés dans les composants', () => {
  let env: Env
  beforeAll(async () => {
    env = await setup()
    await buildComponents(env.ctx)
  }, 60_000)
  const sets = (family: string, name: string) =>
    page(env, `Components — ${family}`).children.filter(n => n.name === name || n.name.startsWith(`${name} / `))

  it('TabNav et Table défilent en largeur dans leur cadre, comme `overflow-x-auto` du code', () => {
    for (const [family, name] of [
      ['Navigation', 'TabNav'],
      ['Données', 'Table'],
      ['Navigation', 'ModeTabs'],
      ['Navigation', 'TabBar'],
    ] as const) {
      const variants = sets(family, name).flatMap(s => (s.type === 'COMPONENT_SET' ? s.children : [s]))
      expect(variants.length, name).toBeGreaterThan(0)
      for (const v of variants) expect(v.overflowDirection, `${name} ${v.name}`).toBe('HORIZONTAL')
    }
  })

  it('UserCell, titre de Card / SectionCard, valeur de CopyField : coupés « … » (1 ou 2 lignes)', () => {
    const lines = (family: string, name: string, text: string) => {
      const n = descendants(sets(family, name)[0] as FakeNode).find(x => x.type === 'TEXT' && x.name === text)
      return n?.textTruncation === 'ENDING' ? n.maxLines : null
    }
    expect(lines('Identité', 'UserCell', 'name')).toBe(1)
    expect(lines('Identité', 'UserCell', 'subtitle')).toBe(1)
    expect(lines('Surfaces', 'Card', 'title')).toBe(1)
    expect(lines('Surfaces', 'Card', 'description')).toBe(2)
    expect(lines('Surfaces', 'SectionCard', 'title')).toBe(1)
    expect(lines('Actions', 'CopyField', 'value')).toBe(1)
  })
})

describe('cibles tactiles — 44 px en pointeur grossier, visible inchangé (GA-30/32)', () => {
  let env: Env
  beforeAll(async () => {
    env = await setup()
    await buildComponents(env.ctx)
  }, 60_000)

  it('Checkbox (case 16 px) et PasswordField (œil 28 px) : zone de 44 × 44 centrée, hors flux, la partie visible ne bouge pas', () => {
    for (const [name, control, size] of [
      ['Checkbox', 'box', 16],
      ['PasswordField', 'toggle', 28],
    ] as const) {
      const set = page(env, 'Components — Formulaires').children.find(n => n.name === name) as FakeNode
      for (const variant of set.children) {
        const visible = descendants(variant).find(n => n.name === control) as FakeNode
        expect([visible.width, visible.height], `${name} ${variant.name}`).toEqual([size, size])
        const hit = visible.children.find(c => c.name === 'touch-target') as FakeNode
        expect([hit.width, hit.height]).toEqual([44, 44])
        expect(hit.layoutPositioning).toBe('ABSOLUTE')
        expect([hit.x, hit.y]).toEqual([(size - 44) / 2, (size - 44) / 2])
        expect(hit.fills).toEqual([])
      }
      const props = Object.keys(set.componentPropertyDefinitions).map(k => k.split('#')[0])
      expect(props).toContain('zone tactile')
    }
  })
})

describe('pages — tout le registre', () => {
  let env: Env
  // Un `setTimeout` posé AVANT la construction ne peut s'exécuter QUE si la construction rend la main
  // à la boucle d'événements en cours de route (`yieldToHost`, `../scene.ts`) : sans elle, toute la
  // chaîne d'`await` ne consomme que des micro-tâches et tourne d'un bloc jusqu'à sa résolution — le
  // minuteur ne se déclenche qu'ENSUITE, trop tard pour ce test (et trop tard pour le worker vitest ou
  // l'UI du plugin, qu'un registre complet bloque alors pendant toute sa durée).
  let buildDone = false
  let timerFiredBeforeBuildDone = false
  beforeAll(async () => {
    env = await setup()
    const timerFired = new Promise<void>(resolve => {
      setTimeout(() => {
        timerFiredBeforeBuildDone = !buildDone
        resolve()
      }, 0)
    })
    await buildComponents(env.ctx)
    await buildTemplates(env.ctx)
    for (const surface of ['app', 'site', 'dm'] as const) await buildPages(env.ctx, surface, PAGES)
    buildDone = true
    await timerFired
  }, 180_000)

  it('rend la main à la boucle d’événements pendant la construction (un minuteur posé avant s’exécute avant la fin)', () => {
    expect(timerFiredBeforeBuildDone).toBe(true)
  })

  it('validatePages(PAGES) : aucune spec invalide, aucun identifiant en double', () => {
    expect(validatePages(PAGES)).toEqual([])
  })

  it('aucune erreur au journal en construisant toutes les pages du registre', () => {
    expect(env.log.lines.filter(l => l.level === 'error')).toEqual([])
  })

  /*
   * Plus AUCUNE dette de débordement (la liste KNOWN_OVERFLOW comptait 41 pages) : corrigés dans
   * les COMPOSANTS, jamais dans les specs — TabNav / Table défilent dans leur cadre comme le code
   * (`overflow-x-auto`), ModeTabs / TabBar aussi (décision UX), UserCell / Card / SectionCard /
   * CopyField se coupent « … », DataRow / InfoLine passent à la ligne, un Bouton ou un Tableau
   * dans une colonne latérale prend toute la largeur / 2 colonnes. Une page qui déborde est donc
   * une RÉGRESSION : pas d'allowlist à compléter.
   */
  it(
    'aucun enfant ne déborde, à la largeur par défaut de chaque page du registre (aucune exception)',
    { timeout: 60_000 },
    () => {
      const problems: string[] = []
      const pageNames = env.scene.pages
        .map(p => p.name)
        .filter(n => n === 'Site' || n.startsWith('App — ') || n.startsWith('DM — '))
      for (const name of pageNames) {
        for (const frame of page(env, name).children) {
          problems.push(...overflows(frame).map(p => `${name}/${p}`))
        }
      }
      expect(problems).toEqual([])
    },
  )
})

describe('fichiers générés à jour', () => {
  it('generated/icons.json = les tracés lucide des icônes que les recettes dessinent', () => {
    expect(iconsJson).toEqual(extractIcons(iconsUsed()))
  })

  it('docs/gabarits.md = renderGabaritsDoc() (relancer `extract` sinon)', async () => {
    const file = resolve(REPO_ROOT, 'packages/figma-sync/docs/gabarits.md')
    const options = (await resolveConfig(file)) ?? {}
    expect(readFileSync(file, 'utf8')).toBe(await format(renderGabaritsDoc(), { ...options, filepath: file }))
  })
})
