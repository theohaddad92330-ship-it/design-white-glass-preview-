import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import {
  ANALYSIS_CONTEXT_PRESETS,
  analysisContextFields,
  analysisScopeModeSchema,
  knownAccountContextSchema,
  signalContextSchema,
} from '@bellum/contracts'
import { appRouteTarget } from '@/components/navigation/known-routes'
import { splitInternalHref } from '@/lib/internal-href'

/**
 * #1932 / #1933 — CHAQUE DESTINATION QUE LAURA PROPOSE EST UNE ROUTE RÉELLE, ET
 * CHAQUE FILTRE QU'ELLE Y MET EST LU PAR L'ÉCRAN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX DÉFAUTS QU'ELLE EMPÊCHE
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **Le lien mort.** Une route écrite dans `chat_tools.py` que la SPA refuse
 *     (`appRouteTarget` rend `null`) produit une carte en échec, sans erreur —
 *     la liste blanche avale en silence (#1820). Aucune suite ne peut le voir :
 *     les tests Python vérifient la charge utile, les tests web montent les
 *     cartes qu'ils connaissent.
 *  2. **Le filtre fantôme.** Un paramètre que la route ne DÉCLARE pas
 *     (`validateSearch`) est retiré par le routeur ; un paramètre déclaré mais
 *     que l'écran ne LIT pas ne filtre rien. Dans les deux cas, ce que Laura a
 *     annoncé disparaît à l'arrivée — le défaut « déclaré au contrat, posé dans
 *     l'URL, jamais lu » que ce dépôt a déjà payé deux fois.
 *
 * Elle lit TROIS corpus réels : le service IA (`DEEP_LINK_SCREENS` et toutes les
 * routes littérales), l'arbre généré du routeur, et les fichiers de route et
 * d'écran. Elle prouve qu'elle LIT (corpus non vides), qu'elle sait dire NON
 * (sources synthétiques), et qu'elle n'attrape pas ce qu'elle ne vise pas (une
 * route hors catalogue n'est pas contrôlée sur ses paramètres).
 */

const WEB_SRC = join(__dirname, '..')
const REPO_ROOT = join(WEB_SRC, '..', '..', '..')
const CHAT_TOOLS = join(REPO_ROOT, 'apps', 'ia', 'app', 'services', 'chat_tools.py')
const SAMPLE_ID = 'a800466a-4194-4394-bd74-8d15a52df24f'

type CatalogueEntry = { route: string; params: string[] }

function deepLinkCatalogue(python: string): CatalogueEntry[] {
  const block = python.split('DEEP_LINK_SCREENS: tuple')[1]?.split('\n)\n')[0] ?? ''
  return [...block.matchAll(/"route":\s*"([^"]+)",\s*"params":\s*\(([^)]*)\)/g)].map(match => ({
    route: match[1] as string,
    params: [...(match[2] as string).matchAll(/"([A-Za-z_]+)"/g)].map(param => param[1] as string),
  }))
}

