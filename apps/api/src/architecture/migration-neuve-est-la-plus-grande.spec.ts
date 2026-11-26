import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * GA-372 — une migration NEUVE prend l'horodatage le plus grand de la série.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT MESURÉ (issue #2684)
 * ─────────────────────────────────────────────────────────────────────────────
 * 478 migrations vivent dans `apps/api/src/migrations/`, horodatées de
 * `1767225600000` (01/01/2026) à `1795725507899` — le 26/11/2026, DEUX MOIS
 * devant l'horloge machine du 21/09/2026 (`1789997572160`). TypeORM exécute les
 * migrations dans l'ordre de cet horodatage : une migration neuve prise à
 * `Date.now()` se serait donc placée AVANT 229 des 478 existantes sur une base
 * fraîche — un `ALTER`/`ADD COLUMN` avant le `CREATE TABLE` dont il dépend.
 * Latent aujourd'hui (les bases en service ont déjà enregistré leurs
 * migrations et ne les rejouent pas), le défaut se révèle sur toute
 * installation neuve — donc en CI, sur une base jetable, au moment même où
 * cette garde tourne.
 *
 * Le décalage a déjà coûté : un agent a dû reculer son horodatage de
 * +6 × 10⁹ ms À LA MAIN pour que son `ALTER` passe après son `CREATE`.
 * L'écart était juste ; c'est la SÉRIE qui était fausse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DÉCISION (Louis, 21/09/2026) — ON N'Y TOUCHE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucune migration existante n'est renumérotée : elle a déjà tourné en
 * production, et ce dépôt archive, il ne réécrit pas ce qui a tourné. Cette
 * garde ne juge donc JAMAIS l'ordre interne des 478 migrations déjà en place
 * — il n'est pas garanti croissant par rapport à l'horloge réelle, et ce n'est
 * pas le sujet. Elle juge une seule chose : une migration AJOUTÉE PAR CETTE
 * BRANCHE doit porter un horodatage strictement supérieur au maximum déjà en
 * service sur `origin/main`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMMENT ELLE SAIT CE QUI EST « NEUF » SANS ÉTAT GIT SUPPOSÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * « Neuf » est un fait relatif à `origin/main`, jamais à l'horloge locale
 * (c'est exactement l'inverse qui a produit le défaut). On lit donc la liste
 * des fichiers de `apps/api/src/migrations` telle qu'`origin/main` la porte
 * (`git ls-tree`), et on compare au disque : ce qui est sur le disque et pas
 * dans cet arbre est « ajouté par cette branche ».
 *
 * ⚠️ Le job CI qui lance cette suite (`Test (API)`) fait un `actions/checkout`
 * à profondeur 1 : il ne rapporte QUE le commit courant, `origin/main` n'y est
 * pas résolvable tel quel. On retombe alors sur un fetch superficiel d'une
 * seule référence (même geste que le job `Ce qui a changé` du même workflow,
 * qui fait déjà `git fetch --no-tags --prune origin "+refs/heads/${BASE}:…"`)
 * — un seul commit téléchargé, pas l'historique. Un clone de développement
 * normal a déjà `origin/main` en local et ne fait aucun appel réseau.
 */

const REPO_ROOT = resolve(__dirname, '../../../..')
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations')
const MIGRATIONS_PATHSPEC = 'apps/api/src/migrations'
const FILENAME_PATTERN = /^(\d{13})-.+\.ts$/

type Migration = { file: string; timestamp: number }

function toMigrations(files: string[]): Migration[] {
  const out: Migration[] = []
  for (const file of files) {
    const timestamp = FILENAME_PATTERN.exec(file)?.[1]
    if (timestamp) out.push({ file, timestamp: Number(timestamp) })
  }
  return out
}

/**
 * La règle elle-même, PURE : aucune migration « ajoutée » ne doit porter un
 * horodatage inférieur ou égal au maximum déjà en service. Une fonction pure
 * se teste sans toucher au disque ni à git — c'est ce qui rend le test rouge
 * lisible : il ne dépend que de cette signature.
 */
function violationsAmongAdded(baselineMax: number, added: Migration[]): string[] {
  return added
    .filter(migration => migration.timestamp <= baselineMax)
    .map(
      migration =>
        `${migration.file} porte l'horodatage ${migration.timestamp}, ≤ au maximum déjà en service ` +
        `sur origin/main (${baselineMax}). TypeORM l'exécuterait AVANT des migrations dont elle dépend ` +
        `sur une base fraîche — reprends un horodatage strictement supérieur à ${baselineMax}, jamais Date.now().`,
    )
}

/** Les migrations réellement présentes sur le disque, dans cette branche. */
function migrationsOnDisk(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter(file => FILENAME_PATTERN.test(file))
}

/**
 * `origin/main` en local si possible (aucun réseau), sinon un fetch
 * superficiel d'une seule référence — voir le docblock ci-dessus.
 */
