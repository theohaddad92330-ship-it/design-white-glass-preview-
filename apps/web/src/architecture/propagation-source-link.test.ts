/**
 * §4.4 — LA MOITIÉ WEB DU LIEN DE SOURCE : chaque `href` de bloc propagé a un
 * LECTEUR côté écran.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE RÉPARE, ET POURQUOI SA JUMELLE API NE SUFFISAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `apps/api/src/architecture/propagation-source-link.spec.ts` vérifie qu'un bloc
 * propagé porte une source, qu'il ne s'édite jamais, et que le filtre du lien
 * existe côté API. Elle était VERTE pendant que la moitié web n'existait pas :
 *
 *  · `apps/web/src/routes/missions/index.tsx` n'avait AUCUN `validateSearch` ;
 *  · `MissionsPage` ne lisait jamais `accountId`.
 *
 * Donc `/missions?accountId=…` ouvrait la liste ENTIÈRE des missions. Par la
 * doctrine de cette garde même : **un lien qui ne montre pas la source ment sur
 * la source** — et c'est PIRE qu'un lien absent, parce que l'utilisateur croit
 * avoir la réponse. Il clique « d'où vient ce chiffre ? », reçoit tout, et
 * repart avec un dénominateur faux.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE EXIGE, EN DEUX TEMPS
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **La ROUTE déclare le paramètre** — un `validateSearch`, et la clé du lien
 *     dedans, écrite comme une clé de schéma zod. Sans lui, TanStack Router
 *     jette le paramètre avant que l'écran le voie.
 *  2. **L'ÉCRAN le LIT, ET S'EN SERT** — la recherche de CETTE route est lue
 *     (`Route.useSearch()` importé de son module, ou `useSearch({ from })`), la
 *     clé est LIÉE à cette lecture, et elle apparaît ailleurs que dans sa
 *     déclaration. Commentaires retirés : une clé citée dans une prose n'est pas
 *     un lecteur. Les trois ensemble, parce que la première version n'exigeait
 *     que l'import et le nom — et restait verte sur un écran qui ne filtrait
 *     plus rien (voir `readsKeyFromRoute`).
 *
 * ⚠️ L'inventaire ne se recopie pas : le nombre de constructeurs de lien est LU
 * dans `propagation.ts`. Le jour où un sixième agrégat arrive avec son `href`,
 * cette garde tombe rouge tant que personne n'a écrit son lecteur — c'est la
 * seule façon qu'elle ne redevienne pas borgne en grandissant.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { missionsOfAccount, missionsOfConsultant, type PropagatedSource } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'

const WEB_SRC = join(__dirname, '..')
const REPO = join(__dirname, '..', '..', '..', '..')
const PROPAGATION_CONTRACT = join(REPO, 'packages', 'contracts', 'src', 'schemas', 'propagation.ts')

/* -------------------------------------------------------------------------- */
/*  Outils                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Retire les commentaires — bloc et ligne — avant toute recherche de clé.
 *
 * Sans ça, la prose d'un fichier suffit à le faire passer pour un lecteur. Six
 * gardes borgnes de ce dépôt sont nées de listes découpées sans retirer les
 * commentaires, et celle-ci en garde la trace : le test « ne compte pas une clé
 * citée dans un commentaire » plus bas casse si on enlève cette fonction.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry) || entry.includes('.test.')) continue
    out.push(full)
  }
  return out
}

/** `/missions?accountId=…` → `{ pathname: '/missions', key: 'accountId' }`. */
function splitSourceHref(href: string): { pathname: string; key: string } {
  const [pathname = '', query = ''] = href.split('?')
  return { pathname, key: query.split('=')[0] ?? '' }
}

/**
 * Le fichier de route qui sert ce chemin, en file-based TanStack.
 *
 * Deux formes existent dans ce dépôt : `routes/missions/index.tsx` et
 * `routes/missions.tsx`. On rend `null` quand aucune n'existe — un chemin sans
 * fichier est un lien qui ne mène nulle part, et le cas est NOMMÉ plutôt que
 * silencieux (le faux zéro d'un chemin inexistant se lit comme un succès).
 */
