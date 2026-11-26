import { describe, expect, it } from 'vitest'

import {
  changelogReaders,
  ciGuardTests,
  decideCiSelection,
  foundationReason,
  generatedListSpecs,
  isAlwaysRunTest,
  planChangedRuns,
  selectorLegacy,
  shardFiles,
  summaryLine,
} from '../../../../tools/ci/test-changed.mjs'
import config from '../../vitest.config'

/**
 * `pnpm test:changed` (racine) : ne lancer que les tests qui concernent les
 * fichiers modifiés depuis `origin/main`. Ce qui se décide ICI, c'est quel
 * paquet lancer et, pour l'IA, quels fichiers pytest — la sélection fine du
 * web et de l'API est laissée à vitest `--changed` et jest `--changedSince`,
 * qui suivent le graphe d'imports.
 */
const IA_TESTS = [
  'apps/ia/tests/test_scoring.py',
  'apps/ia/tests/test_scoring_axes.py',
  'apps/ia/tests/test_router.py',
  'apps/ia/tests/contracts/test_envelope.py',
]
const noSource = (): string => ''

describe('pnpm test:changed — ce qui est lancé', () => {
  it('rien de modifié : rien ne tourne', () => {
    expect(planChangedRuns([], IA_TESTS, noSource)).toEqual({
      web: [],
      contracts: [],
      api: false,
      ia: [],
      notRunLocally: [],
    })
  })

  it('une page web modifiée : seulement le web', () => {
    const plan = planChangedRuns(['apps/web/src/features/chat/view/Chat.tsx'], IA_TESTS, noSource)
    expect(plan).toEqual({
      web: ['apps/web/src/features/chat/view/Chat.tsx'],
      contracts: [],
      api: false,
      ia: [],
      notRunLocally: [],
    })
  })

  it('un contrat partagé modifié : contracts, web ET api (ses deux consommateurs)', () => {
    const file = 'packages/contracts/src/schemas/account.ts'
    const plan = planChangedRuns([file], IA_TESTS, noSource)
    expect(plan).toEqual({ web: [file], contracts: [file], api: true, ia: [], notRunLocally: [] })
  })

  it('un module IA modifié : ses tests par nom, et ceux qui l’importent', () => {
    const source = (file: string): string =>
      file === 'apps/ia/tests/test_router.py' ? 'from app.services.scoring import score' : ''
    const plan = planChangedRuns(['apps/ia/app/services/scoring.py'], IA_TESTS, source)
    expect(plan.ia).toEqual([
      'apps/ia/tests/test_router.py',
      'apps/ia/tests/test_scoring.py',
      'apps/ia/tests/test_scoring_axes.py',
    ])
    expect(plan.web.length + plan.contracts.length).toBe(0)
    expect(plan.api).toBe(false)
  })

  it('un test IA modifié se lance lui-même', () => {
    const plan = planChangedRuns(['apps/ia/tests/contracts/test_envelope.py'], IA_TESTS, noSource)
    expect(plan.ia).toEqual(['apps/ia/tests/contracts/test_envelope.py'])
  })

  it('un prompt ou un golden modifié : TOUTE la suite IA', () => {
    for (const file of [
      'apps/ia/app/prompts/brief.md',
      'apps/ia/tests/golden/case_1.json',
      'apps/ia/evals/golden/x.yaml',
      'apps/ia/conftest.py',
      'apps/ia/requirements.txt',
    ]) {
      expect(planChangedRuns([file], IA_TESTS, noSource).ia, file).toBe('all')
    }
  })

  /**
   * vitest relance TOUT dès qu'un fichier de `forceRerunTriggers` (package.json,
   * config vite/vitest) figure parmi les fichiers modifiés — c'est-à-dire la
   * suite web entière en local, ce qui appartient à la CI. Ces fichiers ne
   * sont donc pas passés à vitest, et le script les NOMME au lieu de les taire.
   */
  it('un package.json ou une config vitest modifiés ne lancent PAS la suite entière en local', () => {
    const plan = planChangedRuns(
      ['package.json', 'apps/web/vitest.config.ts', 'apps/web/src/lib/api.ts'],
      IA_TESTS,
      noSource,
    )
    expect(plan.web).toEqual(['apps/web/src/lib/api.ts'])
    expect(plan.notRunLocally).toEqual(['apps/web/vitest.config.ts', 'package.json'])
  })

  it('un outil du dépôt modifié : les tests web qui le gardent', () => {
    const plan = planChangedRuns(['tools/ci/shard-by-duration.mjs'], IA_TESTS, noSource)
    expect(plan.web).toEqual(['tools/ci/shard-by-duration.mjs'])
  })

  it('un test IA supprimé n’est pas relancé', () => {
    const plan = planChangedRuns(['apps/ia/tests/test_disparu.py'], IA_TESTS, noSource)
    expect(plan.ia).toEqual([])
  })
})

