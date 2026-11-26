import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

/**
 * GA — un plafond de workers posé dans l'ENVIRONNEMENT arrive jusqu'au test.
 *
 * CE QUI A ÉTÉ MESURÉ LE 16/09/2026 AU SOIR
 * Le §4 de `.claude/projet.md` fait vivre les plafonds de workers dans
 * l'environnement (`VITEST_MAX_FORKS`, `VITEST_MAX_THREADS`,
 * `JEST_MAX_WORKERS`) plutôt que dans une ligne de commande, parce que le hook
 * RTK réécrit les commandes. La règle est juste. Mais les suites se lancent par
 * `pnpm turbo test`, et turbo 2 tourne en mode d'environnement STRICT : une
 * variable que `turbo.json` ne déclare pas n'arrive PAS à la tâche.
 *
 *   CI=1 JEST_MAX_WORKERS=1 pnpm turbo test --filter=@bellum/api -- --showConfig
 *   → "maxWorkers": 11
 *
 * Onze, c'est cœurs − 1 : le plafond avait disparu en route, sans erreur. Sur
 * un runner auto-hébergé (quatre conteneurs sur un CX43 à 8 vCPU), chaque job
 * de test lançait donc 7 workers là où la machine en supporte 2 — le même
 * shard web passait en 12 min sur un runner et en 42 min sur un autre, et
 * deux relances de suite ont dépassé 30 min le même soir.
 *
 * POURQUOI `passThroughEnv` ET PAS `env`
 * Une variable déclarée en `env` entre dans le HASH de la tâche. Deux runners
 * qui calculent deux plafonds différents calculeraient deux clés de cache
 * différentes, et le cache des tests ne servirait plus d'un runner à l'autre.
 * Le plafond change la VITESSE d'une suite, jamais son résultat : il n'a rien
 * à faire dans la clé. La garde refuse donc aussi `env` / `globalEnv`.
 *
 * CE QUE LA GARDE NE VOIT PAS
 * Elle vérifie la configuration, pas le runner. Qu'un conteneur ait réellement
 * 2 vCPU se lit dans le log du job : le pas « Plafond de workers » l'écrit.
 */

const RACINE = resolve(__dirname, '../../../..')

type TurboTache = { env?: string[]; passThroughEnv?: string[] }
type TurboConfig = {
  globalEnv?: string[]
  globalPassThroughEnv?: string[]
  tasks?: Record<string, TurboTache | undefined>
}

/** Les variables qu'un outil de test du dépôt lit pour borner ses workers — et OÙ il les lit. */
const PLAFONDS = [
  { variable: 'JEST_MAX_WORKERS', lecteur: 'apps/api/jest.config.js' },
  { variable: 'VITEST_MAX_FORKS', lecteur: 'vitest' },
  { variable: 'VITEST_MAX_THREADS', lecteur: 'vitest' },
] as const

const VARIABLES = PLAFONDS.map(plafond => plafond.variable)

/** Ce qui n'arrive PAS à la tâche `test` sans entrer dans son hash. */
function plafondsBloques(turbo: TurboConfig, variables: readonly string[]): string[] {
  const traversent = new Set([...(turbo.globalPassThroughEnv ?? []), ...(turbo.tasks?.test?.passThroughEnv ?? [])])
  return variables.filter(variable => !traversent.has(variable))
}

/** Le texte compilé de vitest, là où il lit ses variables — la version installée, pas celle qu'on croit. */
function sourcesDeVitest(): string {
  const paquet = require.resolve('vitest/package.json', { paths: [join(RACINE, 'apps/web')] })
  const dossier = join(dirname(paquet), 'dist', 'chunks')
  return readdirSync(dossier)
    .filter(nom => nom.endsWith('.js'))
    .map(nom => readFileSync(join(dossier, nom), 'utf8'))
    .join('\n')
}

describe('GA — les plafonds de workers traversent turbo', () => {
  const turbo = JSON.parse(readFileSync(join(RACINE, 'turbo.json'), 'utf8')) as TurboConfig

  it('lit un corpus réel — turbo.json porte bien la tâche que les plafonds doivent atteindre', () => {
    expect(Object.keys(turbo.tasks ?? {}).length).toBeGreaterThanOrEqual(5)
    expect(turbo.tasks?.test).toBeDefined()
    expect(PLAFONDS).toHaveLength(3)
  })

  it('chaque plafond exigé est RÉELLEMENT lu par son outil — jamais une variable morte', () => {
    const jest = readFileSync(join(RACINE, 'apps/api/jest.config.js'), 'utf8')
    expect(jest).toContain('process.env.JEST_MAX_WORKERS')

    // Vitest 4 ne lit plus que VITEST_MAX_WORKERS (voir §4 de .claude/projet.md) :
    // le jour d'une montée de version, cette assertion tombe AVANT que le plafond
    // ne cesse de plafonner en silence.
    const vitest = sourcesDeVitest()
    expect(vitest.length).toBeGreaterThan(100_000)
    expect(vitest).toContain('VITEST_MAX_FORKS')
    expect(vitest).toContain('VITEST_MAX_THREADS')
  })

  it('turbo.json laisse passer chaque plafond jusqu’à la tâche test', () => {
    expect(plafondsBloques(turbo, VARIABLES)).toEqual([])
  })

  it('sait dire NON — sans déclaration, les trois plafonds sont bloqués', () => {
    expect(plafondsBloques({ tasks: { test: {} } }, VARIABLES)).toEqual([...VARIABLES])
    expect(plafondsBloques({ globalPassThroughEnv: ['JEST_MAX_WORKERS'] }, VARIABLES)).toEqual([
      'VITEST_MAX_FORKS',
      'VITEST_MAX_THREADS',
    ])
  })

  it('sait dire NON — une déclaration en `env` passe, mais fend le cache : refusée', () => {
    expect(plafondsBloques({ globalEnv: [...VARIABLES] }, VARIABLES)).toEqual([...VARIABLES])
    expect(plafondsBloques({ tasks: { test: { env: [...VARIABLES] } } }, VARIABLES)).toEqual([...VARIABLES])
  })

  it('témoin — une déclaration au niveau de la tâche test suffit, pas besoin du global', () => {
    expect(plafondsBloques({ tasks: { test: { passThroughEnv: [...VARIABLES] } } }, VARIABLES)).toEqual([])
  })
})