function routeFileFor(pathname: string): string | null {
  const relative = pathname.replace(/^\//, '')
  for (const candidate of [
    join(WEB_SRC, 'routes', relative, 'index.tsx'),
    join(WEB_SRC, 'routes', `${relative}.tsx`),
  ]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

/**
 * Ce fichier LIT-IL cette clé depuis la recherche de CETTE route ?
 *
 * ⚠️ Trois exigences, et la première version n'en avait qu'une demie — elle
 * demandait « le fichier importe la route » ET « le fichier nomme la clé ».
 * Vérifiée en cassant volontairement `MissionsPage` (`const accountId =
 * undefined` à la place de `Route.useSearch()`), elle est restée VERTE :
 * l'import était toujours là, et le nom de la clé aussi. Une garde borgne de
 * plus, trouvée exactement comme les six précédentes — en la cassant.
 *
 *  1. la recherche est LUE, sur cette route-ci (`Route.useSearch()` importé de
 *     son module, ou `useSearch({ from: '/missions/' })`) ;
 *  2. la clé est LIÉE à cette lecture — dans la déstructuration, ou par un
 *     accès `search.accountId` sur la variable qui la reçoit ;
 *  3. elle SERT ailleurs. Déclarée puis jamais passée, elle ne filtre rien —
 *     c'est la cause racine « paramètre déclaré, jamais passé », déjà payée
 *     ici sur un seul chemin corrigé.
 */
function readsKeyFromRoute(rawSource: string, pathname: string, key: string): boolean {
  const source = withoutComments(rawSource)
  const relative = pathname.replace(/^\//, '')
  const importsRoute = new RegExp(`from '@/routes/${relative}(?:/index)?'`).test(source)
  const reads = new RegExp(
    `(?:const\\s+(\\{[^}]*\\}|\\w+)\\s*=\\s*)?(Route\\.useSearch\\(\\)|useSearch\\(\\s*\\{[^}]*from:\\s*'${pathname}/?'[^}]*\\}\\s*\\))`,
    'g',
  )
  // ⚠️ La regex est RECRÉÉE à chaque appel : avec le drapeau `g`, `.test()` et
  // `matchAll` partagent `lastIndex`, et un appel sur deux rendrait faux.
  for (const match of source.matchAll(reads)) {
    const target = match[1]
    if (target === undefined) continue
    if (match[2]?.startsWith('Route.') && !importsRoute) continue
    const bound = target.startsWith('{')
      ? new RegExp(`\\b${key}\\b`).test(target)
      : new RegExp(`\\b${target}\\??\\.${key}\\b`).test(source)
    if (!bound) continue
    // Lue ne suffit pas : la clé doit SERVIR ailleurs que dans sa déclaration.
    if ((source.match(new RegExp(`\\b${key}\\b`, 'g')) ?? []).length >= 2) return true
  }
  return false
}

type Corpus = {
  /** `null` = aucun fichier de route pour ce chemin. */
  routeFile: string | null
  routeSource: string
  readers: { path: string; source: string }[]
}

/**
 * Ce qui manque pour que ce lien montre vraiment sa source. Tableau vide = rien.
 *
 * PURE, et c'est délibéré : c'est ce qui permet de lui donner un corpus écrit
 * exprès pour prouver qu'elle sait dire NON — une garde qui ne peut être testée
 * qu'avec les vrais fichiers ne se vérifie jamais.
 */
function blindSourceLink(source: PropagatedSource, corpus: Corpus): string[] {
  const { pathname, key } = splitSourceHref(source.href)
  const complaints: string[] = []

  if (corpus.routeFile === null) {
    complaints.push(`${source.href} → aucun fichier de route ne sert « ${pathname} »`)
    return complaints
  }

  const route = withoutComments(corpus.routeSource)
  if (!route.includes('validateSearch')) {
    complaints.push(
      `${source.href} → la route « ${pathname} » n’a pas de validateSearch : TanStack Router jette « ${key} » avant que l’écran le voie, et le lien ouvre la liste ENTIÈRE.`,
    )
  } else if (!new RegExp(`\\b${key}\\s*:\\s*z\\.`).test(route)) {
    complaints.push(
      `${source.href} → la route « ${pathname} » déclare un validateSearch qui ne connaît pas « ${key} ».`,
    )
  }

  const readers = corpus.readers.filter(file => readsKeyFromRoute(file.source, pathname, key))
  if (readers.length === 0) {
    complaints.push(
      `${source.href} → aucun écran ne LIT « ${key} » sur la route « ${pathname} ». Un paramètre déclaré et jamais lu rend la liste entière sous un lien qui promet la source.`,
    )
  }

  return complaints
}

/* -------------------------------------------------------------------------- */
/*  Le corpus RÉEL                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Les liens que les contrats savent construire aujourd'hui.
 *
 * ⚠️ Recopiés à la main ICI, et c'est pour ça que le test « l'inventaire est
 * complet » existe juste en dessous : il relit `propagation.ts` et compte les
 * constructeurs. Un inventaire ne prouve jamais sa propre complétude.
 */
const SOURCES: { name: string; source: PropagatedSource }[] = [
  { name: 'missionsOfAccount', source: missionsOfAccount('11111111-1111-4111-8111-111111111111') },
  { name: 'missionsOfConsultant', source: missionsOfConsultant('22222222-2222-4222-8222-222222222222') },
]

const WEB_FILES = sourceFiles(WEB_SRC).map(path => ({ path, source: readFileSync(path, 'utf8') }))

function corpusFor(source: PropagatedSource): Corpus {
  const { pathname } = splitSourceHref(source.href)
  const routeFile = routeFileFor(pathname)
  return {
    routeFile,
    routeSource: routeFile === null ? '' : readFileSync(routeFile, 'utf8'),
    readers: WEB_FILES,
  }
}

/* -------------------------------------------------------------------------- */
/*  1. La garde LIT quelque chose                                             */
/* -------------------------------------------------------------------------- */

describe('§4.4 web — la garde a un corpus', () => {
  it('balaye des fichiers web réels, en nombre', () => {
    // Le faux zéro silencieux : un chemin qui n'existe pas rend une liste vide,
    // zéro faute, et un test vert pour toujours.
    expect(WEB_FILES.length).toBeGreaterThan(300)
    expect(WEB_FILES.some(file => file.path.endsWith('MissionsPage.tsx'))).toBe(true)
  })

  it('trouve un fichier de route pour CHAQUE lien de source', () => {
    const orphans = SOURCES.filter(({ source }) => routeFileFor(splitSourceHref(source.href).pathname) === null).map(
      entry => entry.name,
    )
    expect(orphans).toEqual([])
  })

  it('l’inventaire est COMPLET — il est recompté sur `propagation.ts`, pas recopié', () => {
    const contract = withoutComments(readFileSync(PROPAGATION_CONTRACT, 'utf8'))
    expect(contract.length).toBeGreaterThan(1000)
    const constructors = [...contract.matchAll(/export function (\w+)\([^)]*\): PropagatedSource/g)].map(
      match => match[1],
    )
    // Deux aujourd'hui. Un sixième agrégat qui arrive avec son `href` fait
    // tomber CE test tant que personne ne l'a couvert ici — c'est la seule
    // façon que la garde ne redevienne pas borgne en grandissant.
    expect(constructors.length).toBeGreaterThan(0)
    expect([...constructors].sort()).toEqual([...SOURCES.map(entry => entry.name)].sort())
  })
})

/* -------------------------------------------------------------------------- */
/*  2. Chaque `href` a un lecteur                                             */
/* -------------------------------------------------------------------------- */

describe('§4.4 web — chaque lien de source a un LECTEUR côté écran', () => {
  for (const { name, source } of SOURCES) {
    it(`${name} — la route déclare le paramètre ET l’écran le lit`, () => {
      expect(blindSourceLink(source, corpusFor(source))).toEqual([])
    })
  }
})

/* -------------------------------------------------------------------------- */
/*  3. La garde sait dire NON                                                 */
/* -------------------------------------------------------------------------- */

const REAL = missionsOfAccount('11111111-1111-4111-8111-111111111111')
const VALID_ROUTE = `
  const missionsSearchSchema = z.object({ accountId: z.string().uuid().optional().catch(undefined) })
  export const Route = createFileRoute('/missions/')({ validateSearch: missionsSearchSchema, component: MissionsPage })
`
const VALID_READER = {
  path: 'src/features/missions/view/MissionsPage.tsx',
  source: `import { Route } from '@/routes/missions/index'
    const { accountId } = Route.useSearch()
    const page = useMissions({ accountId })`,
}

describe('§4.4 web — la garde sait dire NON', () => {
  it('refuse une route SANS validateSearch — le défaut réellement mesuré', () => {
    const complaints = blindSourceLink(REAL, {
      routeFile: 'routes/missions/index.tsx',
      routeSource: `export const Route = createFileRoute('/missions/')({ component: MissionsPage })`,
      readers: [VALID_READER],
    })
    expect(complaints.join('\n')).toContain('validateSearch')
  })

  it('refuse un validateSearch qui ne connaît pas la clé du lien', () => {
    const complaints = blindSourceLink(REAL, {
      routeFile: 'routes/missions/index.tsx',
      routeSource: `const s = z.object({ q: z.string().optional() })
        export const Route = createFileRoute('/missions/')({ validateSearch: s })`,
      readers: [VALID_READER],
    })
    expect(complaints.join('\n')).toContain('ne connaît pas « accountId »')
  })

  it('refuse un paramètre DÉCLARÉ que personne ne lit — le lien ouvre alors la liste entière', () => {
    const complaints = blindSourceLink(REAL, {
      routeFile: 'routes/missions/index.tsx',
      routeSource: VALID_ROUTE,
      readers: [{ path: 'src/features/missions/view/MissionsTable.tsx', source: 'export function MissionsTable() {}' }],
    })
    expect(complaints.join('\n')).toContain('aucun écran ne LIT')
  })

  it('ne compte PAS une clé citée dans un COMMENTAIRE — c’est de la prose, pas un lecteur', () => {
    const complaints = blindSourceLink(REAL, {
      routeFile: 'routes/missions/index.tsx',
      routeSource: VALID_ROUTE,
      readers: [
        {
          path: 'src/features/missions/view/MissionsPage.tsx',
          source: `import { Route } from '@/routes/missions/index'
            /** Un jour on lira accountId ici. */
            // et accountId aussi
            export function MissionsPage() { return null }`,
        },
      ],
    })
    expect(complaints.join('\n')).toContain('aucun écran ne LIT')
  })

  it('ne compte PAS un fichier qui nomme la clé sans lire CETTE route', () => {
    const complaints = blindSourceLink(REAL, {
      routeFile: 'routes/missions/index.tsx',
      routeSource: VALID_ROUTE,
      readers: [{ path: 'src/features/accounts/api.ts', source: 'export const of = (accountId: string) => accountId' }],
    })
    expect(complaints.join('\n')).toContain('aucun écran ne LIT')
  })

  it('ne compte PAS un écran qui IMPORTE la route sans lire sa recherche', () => {
    // ⚠️ LE CAS QUI A FAIT TOMBER LA PREMIÈRE VERSION DE CETTE GARDE. Casser
    // `MissionsPage` en remplaçant `Route.useSearch()` par un `undefined` en dur
    // laissait l'import ET le nom de la clé en place : la garde restait verte
    // sur un écran qui ne filtrait plus rien.
    const complaints = blindSourceLink(REAL, {
      routeFile: 'routes/missions/index.tsx',
      routeSource: VALID_ROUTE,
      readers: [
        {
          path: 'src/features/missions/view/MissionsPage.tsx',
          source: `import { Route } from '@/routes/missions/index'
            const accountId = undefined
            const page = useMissions({ accountId })`,
        },
      ],
    })
    expect(complaints.join('\n')).toContain('aucun écran ne LIT')
  })

  it('ne compte PAS une clé LUE puis jamais passée — déclarée ne filtre rien', () => {
    // Cause racine « paramètre déclaré, jamais passé ».
    const complaints = blindSourceLink(REAL, {
      routeFile: 'routes/missions/index.tsx',
      routeSource: VALID_ROUTE,
      readers: [
        {
          path: 'src/features/missions/view/MissionsPage.tsx',
          source: `import { Route } from '@/routes/missions/index'
            const { accountId } = Route.useSearch()
            const page = useMissions()`,
        },
      ],
    })
    expect(complaints.join('\n')).toContain('aucun écran ne LIT')
  })

  it('ACCEPTE la forme « variable + accès » — `search.accountId`, pas seulement la déstructuration', () => {
    expect(
      blindSourceLink(REAL, {
        routeFile: 'routes/missions/index.tsx',
        routeSource: VALID_ROUTE,
        readers: [
          {
            path: 'src/features/missions/view/MissionsPage.tsx',
            source: `const search = useSearch({ from: '/missions/' })
              const page = useMissions({ accountId: search.accountId })`,
          },
        ],
      }),
    ).toEqual([])
  })

  it('refuse un chemin sans fichier de route', () => {
    const complaints = blindSourceLink(REAL, { routeFile: null, routeSource: '', readers: [VALID_READER] })
    expect(complaints.join('\n')).toContain('aucun fichier de route')
  })

  it('ACCEPTE un corpus complet — une garde qui refuse tout ne protège rien', () => {
    expect(
      blindSourceLink(REAL, {
        routeFile: 'routes/missions/index.tsx',
        routeSource: VALID_ROUTE,
        readers: [VALID_READER],
      }),
    ).toEqual([])
  })
})
