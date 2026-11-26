import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guard against migration-timestamp collisions.
 *
 * TypeORM orders migrations by the 13-digit timestamp parsed from the CLASS
 * name (`MigrationExecutor.getMigrations()` → `className.substr(-13)`), and
 * `Array.prototype.sort` is stable — two migrations sharing a timestamp run
 * in FILE LOAD order. Since the bundled glob v10 no longer sorts its results,
 * that order is platform/filesystem-dependent: a fresh database may execute
 * a colliding pair in either order. One legacy pair (1783000000000) already
 * shipped this way and is recorded in the prod `_migrations` table under its
 * current class names — it is whitelisted below and must NEVER be renamed
 * (a renamed class no longer matches its `_migrations` row, so TypeORM would
 * consider it pending and RE-RUN it on the next `migration:run`).
 *
 * Any NEW collision fails this suite. Pick a fresh unique timestamp instead.
 */

const MIGRATIONS_DIR = join(__dirname, '..', 'migrations')

/**
 * Legacy collision, frozen: both classes are recorded in the production
 * `_migrations` table under these exact names. Renaming either file/class
 * would trigger a re-run at boot (verified against TypeORM 0.3.28 — the
 * pending list is computed once, before any migration executes, so even a
 * corrective UPDATE of `_migrations` cannot prevent it). Do not grow this
 * list — it exists only to grandfather the shipped pair.
 */
const LEGACY_DUPLICATE_TIMESTAMP_FILES = [
  '1783000000000-AddArchivedDeletedStatusesToAccounts.ts',
  '1783000000000-BackfillReconciledPriorityScore.ts',
]

/**
 * Cinq migrations sont déjà en production sur `origin/main` avec un
 * horodatage à 14 chiffres (`YYYYMMDDHHmmss`) au lieu des 13 attendus — un
 * format d'agenda différent, choisi avant que cette garde n'existe. Elles
 * sont inscrites dans `_migrations` sous ces noms exacts : les renommer les
 * ferait rejouer au prochain `migration:run` (même raisonnement que
 * `LEGACY_DUPLICATE_TIMESTAMP_FILES` ci-dessus). Gelées ici le 27/09/2026,
 * plutôt que corrigées. N'AJOUTER une ligne QUE pour une migration déjà
 * partie en production — jamais pour s'épargner un vrai horodatage à 13
 * chiffres sur une migration neuve : celle-ci doit continuer à échouer ce
 * test.
 */
const LEGACY_FOURTEEN_DIGIT_FILES = [
  '20260927181000-ConsultantEngagementPartner.ts',
  '20260927181100-ConsultantMobilityFine.ts',
  '20260927181200-ConsultantProcess.ts',
  '20260927181300-ConsultantPositioningAgreement.ts',
  '20260927183242-NeedDecisionProcessAndProcurement.ts',
  '20260927195301-ConsultantEducation.ts',
  // #4780 — deux autres migrations à 14 chiffres, déjà sur `origin/main` (donc en production) : le 25/10 (#4546) et le
  // 26/10. Mesuré : TypeORM ne lit que les 13 DERNIERS chiffres du NOM DE CLASSE, donc ces 14 chiffres ne font pas
  // passer la migration après les migrations à 13 chiffres — l'ordre d'exécution n'est pas touché. Les renommer les
  // ferait rejouer : gelées, pas corrigées.
  '20261025100000-MultiMailboxConnections.ts',
  '20261026230417-SyncRecordEventsEntityLabel.ts',
]

const FILENAME_PATTERN = /^(\d{13})-.+\.ts$/

function listMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.ts') && !file.endsWith('.spec.ts') && !file.endsWith('.d.ts'))
    .sort()
}

/** Groups migration filenames by their 13-digit timestamp prefix. */
function groupByTimestamp(files: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  for (const file of files) {
    const timestamp = FILENAME_PATTERN.exec(file)?.[1]
    if (!timestamp) continue
    groups.set(timestamp, [...(groups.get(timestamp) ?? []), file])
  }
  return groups
}

/** Returns the groups of files sharing a timestamp (the collisions). */
function findTimestampCollisions(files: string[]): string[][] {
  return [...groupByTimestamp(files).values()].filter(group => group.length > 1)
}