/**
 * `ci` : sur une PR, `Test (Web)` et `Test (API)` ne lancent que les tests liés
 * au diff — plus les gardes qui LISENT le dépôt sans l'importer. Une fondation
 * touchée, un calcul en échec, le label `ci:suite-complete` ou plus de la moitié
 * des tests sélectionnés : repli sur la suite COMPLÈTE, raison au journal.
 */
const ALL_WEB = Array.from({ length: 100 }, (_, i) => `apps/web/src/features/f${i}/f${i}.test.ts`)
const base = {
  suite: 'web' as const,
  allTests: ALL_WEB,
  alwaysRun: [] as string[],
  labels: [] as string[],
  planError: null as string | null,
}

describe('ci — fondations qui forcent la suite complète', () => {
  it.each([
    'pnpm-lock.yaml',
    'package.json',
    'turbo.json',
    'pnpm-workspace.yaml',
    'packages/shared/src/a.ts',
    'apps/web/vitest.config.ts',
    'apps/api/jest.config.js',
    'vite.config.ts',
    'apps/web/src/test/setup.ts',
    'apps/web/src/test/projects.ts',
    'apps/api/test/jest-e2e.json',
    'apps/web/tsconfig.json',
    'tsconfig.base.json',
  ])('%s est une fondation', file => {
    expect(foundationReason([file])).toMatch(/fondation/)
  })

  it('la garde sait dire NON : un composant, une page, un service API ne sont pas des fondations', () => {
    expect(foundationReason(['apps/web/src/features/chat/view/Chat.tsx'])).toBeNull()
    expect(foundationReason(['apps/api/src/modules/accounts/accounts.service.ts', 'docs/x.md'])).toBeNull()
    expect(foundationReason(['apps/web/src/lib/vite-helpers.ts'])).toBeNull()
  })
})

describe('ci — le changelog n’est pas une fondation', () => {
  const ENTRIES = 'packages/contracts/src/changelog/entries.ts'
  const readers = [
    'apps/web/src/features/changelog/changelog-entries.test.ts',
    'apps/api/src/modules/changelog-newsletter/changelog-newsletter.service.spec.ts',
  ]
  const other = 'apps/web/src/features/chat/Chat.test.tsx'
  const sources: Record<string, string> = { [other]: "import { render } from 'x'" }

  it('une entrée de changelog ne rejoue pas toute la suite', () => {
    expect(foundationReason([ENTRIES, 'packages/contracts/src/changelog/labels.fr.ts'])).toBeNull()
  })

  it('le reste de contracts n’est plus une fondation non plus : le graphe d’imports le suit (lot A, 31/10)', () => {
    expect(foundationReason(['packages/contracts/src/schemas/brand.ts'])).toBeNull()
    expect(foundationReason([ENTRIES, 'packages/contracts/src/index.ts'])).toBeNull()
    expect(foundationReason(['packages/contracts/package.json'])).toBeNull()
  })

  it('les lecteurs du changelog sont sélectionnés, pas les autres', () => {
    const all = [...readers, other, 'apps/web/src/lib/uses-ids.test.ts']
    const read = (f: string): string => (f.endsWith('uses-ids.test.ts') ? 'x LATEST_CHANGELOG_ID' : (sources[f] ?? ''))
    expect(changelogReaders([ENTRIES], all, read)).toEqual([...readers, 'apps/web/src/lib/uses-ids.test.ts'])
    expect(changelogReaders(['apps/web/src/a.ts'], all, read)).toEqual([])
  })
})