function ensureOriginMainIsLocal(): void {
  // ⚠️ En CI, TOUJOURS rafraîchir : nos runners auto-hébergés ne sont pas
  // éphémères, leur dossier de travail garde un `origin/main` d'un job
  // précédent. Mesuré le 30/09/2026 sur vps-255ad2ca13ac : `origin/main` y
  // pointait sur 610f8348b9 (#3450), d'avant #3461 — la migration
  // `ChatTurnCostSamples`, arrivée par #3461, y passait pour « ajoutée par la
  // branche » et la garde tombait sur toute PR ayant fusionné main (#3460, #3463, #3478).
  // `--depth=1` seulement sur un clone DÉJÀ superficiel : sur un clone complet
  // il le rendrait superficiel et casserait tout `merge-base` (dépôt de
  // développement devenu shallow le 30/09/2026).
  if (process.env['CI']) {
    execFileSync(
      'git',
      ['fetch', '--no-tags', ...shallowDepthArgs(), 'origin', '+refs/heads/main:refs/remotes/origin/main'],
      {
        cwd: REPO_ROOT,
        stdio: 'ignore',
      },
    )
    return
  }
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', 'origin/main'], {
      cwd: REPO_ROOT,
      stdio: 'ignore',
    })
    return
  } catch {
    // Pas encore local — tenter un fetch superficiel ci-dessous.
  }
  execFileSync(
    'git',
    ['fetch', '--no-tags', ...shallowDepthArgs(), 'origin', '+refs/heads/main:refs/remotes/origin/main'],
    {
      cwd: REPO_ROOT,
      stdio: 'ignore',
    },
  )
}

function shallowDepthArgs(): string[] {
  const shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).trim()
  return shallow === 'true' ? ['--depth=1'] : []
}

/** Les migrations telles qu'`origin/main` les porte — la ligne de base. */
function migrationsOnOriginMain(): string[] {
  ensureOriginMainIsLocal()
  const output = execFileSync('git', ['ls-tree', '-r', '--name-only', 'origin/main', '--', MIGRATIONS_PATHSPEC], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
  return output
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(path => path.split('/').pop() as string)
    .filter(file => FILENAME_PATTERN.test(file))
}

describe('GA-372 — une migration neuve prend le plus grand horodatage de la série', () => {
  it('détecte une migration ajoutée dont l’horodatage n’est pas le plus grand', () => {
    // Le défaut réel de l'issue #2684 : `Date.now()` au 21/09/2026 rendait
    // 1789997572160, inférieur au maximum déjà en service (1795725507899).
    const violations = violationsAmongAdded(1795725507899, toMigrations(['1789997572160-NouvelleTable.ts']))
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('1789997572160-NouvelleTable.ts')
    expect(violations[0]).toContain('1795725507899')
  })

  it('sait dire NON — une migration au-delà du maximum ne déclenche rien', () => {
    expect(violationsAmongAdded(1795725507899, toMigrations(['1795725507900-Suivante.ts']))).toEqual([])
  })

  it('un horodatage strictement ÉGAL au maximum est aussi refusé', () => {
    expect(violationsAmongAdded(1795725507899, toMigrations(['1795725507899-MemeInstant.ts']))).toHaveLength(1)
  })

  it('ne juge que les migrations AJOUTÉES — sans ajout, rien à signaler, quel que soit le maximum', () => {
    // Les 478 migrations déjà en place, prises entre elles, ne sont PAS
    // garanties croissantes par rapport à l'horloge réelle — ce n'est pas le
    // sujet de cette garde. Elle ne reçoit ici aucune migration « ajoutée »,
    // donc rien à signaler.
    expect(violationsAmongAdded(0, [])).toEqual([])
  })

  it('la garde lit un corpus réel — le disque ET origin/main rapportent des centaines de migrations', () => {
    // Sans ce test, une expression régulière cassée ou un chemin faux rendrait
    // les deux fonctions ci-dessus au vert pour toujours, sur zéro élément.
    const disk = migrationsOnDisk()
    const baseline = migrationsOnOriginMain()
    expect(disk.length).toBeGreaterThan(400)
    expect(baseline.length).toBeGreaterThan(400)
  })

  it('aucune migration ajoutée par cette branche ne recule sous le maximum d’origin/main', () => {
    const baseline = migrationsOnOriginMain()
    const baselineSet = new Set(baseline)
    const baselineMax = Math.max(...toMigrations(baseline).map(migration => migration.timestamp))

    const added = migrationsOnDisk().filter(file => !baselineSet.has(file))
    const violations = violationsAmongAdded(baselineMax, toMigrations(added))

    if (violations.length > 0) {
      throw new Error(
        [
          'Une migration ajoutée par cette branche n’est pas la plus grande de la série.',
          'TypeORM exécute par ordre d’horodatage : elle s’exécuterait AVANT des migrations',
          'existantes dont elle dépend, sur toute base fraîche (issue #2684).',
          '',
          ...violations.map(line => `  · ${line}`),
        ].join('\n'),
      )
    }
    expect(violations).toEqual([])
  })
})