describe('migrations directory', () => {
  const files = listMigrationFiles()

  it('contains migration files (sanity: the directory is found)', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('every migration filename starts with a 13-digit timestamp (except the frozen legacy 14-digit files)', () => {
    const invalid = files.filter(file => !FILENAME_PATTERN.test(file) && !LEGACY_FOURTEEN_DIGIT_FILES.includes(file))
    expect(invalid).toEqual([])
  })

  it('the whitelisted legacy 14-digit files still exist as-is (update the whitelist if they legitimately change)', () => {
    for (const legacy of LEGACY_FOURTEEN_DIGIT_FILES) {
      expect(files).toContain(legacy)
    }
  })

  it('no two migrations share a timestamp (except the frozen legacy 1783000000000 pair)', () => {
    const collisions = findTimestampCollisions(files).filter(
      group => group.join() !== LEGACY_DUPLICATE_TIMESTAMP_FILES.join(),
    )
    expect(collisions).toEqual([])
  })

  it('recent migrations use a real millisecond timestamp, not a round number', () => {
    // Three collisions landed in a row on the same file (1786400000000,
    // 1786500000000, 1786600000000) because everyone hand-picks a round
    // hundred-billion value, so any two branches merged in parallel choose the
    // same one. TypeORM's own convention is Date.now() — an actual millisecond —
    // precisely to make that impossible. Enforced only from the point the habit
    // starts, so the existing history stays untouched.
    const FIRST_ENFORCED = 1786600000001
    // Une migration DÉJÀ DÉPLOYÉE ne peut plus être renommée : son nom est la clé
    // dans la table `_migrations`, la rebaptiser la ferait rejouer en production.
    // Elle est donc gelée ici plutôt que corrigée — la règle continue de mordre
    // sur tout ce qui arrive après. N'ajouter une ligne QUE pour une migration
    // déjà partie en prod, jamais pour s'épargner un vrai horodatage.
    const DEPLOYED_ROUND_TIMESTAMPS: readonly string[] = [
      '1787900000000-Opportunities.ts',
      '1786700000000-ContactIdentityDedup.ts',
      // Déjà déployées sur main avant que la garde ne soit ajoutée — les
      // renommer réécrirait des lignes `_migrations` existantes en production.
      '1788300000000-TeamNeedsAndGrowthSeatPrice.ts',
      '1788400000000-NeedPlays.ts',
      '1788500000000-ProviderCosts.ts',
      // Partie en production le 16/08 (choix de l'agenda lu) : elle est déjà
      // inscrite dans `_migrations`, la renommer la ferait rejouer.
      '1789200000000-AgendaCalendarPreference.ts',
    ]
    const offenders = files
      .map(file => ({ file, ts: Number(FILENAME_PATTERN.exec(file)?.[1] ?? 0) }))
      .filter(({ ts }) => ts >= FIRST_ENFORCED && ts % 100_000_000 === 0)
      .map(({ file }) => file)
      .filter(file => !DEPLOYED_ROUND_TIMESTAMPS.includes(file))

    expect(offenders).toEqual([])
  })

  it('the whitelisted legacy pair still exists as-is (update the whitelist if it legitimately changes)', () => {
    for (const legacy of LEGACY_DUPLICATE_TIMESTAMP_FILES) {
      expect(files).toContain(legacy)
    }
  })

  it('each migration class name embeds the same timestamp as its filename (this is what `_migrations` records and orders by)', () => {
    const mismatches: string[] = []
    for (const file of files) {
      const timestamp = FILENAME_PATTERN.exec(file)?.[1]
      if (!timestamp) continue
      const source = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
      const className = /export class (\w+)/.exec(source)?.[1]
      if (!className?.endsWith(timestamp)) {
        mismatches.push(`${file} → class ${className ?? '(none found)'}`)
      }
    }
    expect(mismatches).toEqual([])
  })
})

describe('findTimestampCollisions (the guard itself)', () => {
  it('catches a colliding pair — e.g. the 1785600000000 wave-B style collision', () => {
    expect(
      findTimestampCollisions([
        '1785600000000-ContactLifecycle.ts',
        '1785600000000-ProductEvents.ts',
        '1785700000000-GoogleConnections.ts',
      ]),
    ).toEqual([['1785600000000-ContactLifecycle.ts', '1785600000000-ProductEvents.ts']])
  })

  it('catches triple collisions and reports the full group', () => {
    expect(findTimestampCollisions(['1780000000000-A.ts', '1780000000000-B.ts', '1780000000000-C.ts'])).toEqual([
      ['1780000000000-A.ts', '1780000000000-B.ts', '1780000000000-C.ts'],
    ])
  })

  it('passes on unique timestamps', () => {
    expect(findTimestampCollisions(['1780000000000-A.ts', '1780000000001-B.ts'])).toEqual([])
  })
})