describe('ci — tests toujours lancés', () => {
  const noSource = (): string => ''
  it('les gardes d’architecture web et API, demo-coverage', () => {
    expect(isAlwaysRunTest('apps/web/src/architecture/GA-1.test.ts', noSource)).toBe(true)
    expect(isAlwaysRunTest('apps/api/src/architecture/x.spec.ts', noSource)).toBe(true)
    expect(isAlwaysRunTest('apps/api/src/modules/demo/demo-coverage.spec.ts', noSource)).toBe(true)
  })

  it.each(['readFileSync', 'readdirSync', 'globSync', "from 'fs/promises'", "from 'node:fs'"])(
    'une spec qui lit le dépôt (%s) est toujours lancée',
    marker => {
      expect(isAlwaysRunTest('apps/web/src/lib/x.test.ts', () => `import x ${marker}`)).toBe(true)
    },
  )

  it('la garde sait dire NON : un test ordinaire n’est pas toujours lancé', () => {
    expect(isAlwaysRunTest('apps/web/src/features/chat/Chat.test.tsx', () => "import { render } from 'x'")).toBe(false)
  })
})

describe('ci — décision', () => {
  const related = (n: number): string[] => ALL_WEB.slice(0, n)

  it('un diff qui ne touche qu’un composant : mode CONCERNÉS, pas complet', () => {
    const plan = decideCiSelection({
      ...base,
      changed: ['apps/web/src/features/f1/F1.tsx'],
      relatedTests: related(3),
      alwaysRun: [ALL_WEB[90]],
    })
    expect(plan.mode).toBe('concernes')
    expect(plan.files).toEqual([...related(3), ALL_WEB[90]].sort())
    expect(summaryLine(plan)).toBe('tests concernés : 4 fichiers sur 100 (mode : concernés)')
  })

  it('les gardes toujours lancées s’ajoutent sans doublon à la sélection', () => {
    const guard = ALL_WEB[0]
    const plan = decideCiSelection({
      ...base,
      changed: ['apps/web/src/a.ts'],
      relatedTests: related(2),
      alwaysRun: [guard],
    })
    expect(plan.files.filter(f => f === guard)).toHaveLength(1)
  })

  it('une fondation touchée : suite complète, raison nommée', () => {
    const plan = decideCiSelection({ ...base, changed: ['turbo.json'], relatedTests: [] })
    expect(plan.mode).toBe('complet')
    expect(plan.reason).toMatch(/fondation.*turbo\.json/)
    expect(plan.files).toEqual(ALL_WEB)
    expect(summaryLine(plan)).toMatch(/^tests concernés : 100 fichiers sur 100 \(mode : complet — fondation/)
  })

  it('le calcul du plan échoue : suite complète', () => {
    const plan = decideCiSelection({ ...base, changed: [], relatedTests: [], planError: 'git diff illisible' })
    expect(plan.mode).toBe('complet')
    expect(plan.reason).toMatch(/échoué.*git diff illisible/)
  })

  it('le label ci:suite-complete : suite complète', () => {
    const plan = decideCiSelection({
      ...base,
      changed: ['apps/web/src/a.ts'],
      relatedTests: related(1),
      labels: ['ci:suite-complete'],
    })
    expect(plan.mode).toBe('complet')
    expect(plan.reason).toMatch(/ci:suite-complete/)
  })

  it('un autre label ne change rien', () => {
    const plan = decideCiSelection({
      ...base,
      changed: ['apps/web/src/a.ts'],
      relatedTests: related(1),
      labels: ['bug'],
    })
    expect(plan.mode).toBe('concernes')
  })

  it('seuil : 50 % exactement reste en concernés, au-delà bascule en complet', () => {
    const at = decideCiSelection({ ...base, changed: ['apps/web/src/a.ts'], relatedTests: related(50) })
    expect(at.mode).toBe('concernes')
    const over = decideCiSelection({ ...base, changed: ['apps/web/src/a.ts'], relatedTests: related(51) })
    expect(over.mode).toBe('complet')
    expect(over.reason).toMatch(/51 .* 100/)
  })

  it('le seuil compte les gardes toujours lancées', () => {
    const plan = decideCiSelection({
      ...base,
      changed: ['apps/web/src/a.ts'],
      relatedTests: related(30),
      alwaysRun: ALL_WEB.slice(30, 60),
    })
    expect(plan.mode).toBe('complet')
  })

  it('rien de lié au diff : seules les gardes tournent (mode concernés)', () => {
    const plan = decideCiSelection({ ...base, changed: ['docs/x.md'], relatedTests: [], alwaysRun: [ALL_WEB[5]] })
    expect(plan).toMatchObject({ mode: 'concernes', files: [ALL_WEB[5]] })
  })
})

describe('ci — répartition en shards', () => {
  const files = Array.from({ length: 10 }, (_, i) => `t${i}.test.ts`)
  it('l’union des shards est exactement la liste, sans doublon', () => {
    const parts = [1, 2, 3, 4].map(i => shardFiles(files, i, 4))
    expect(parts.flat().sort()).toEqual(files)
  })
  it('un shard sans fichier est vide, pas une erreur', () => {
    expect(shardFiles(['a.test.ts'], 3, 4)).toEqual([])
  })
})

/**
 * Lot A (31/10/2026) — diffs RÉELS qui forçaient la suite complète (59 journaux, 7 j) : la liste générée des
 * specs `node` (40 bascules), les tests de `packages/contracts`, un workflow sans rapport avec les tests.
 */
describe('ci — diffs réels qui ne doivent plus tout rejouer', () => {
  const ALL = [
    ...ALL_WEB,
    'apps/web/src/test/jobs-sans-succes.test.ts',
    'apps/web/src/test/ci-shards.test.ts',
    'apps/web/src/test/test-changed.test.ts',
    'apps/web/src/test/autre.test.ts',
  ]
  const decide = (changed: string[], relatedTests: string[] = []) =>
    decideCiSelection({ ...base, allTests: ALL, changed, relatedTests })

  it.each([
    'apps/web/src/test/tests-node.generated.ts',
    'packages/contracts/src/x.test.ts',
    'packages/contracts/src/schemas/y.ts',
    'packages/contracts/src/index.ts',
    'packages/contracts/package.json',
    '.github/workflows/eval-nightly.yml',
    '.github/workflows/ci.yml',
    'apps/web/src/test/jobs-sans-succes.test.ts',
    'apps/web/src/test/setup.test.ts',
  ])('%s : pas une fondation', file => {
    expect(foundationReason([file])).toBeNull()
    expect(decide([file]).mode).toBe('concernes')
  })

  it('la garde sait dire NON : lockfile, package.json racine, setup de test restent des fondations', () => {
    for (const file of ['pnpm-lock.yaml', 'package.json', 'apps/web/src/test/setup.ts', 'turbo.json']) {
      expect(decide([file]).mode, file).toBe('complet')
    }
  })

  it('un diff de contracts sélectionne les specs liées par le graphe (mode concernés)', () => {
    const importing = [ALL_WEB[3], ALL_WEB[7]]
    const plan = decide(['packages/contracts/src/schemas/y.ts'], importing)
    expect(plan.mode).toBe('concernes')
    expect(plan.files).toEqual([...importing].sort())
  })

  it('un diff .github / tools/ci sélectionne explicitement les gardes de CI', () => {
    const all = ALL
    expect(ciGuardTests(['.github/workflows/ci.yml'], all).sort()).toEqual([
      'apps/web/src/test/ci-shards.test.ts',
      'apps/web/src/test/jobs-sans-succes.test.ts',
      'apps/web/src/test/test-changed.test.ts',
    ])
    expect(ciGuardTests(['tools/ci/test-changed.mjs'], all)).toHaveLength(3)
    expect(ciGuardTests(['apps/web/src/a.ts'], all)).toEqual([])
  })

  it('la liste générée : seules les specs ajoutées / retirées sont sélectionnées', () => {
    const diff = ["+  'src/features/f1/f1.test.ts',", "-  'src/features/f2/f2.test.ts',", ' contexte'].join('\n')
    expect(generatedListSpecs(diff, ALL)).toEqual([
      'apps/web/src/features/f1/f1.test.ts',
      'apps/web/src/features/f2/f2.test.ts',
    ])
    expect(generatedListSpecs('', ALL)).toEqual([])
  })
})

describe('vitest web — les paquets @bellum/* se lisent depuis src/ (le sélecteur marche sans build)', () => {
  it.each(['contracts', 'errors', 'utils'])('@bellum/%s est aliasé vers packages/%s/src/index.ts', name => {
    const aliases = (config.resolve?.alias ?? []) as { find: RegExp | string; replacement: string }[]
    const hit = aliases.find(a => a.find instanceof RegExp && a.find.test(`@bellum/${name}`))
    expect(hit?.replacement.endsWith(`packages/${name}/src/index.ts`)).toBe(true)
  })
  it('la garde sait dire NON : un sous-chemin ou un autre scope ne sont pas aliasés', () => {
    const aliases = (config.resolve?.alias ?? []) as { find: RegExp | string; replacement: string }[]
    expect(aliases.some(a => a.find instanceof RegExp && a.find.test('@bellum/contracts/changelog'))).toBe(false)
    expect(aliases.some(a => a.find instanceof RegExp && a.find.test('@other/contracts'))).toBe(false)
  })
})

describe('ci — interrupteur CI_SELECTOR_LEGACY (vars.CI_SELECTOR_LEGACY)', () => {
  it('défaut : le nouveau comportement ; "true" : l’ancien', () => {
    expect(selectorLegacy({})).toBe(false)
    expect(selectorLegacy({ CI_SELECTOR_LEGACY: 'false' })).toBe(false)
    expect(selectorLegacy({ CI_SELECTOR_LEGACY: 'true' })).toBe(true)
  })

  it('legacy : contracts, .github et tools/ci redeviennent des fondations (suite complète)', () => {
    for (const file of ['packages/contracts/src/schemas/y.ts', '.github/workflows/ci.yml', 'tools/ci/x.mjs']) {
      expect(foundationReason([file], true), file).toMatch(/fondation/)
      expect(foundationReason([file], false), file).toBeNull()
      const plan = decideCiSelection({ ...base, changed: [file], relatedTests: [], legacy: true })
      expect(plan.mode).toBe('complet')
    }
  })

  it('legacy : une garde de lecture tourne sans regarder le diff', () => {
    const src = "import { readdirSync } from 'node:fs'\nreaddirSync(join(__dirname, 'x'))"
    expect(isAlwaysRunTest('apps/api/src/a.spec.ts', () => src, undefined)).toBe(true)
    expect(isAlwaysRunTest('apps/api/src/a.spec.ts', () => src, ['docs/y.md'])).toBe(false)
  })
})

describe('ci — empreinte de lecture des gardes', () => {
  const guard = 'apps/api/src/architecture/x.spec.ts'
  const migrations = [
    "import { readdirSync } from 'node:fs'",
    "import { join } from 'node:path'",
    "const MIGRATIONS = join(__dirname, '..', 'migrations')",
    'readdirSync(MIGRATIONS)',
  ].join('\n')

  it('une garde qui lit un dossier ne tourne que si le diff le touche', () => {
    expect(isAlwaysRunTest(guard, () => migrations, ['apps/web/src/a.ts'])).toBe(false)
    expect(isAlwaysRunTest(guard, () => migrations, ['apps/api/src/migrations/1_x.ts'])).toBe(true)
  })

  it('un chemin non calculable : la garde tourne toujours', () => {
    const dynamic = "import { readFileSync } from 'node:fs'\nreadFileSync(process.env.FILE_TO_CHECK)"
    expect(isAlwaysRunTest(guard, () => dynamic, ['apps/web/src/a.ts'])).toBe(true)
    const walker = "import { readdirSync } from 'node:fs'\nreaddirSync(getRoot())"
    expect(isAlwaysRunTest(guard, () => walker, ['apps/web/src/a.ts'])).toBe(true)
  })

  it('un parcours dont la racine est le dépôt tourne sur tout diff', () => {
    const repoWide = [
      "import { readdirSync } from 'node:fs'",
      "import { join } from 'node:path'",
      "const ROOT = join(__dirname, '..', '..', '..', '..')",
      'readdirSync(join(ROOT, scope))',
    ].join('\n')
    expect(isAlwaysRunTest(guard, () => repoWide, ['docs/x.md'])).toBe(true)
  })

  it('une spec sans lecture du dépôt n’est pas toujours lancée (même avec un diff)', () => {
    expect(isAlwaysRunTest('apps/web/src/a.test.ts', () => 'x', ['apps/web/src/b.ts'])).toBe(false)
  })
})