/**
 * Le pas de CI qui CALCULE le plafond : il lit ce que le conteneur a vraiment
 * (cgroup), parce que `nproc` et `os.cpus()` rendent les cœurs de l'HÔTE.
 */
describe('GA — le plafond de CI se lit dans le conteneur, pas sur l’hôte', () => {
  const SCRIPT = join(RACINE, '.github/scripts/plafond-workers.sh')
  const WORKFLOW = readFileSync(join(RACINE, '.github/workflows/ci.yml'), 'utf8')

  /** Un faux `/sys/fs/cgroup`, avec les seuls fichiers qu'on lui donne. */
  function cgroup(fichiers: Record<string, string>): string {
    const racine = mkdtempSync(join(tmpdir(), 'plafond-workers-'))
    for (const [chemin, contenu] of Object.entries(fichiers)) {
      mkdirSync(dirname(join(racine, chemin)), { recursive: true })
      writeFileSync(join(racine, chemin), contenu)
    }
    return racine
  }

  function plafond(racine: string, coeurs: number, mioParWorker = 1536): number {
    const sortie = execFileSync('bash', [SCRIPT, String(mioParWorker)], {
      env: { ...process.env, PLAFOND_CGROUP_ROOT: racine, PLAFOND_NPROC: String(coeurs) },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return Number(sortie.trim())
  }

  const GIO = 1024 * 1024 * 1024

  it('lit un corpus réel — les deux jobs de test appellent le script avant leur suite', () => {
    expect(WORKFLOW.length).toBeGreaterThan(10_000)
    const appels = WORKFLOW.match(/bash \.github\/scripts\/plafond-workers\.sh/g) ?? []
    expect(appels).toHaveLength(2)
    // L'appel précède la suite dans CHAQUE job : sinon le plafond arrive après la bataille.
    expect(WORKFLOW.indexOf('VITEST_MAX_FORKS=')).toBeLessThan(WORKFLOW.indexOf('name: Vitest (apps/web)'))
    expect(WORKFLOW.indexOf('JEST_MAX_WORKERS=')).toBeLessThan(WORKFLOW.indexOf('name: Jest (apps/api)'))
  })

  it('un conteneur à 2 vCPU sur un hôte à 8 cœurs rend 2, pas 7', () => {
    const racine = cgroup({ 'cpu.max': '200000 100000\n', 'memory.max': `${8 * GIO}\n` })
    expect(plafond(racine, 8)).toBe(2)
  })

  it('la MÉMOIRE borne aussi : 3 Gio à 1 536 Mio par worker rendent 2, même avec 8 vCPU', () => {
    const racine = cgroup({ 'cpu.max': '800000 100000\n', 'memory.max': `${3 * GIO}\n` })
    expect(plafond(racine, 16)).toBe(2)
  })

  it('cgroup v1 est lu aussi', () => {
    const racine = cgroup({
      'cpu/cpu.cfs_quota_us': '300000\n',
      'cpu/cpu.cfs_period_us': '100000\n',
      'memory/memory.limit_in_bytes': `${16 * GIO}\n`,
    })
    expect(plafond(racine, 12)).toBe(3)
  })

  it('sait dire NON — jamais zéro worker, même dans un conteneur minuscule', () => {
    const racine = cgroup({ 'cpu.max': '50000 100000\n', 'memory.max': `${512 * 1024 * 1024}\n` })
    expect(plafond(racine, 8)).toBe(1)
  })

  it('témoin — sans aucune limite (ubuntu-latest), le comportement reste cœurs − 1', () => {
    expect(plafond(cgroup({ 'cpu.max': 'max 100000\n', 'memory.max': 'max\n' }), 4)).toBe(3)
    expect(plafond(cgroup({}), 4)).toBe(3)
    // cgroup v1 écrit « illimité » comme un très grand nombre, pas comme « max ».
    expect(plafond(cgroup({ 'memory/memory.limit_in_bytes': '9223372036854771712\n' }), 4)).toBe(3)
  })
})
