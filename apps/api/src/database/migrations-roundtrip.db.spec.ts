/**
 * CI-3 — UN test d'intégration des migrations, sur un VRAI Postgres (pgvector), à la place des miroirs SQL.
 *
 * 278 specs de migration mockent `QueryRunner.query` et comparent des chaînes SQL : elles prouvent que le texte n'a pas
 * bougé, jamais que Postgres l'accepte. Ce test fait le trajet complet :
 *   1. up de TOUTES les migrations (base vierge, ordre de `migrations-loader.ts`) ;
 *   2. le schéma résultant porte chaque table et chaque colonne que déclarent les entités TypeORM ;
 *   3. down de TOUTES les migrations, en ordre inverse → la base revient à vide ;
 *   4. up de nouveau (une migration non rejouable est une migration cassée).
 *
 * OPT-IN (`PG_TEST_URL`), comme `demo-seed-real-db.db.spec.ts`. Le job CI « Migrations sur vraie base » pose aussi
 * `MIGRATIONS_DB_REQUIRED=1` : un interrupteur absent FAIT ÉCHOUER au lieu de sauter.
 *
 * Deux contrôles ont un interrupteur de sévérité (docs/ci.md §3), parce qu'ils n'ont jamais tourné sur la vraie base :
 *   - `MIGRATIONS_SCHEMA_REQUIRED=1` : un écart entités ↔ schéma fait échouer (sinon il est LISTÉ en avertissement) ;
 *   - `MIGRATIONS_DOWN_REQUIRED=1`   : un `down` en échec / un reste après les down fait échouer (idem).
 * Le up (étapes 1 et 4) échoue TOUJOURS.
 */
import { DataSource } from 'typeorm'
import { ENTITIES } from './database.module'
import { loadMigrations, type LoadedMigration } from './migrations-loader'

const DB_TEST_ENABLED = Boolean(process.env['PG_TEST_URL'])
const REQUIRED = process.env['MIGRATIONS_DB_REQUIRED'] === '1'
const SCHEMA_REQUIRED = process.env['MIGRATIONS_SCHEMA_REQUIRED'] === '1'
const DOWN_REQUIRED = process.env['MIGRATIONS_DOWN_REQUIRED'] === '1'
const maybe = DB_TEST_ENABLED || REQUIRED ? it : it.skip

function dataSource(): DataSource {
  return new DataSource({
    type: 'postgres',
    host: process.env['POSTGRES_HOST'] ?? 'localhost',
    port: Number(process.env['POSTGRES_PORT'] ?? 5432),
    username: process.env['POSTGRES_USER'] ?? 'postgres',
    password: process.env['POSTGRES_PASSWORD'] ?? 'postgres',
    database: process.env['POSTGRES_DB'] ?? 'postgres',
    entities: ENTITIES,
  })
}

/** Chaque migration dans sa transaction ; renvoie les échecs (nom + message) au lieu de s'arrêter. */
async function runAll(
  ds: DataSource,
  migrations: LoadedMigration[],
  direction: 'up' | 'down',
  stopAtFirstFailure: boolean,
): Promise<string[]> {
  const runner = ds.createQueryRunner()
  await runner.connect()
  const failures: string[] = []
  try {
    for (const { file, instance } of migrations) {
      await runner.startTransaction()
      try {
        await instance[direction](runner)
        await runner.commitTransaction()
      } catch (error) {
        await runner.rollbackTransaction()
        failures.push(`${file} : ${error instanceof Error ? error.message : String(error)}`)
        if (stopAtFirstFailure) break
      }
    }
  } finally {
    await runner.release()
  }
  return failures
}

/** Objets applicatifs qui restent dans `public` (tables, vues, séquences, types, fonctions). */
async function leftovers(ds: DataSource): Promise<string[]> {
  const rows: Array<{ kind: string; name: string }> = await ds.query(`
    SELECT 'relation' AS kind, c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','S') AND NOT c.relispartition
    UNION ALL
    SELECT 'type', t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typtype IN ('e','d')
    UNION ALL
    SELECT 'function', p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
    ORDER BY 1, 2`)
  return rows.map(r => `${r.kind} ${r.name}`)
}

async function schemaGaps(ds: DataSource): Promise<string[]> {
  const cols: Array<{ table_schema: string; table_name: string; column_name: string }> = await ds.query(
    `SELECT table_schema, table_name, column_name FROM information_schema.columns
       WHERE table_schema NOT IN ('pg_catalog', 'information_schema')`,
  )
  const present = new Set(cols.map(c => `${c.table_schema}.${c.table_name}.${c.column_name}`))
  const tables = new Set(cols.map(c => `${c.table_schema}.${c.table_name}`))
  const gaps: string[] = []
  for (const meta of ds.entityMetadatas) {
    if (meta.tableType !== 'regular') continue
    const schema = meta.schema ?? 'public'
    const table = `${schema}.${meta.tableName}`
    if (!tables.has(table)) {
      gaps.push(`table manquante ${table} (entité ${meta.name})`)
      continue
    }
    for (const col of meta.columns) {
      if (!present.has(`${table}.${col.databaseName}`)) gaps.push(`colonne manquante ${table}.${col.databaseName}`)
    }
  }
  return gaps
}

function report(label: string, problems: string[], strict: boolean): void {
  if (problems.length === 0) return
  const text = `${label} (${problems.length}) :\n  - ${problems.join('\n  - ')}`
  if (strict) throw new Error(text)
  // Avertissement visible dans le journal du job ; le contrôle devient bloquant par son interrupteur (docs/ci.md §3).
  console.warn(`::warning title=${label}::${problems.slice(0, 20).join(' | ')}`)
  console.warn(text)
}

describe('migrations — up, schéma, down, up sur une vraie base (CI-3)', () => {
  jest.setTimeout(900_000)

  maybe('up → schéma conforme aux entités → down → base vide → up', async () => {
    if (!DB_TEST_ENABLED) {
      throw new Error('MIGRATIONS_DB_REQUIRED=1 mais PG_TEST_URL est absent : le test refuse de se sauter')
    }
    const migrations = await loadMigrations()
    expect(migrations.length).toBeGreaterThan(100)
    const ds = dataSource()
    await ds.initialize()
    try {
      // 1. up, toujours bloquant (première migration en échec = arrêt, nommée).
      const upFailures = await runAll(ds, migrations, 'up', true)
      expect(upFailures).toEqual([])

      // 2. le schéma porte ce que les entités déclarent.
      report('Écarts entités ↔ schéma', await schemaGaps(ds), SCHEMA_REQUIRED)

      // 3. down en ordre inverse, jusqu'au bout (on liste TOUS les échecs, pas seulement le premier).
      const reversed = [...migrations].reverse().filter(m => typeof m.instance.down === 'function')
      const downFailures = await runAll(ds, reversed, 'down', false)
      report('Migrations dont le down échoue', downFailures, DOWN_REQUIRED)
      report('Objets restants après tous les down', await leftovers(ds), DOWN_REQUIRED)

      // 4. re-up : seulement si la base est revenue à vide, sinon le conflit ne dirait rien de neuf.
      if (downFailures.length === 0 && (await leftovers(ds)).length === 0) {
        expect(await runAll(ds, migrations, 'up', true)).toEqual([])
      }
    } finally {
      await ds.destroy()
    }
  })
})