/** Toutes les routes LITTÉRALES que le service IA peut mettre dans une carte. */
function emittedRoutes(python: string): string[] {
  return [...new Set([...python.matchAll(/"route":\s*"(\/[^"]*)"/g)].map(match => match[1] as string))]
}

function normalise(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}

/** `:id` (catalogue Python) ↔ `$id` (routeur) — la même place d'identifiant. */
function asRouterPath(route: string): string {
  return route.replace(/:id\b/g, '$id')
}

function declaredRoutes(): Set<string> {
  const source = readFileSync(join(WEB_SRC, 'routeTree.gen.ts'), 'utf8')
  const start = source.indexOf('export interface FileRoutesByFullPath {')
  const block = source.slice(start, source.indexOf('}', start))
  return new Set([...block.matchAll(/^\s*'([^']+)':/gm)].map(match => normalise(match[1] as string)))
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return filesUnder(full)
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}

type RouteFile = { file: string; id: string; source: string }

function routeFiles(): RouteFile[] {
  return filesUnder(join(WEB_SRC, 'routes')).flatMap(file => {
    const source = readFileSync(file, 'utf8')
    const id = source.match(/createFileRoute\('([^']+)'\)/)?.[1]
    return id ? [{ file, id, source }] : []
  })
}

/** Le fichier de route qui porte ce chemin (`/consultants/$id_/reverse-market` → `/consultants/$id/reverse-market`). */
function routeFileFor(path: string, files: readonly RouteFile[]): RouteFile | undefined {
  return files.find(route => normalise(route.id.replace(/\$([A-Za-z]+)_/g, '$$$1')) === path)
}

/** Les clés que `validateSearch` DÉCLARE — celles du premier `z.object({…})` du fichier. */
function declaredSearchKeys(source: string): string[] {
  if (!source.includes('validateSearch')) return []
  const at = source.indexOf('z.object({')
  if (at === -1) return []
  const open = source.indexOf('{', at)
  let depth = 0
  let end = open
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    if (source[i] === '}') {
      depth -= 1
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  const body = source
    .slice(open + 1, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
  return [...body.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)].map(match => match[1] as string)
}

/**
 * #2162.27 / épopée #2892 — les clés que le contrat `analysisContextFromSearch`
 * (`@bellum/contracts`) lit dans un lien `/search` : `preset`, `context`, et
 * chaque champ de chaque preset structuré, lus sur le SCHÉMA (jamais recopiés).
 */
const SEARCH_CONTRACT_KEYS: ReadonlySet<string> = new Set([
  'preset',
  'context',
  ...ANALYSIS_CONTEXT_PRESETS.filter(preset => preset !== 'free').flatMap(preset => analysisContextFields(preset)),
])

/** L'écran LIT-il ce paramètre ? `search.q`, ou une déstructuration `{ q: … }` / `{ q, … }`. */
function readsParam(source: string, param: string): boolean {
  if (/analysisContextFromSearch\(\s*search/.test(source) && SEARCH_CONTRACT_KEYS.has(param)) return true
  return new RegExp(`(search\\.${param}\\b|[{,]\\s*${param}\\s*[:,}])`).test(source)
}

/** Les fichiers qui lisent la recherche de CETTE route : `useSearch({ from: '<id>' })` ou `Route.useSearch()` importé. */
function readersOf(route: RouteFile): string[] {
  const modulePath = `@/${relative(WEB_SRC, route.file).replace(/\.tsx?$/, '')}`
  const candidates = [...filesUnder(join(WEB_SRC, 'features')), route.file]
  return candidates
    .map(file => readFileSync(file, 'utf8'))
    .filter(
      source =>
        source.includes('useSearch') &&
        (source.includes(`'${route.id}'`) || source.includes(`'${modulePath}'`) || source === route.source),
    )
}

describe('les liens profonds de Laura', () => {
  const python = readFileSync(CHAT_TOOLS, 'utf8')
  const catalogue = deepLinkCatalogue(python)
  const declared = declaredRoutes()
  const files = routeFiles()

  it('LIT trois corpus non vides — sinon elle ne garde rien', () => {
    expect(catalogue.length).toBeGreaterThanOrEqual(4)
    expect(emittedRoutes(python).length).toBeGreaterThanOrEqual(20)
    expect(declared.size).toBeGreaterThan(40)
    expect(files.length).toBeGreaterThan(40)
  })

  it('toute route littérale du service IA est ACCEPTÉE par la SPA — aucune carte ne meurt en silence', () => {
    const refused = emittedRoutes(python)
      .map(route => route.replace(/:id\b/g, SAMPLE_ID))
      .filter(route => appRouteTarget(route) === null)
    expect(`routes que la SPA refuse → ${refused.join(', ')}`).toBe('routes que la SPA refuse → ')
  })

  it('chaque écran du catalogue EXISTE dans le routeur', () => {
    const missing = catalogue.map(entry => asRouterPath(entry.route)).filter(path => !declared.has(path))
    expect(`écrans absents du routeur → ${missing.join(', ')}`).toBe('écrans absents du routeur → ')
  })

  it('chaque filtre du catalogue est DÉCLARÉ par la route et LU par l’écran', () => {
    const faults: string[] = []
    for (const entry of catalogue) {
      const route = routeFileFor(asRouterPath(entry.route), files)
      if (!route) {
        faults.push(`${entry.route} : fichier de route introuvable`)
        continue
      }
      const keys = declaredSearchKeys(route.source)
      const readers = readersOf(route)
      for (const param of entry.params) {
        if (!keys.includes(param)) faults.push(`${entry.route} ?${param} : non déclaré par validateSearch`)
        else if (!readers.some(source => readsParam(source, param))) faults.push(`${entry.route} ?${param} : jamais lu`)
      }
    }
    expect(faults).toEqual([])
  })

  it('#1933.6 — `/actions/sequences` est nommable, et le catalogue ne lui prête AUCUN filtre qu’il ne lit pas', () => {
    expect(appRouteTarget('/actions/sequences')).toBe('/actions/sequences')
    const sequences = catalogue.find(entry => entry.route === '/actions/sequences')
    expect(sequences?.params).toEqual([])
    const route = routeFileFor('/actions/sequences', files)
    expect(route && declaredSearchKeys(route.source)).toEqual([])
  })
})

describe('la garde sait dire NON, et n’attrape pas ce qu’elle ne vise pas', () => {
  it('un paramètre non déclaré par la route est vu', () => {
    const source = 'validateSearch: schema\nconst schema = z.object({\n  q: z.string().optional(),\n})'
    expect(declaredSearchKeys(source)).toEqual(['q'])
    expect(declaredSearchKeys(source)).not.toContain('skill')
  })

  it('une route sans validateSearch ne déclare rien — même si un z.object traîne ailleurs', () => {
    expect(declaredSearchKeys('const other = z.object({ q: z.string() })')).toEqual([])
  })

  it('un paramètre déclaré mais jamais lu est vu', () => {
    const reader = 'const { q: seeded } = Route.useSearch()'
    expect(readsParam(reader, 'q')).toBe(true)
    expect(readsParam(reader, 'new')).toBe(false)
    expect(readsParam('const x = search.company', 'company')).toBe(true)
    expect(readsParam('const x = search.companyName', 'company')).toBe(false)
  })

  it('#2162.27 — un champ de preset n’est « lu » que via le contrat, et seulement s’il en est un', () => {
    const reader = 'const ctx = analysisContextFromSearch(searchParams)'
    expect(readsParam(reader, 'offer')).toBe(true)
    expect(readsParam(reader, 'preset')).toBe(true)
    expect(readsParam(reader, 'budget')).toBe(false)
    expect(readsParam('const ctx = toInitialContext(searchParams.context)', 'offer')).toBe(false)
  })

  it('le catalogue se lit dans la forme exacte du fichier Python', () => {
    const python =
      'DEEP_LINK_SCREENS: tuple[dict] = (\n    {\n        "route": "/a/:id/b",\n        "params": ("q", "new"),\n    },\n    {\n        "route": "/c",\n        "params": (),\n    },\n)\n'
    expect(deepLinkCatalogue(python)).toEqual([
      { route: '/a/:id/b', params: ['q', 'new'] },
      { route: '/c', params: [] },
    ])
  })
})

/**
 * #2162.27 / épopée #2892 — LE MIROIR PYTHON DU PRESET DE `/search` NE DIVERGE PAS.
 *
 * `chat_tools.py` vérifie un lien `/search?preset=…` AVANT de le proposer
 * (`_search_preset_refusal`) avec trois tables recopiées du contrat TypeScript :
 * les champs de chaque preset, les valeurs fermées, les périmètres. Un champ
 * ajouté au schéma sans elles serait refusé à Laura ; une valeur retirée du
 * schéma serait proposée puis jetée à l'arrivée. Cette garde relit les deux.
 */
function pythonTable(python: string, name: string): Record<string, string[]> {
  const block = python.split(`${name}: dict[str, tuple[str, ...]] = {`)[1]?.split('\n}\n')[0] ?? ''
  return Object.fromEntries(
    [...block.matchAll(/"([A-Za-z-]+)":\s*\(([^)]*)\)/g)].map(match => [
      match[1] as string,
      [...(match[2] as string).matchAll(/"([^"]+)"/g)].map(value => value[1] as string),
    ]),
  )
}

function pythonTuple(python: string, name: string): string[] {
  const block = python.split(`${name}: tuple[str, ...] = (`)[1]?.split(')')[0] ?? ''
  return [...block.matchAll(/"([^"]+)"/g)].map(value => value[1] as string)
}

function contractPresetFields(): Record<string, string[]> {
  return Object.fromEntries(
    ANALYSIS_CONTEXT_PRESETS.filter(preset => preset !== 'free').map(preset => [preset, analysisContextFields(preset)]),
  )
}

describe('le preset de /search — miroir Python du contrat (#2162.27)', () => {
  const python = readFileSync(CHAT_TOOLS, 'utf8')

  it('LIT les trois tables — sinon elle ne garde rien', () => {
    expect(Object.keys(pythonTable(python, 'SEARCH_PRESET_FIELDS')).length).toBeGreaterThanOrEqual(6)
    expect(Object.keys(pythonTable(python, 'SEARCH_PRESET_CHOICES')).length).toBeGreaterThanOrEqual(2)
    expect(pythonTuple(python, 'SEARCH_SCOPES').length).toBeGreaterThanOrEqual(5)
  })

  it('les champs de chaque preset sont ceux du schéma, dans son ordre', () => {
    expect(pythonTable(python, 'SEARCH_PRESET_FIELDS')).toEqual(contractPresetFields())
  })

  it('les valeurs fermées et les périmètres sont ceux du schéma', () => {
    expect(pythonTable(python, 'SEARCH_PRESET_CHOICES')).toEqual({
      commercialStatus: [...knownAccountContextSchema.shape.commercialStatus.unwrap().options],
      signalType: [...signalContextSchema.shape.signalType.unwrap().options],
    })
    expect(pythonTuple(python, 'SEARCH_SCOPES')).toEqual([...analysisScopeModeSchema.options])
  })

  it('sait dire NON — un champ oublié côté Python se voit', () => {
    const broken = python.replace('"offer", "pricing", ', '"pricing", ')
    expect(broken).not.toBe(python)
    expect(pythonTable(broken, 'SEARCH_PRESET_FIELDS')).not.toEqual(contractPresetFields())
  })
})

/**
 * #1903.7 / #1903.16 / #1933.1 — LE VÉHICULE : CE QUE LAURA MET DANS LE LIEN ARRIVE-T-IL ?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE TROU ENTRE DEUX GARDES VERTES, ET LA PHRASE QUI L'A CREUSÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce que ce fichier prouve au-dessus : l'écran DÉCLARE le filtre
 * (`validateSearch`) et le LIT. Ce que `PendingActions.test.tsx` prouve : un
 * clic appelle `navigate`. Entre les deux vivait le TRANSPORT, que personne ne
 * mesurait — et c'est le seul maillon que les deux bouts se supposent l'un
 * l'autre.
 *
 * Il n'était pas seulement non mesuré, il était DÉCRIT DEUX FOIS EN SENS
 * CONTRAIRE, dans le même dépôt :
 *  - `chat_tools.py` (`prepare_consultant_record`) écrit
 *    `/consultants?new=true&name=…` et affirme en commentaire que la forme est
 *    « vérifiée empiriquement contre le routeur réel » ;
 *  - `notification-link.ts` écrivait l'inverse — une requête laissée dans `to`
 *    « ne serait jamais lue par le routeur ».
 * Aucun test ne pouvait départager : le seul qui regarde MOQUE `useNavigate`,
 * donc il relit la charge remise au routeur, jamais ce que le routeur en fait.
 *
 * MESURÉ ICI, sur un vrai routeur (`createRouter` + `createMemoryHistory`, zéro
 * doublure) : **le routeur LIT la requête laissée dans `to`**. Elle reste collée
 * au pathname pendant la construction de la destination, mais elle ressort dans
 * le `href` poussé à l'historique, que la couche d'historique redécoupe —
 * pathname, recherche analysée par `parseSearch` (donc `new=true` en BOOLÉEN et
 * `name=Claire+Dubois` en TEXTE, espace compris), et ancre. Mesuré aussi depuis
 * un écran qui portait DÉJÀ des filtres : ceux de l'écran quitté ne suivent pas.
 * La phrase de `notification-link.ts` était fausse ; elle est corrigée dans le
 * même lot.
 *
 * ⚠️ C'est un comportement de DÉPENDANCE, pas une loi de la nature : une montée
 * de version de TanStack Router peut le retirer, et personne ne le verrait — la
 * carte s'ouvrirait sur un écran vide, exactement comme si le filtre n'avait
 * jamais été écrit. C'est la raison d'être de cette garde : elle est le seul
 * endroit du dépôt qui interroge le routeur RÉEL sur ce point.
 *
 * Et c'est arrivé : la montée 1.168.23 → 1.170.46 (30/10/2026) a rougi cette
 * garde. Le véhicule, lui, était intact — c'est la façon de le MESURER sur un
 * routeur jamais monté qui a changé. Voir le commentaire de `follow` : la
 * distinction entre « le lien ne transporte plus rien » et « le banc d'essai ne
 * sait plus lire » est ce qui décide d'un repli de version ou d'une garde
 * corrigée.
 *
 * Elle ne remonte pas l'application : un routeur minuscule, une route par écran
 * du catalogue Python, `validateSearch` en identité. La conformité de ces routes
 * aux écrans réels est le travail des tests au-dessus — ici on mesure le
 * véhicule, qui est le même pour toutes les destinations.
 */
describe('le véhicule d’un lien profond de Laura (#1903.7)', () => {
  const catalogue = deepLinkCatalogue(readFileSync(CHAT_TOOLS, 'utf8'))

  /** Le chemin RÉEL d'un écran du catalogue : `:id` remplacé par un identifiant. */
  function landingPath(route: string): string {
    return route.replace(/:id\b/g, SAMPLE_ID)
  }

  /** Un routeur minuscule qui porte exactement les écrans du catalogue. */
  function transportRouter() {
    const root = createRootRoute({ component: () => null })
    const home = createRoute({ getParentRoute: () => root, path: '/dashboard', component: () => null })
    const screens = catalogue.map(entry =>
      createRoute({
        getParentRoute: () => root,
        path: asRouterPath(entry.route),
        validateSearch: (search: Record<string, unknown>) => search,
        component: () => null,
      }),
    )
    return createRouter({
      routeTree: root.addChildren([home, ...screens]),
      history: createMemoryHistory({ initialEntries: ['/dashboard'] }),
    })
  }

  /**
   * Le trajet de PRODUCTION : la route validée par la SPA, puis ce que
   * `navigate({ to })` enchaîne — `buildLocation` construit le `href`, la couche
   * d'historique le redécoupe en pathname + recherche analysée.
   *
   * ⚠️ On n'appelle PAS `router.navigate()` ici, et ce n'est pas un détail de
   * confort : depuis TanStack Router 1.170, un routeur JAMAIS MONTÉ ne commite
   * plus sa navigation — `router.state.location` reste l'entrée initiale.
   * Mesuré le 30/10/2026 sur 1.170.46, les trois formes rendent `/dashboard` et
   * une recherche vide : `navigate` + `invalidate`, `load()` avant ET après, et
   * `to` + `search` séparés. Ce qui n'a PAS changé, mesuré en même temps : le
   * `href` que `buildLocation` rend porte toujours la requête laissée dans `to`,
   * et l'historique la rend toujours en recherche analysée — donc le véhicule
   * tient, c'est l'effet de bord sur l'état qui exige désormais un rendu.
   * Les deux appels que voici sont exactement ceux que `navigate` enchaîne.
   */
  async function follow(link: string) {
    const target = appRouteTarget(link)
    if (!target) return null
    const router = transportRouter()
    // #4868.4 — le MÊME découpeur que le clic de production (`InternalLink` → `splitInternalHref`).
    router.history.push(router.buildLocation(splitInternalHref(target) as never).href)
    await router.load()
    return router.state.location
  }

  it('LIT un corpus non vide — des écrans qui portent vraiment des filtres', () => {
    expect(catalogue.filter(entry => entry.params.length > 0).length).toBeGreaterThanOrEqual(2)
  })

  it('chaque filtre du catalogue ARRIVE à l’écran visé, avec sa valeur intacte', async () => {
    const faults: string[] = []
    for (const entry of catalogue) {
      if (entry.params.length === 0) continue
      const query = entry.params.map(param => `${param}=valeur-${param}`).join('&')
      const arrived = await follow(`${landingPath(entry.route)}?${query}`)
      if (!arrived) {
        faults.push(`${entry.route} : refusée par la SPA avant même de partir`)
        continue
      }
      if (arrived.pathname !== landingPath(entry.route))
        faults.push(`${entry.route} : atterrit sur ${arrived.pathname}`)
      const search = arrived.search as Record<string, unknown>
      for (const param of entry.params) {
        if (search[param] !== `valeur-${param}`)
          faults.push(`${entry.route} ?${param} : perdu en route (${JSON.stringify(search)})`)
      }
    }
    expect(faults).toEqual([])
  })

  it('#1903.16 — le nom DICTÉ arrive en texte, et `new` en booléen', async () => {
    // La forme exacte que `chat_tools.py` écrit (`urlencode`) : `+` pour
    // l'espace, pourcentage pour les accents.
    const arrived = await follow('/consultants?new=true&name=Ana+L%C3%A9vy')
    expect(arrived?.pathname).toBe('/consultants')
    expect(arrived?.search).toMatchObject({ new: true, name: 'Ana Lévy' })
  })

  it('n’attrape pas ce qu’elle ne vise pas — un filtre absent du lien n’apparaît pas', async () => {
    const arrived = await follow('/consultants?new=true')
    expect(arrived?.search).toMatchObject({ new: true })
    expect(arrived?.search).not.toHaveProperty('name')
  })

  it('une destination refusée par la SPA ne part pas — la garde d’avant tient toujours', async () => {
    expect(await follow('//ailleurs.example?new=true')).toBeNull()
    expect(await follow('/decouvrir?q=java')).toBeNull()
  })
})
