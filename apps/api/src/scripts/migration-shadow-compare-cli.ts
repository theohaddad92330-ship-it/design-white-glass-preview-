import { Client } from 'pg'
import { compareShadowRead, readyForCutover } from '../modules/admin/migration-shadow-compare'

/**
 * #2446.7 (épopée #2772) — L'APPELANT QUI MANQUAIT.
 *
 * `migration-shadow-compare.ts` porte deux fonctions pures de décision, sans
 * I/O — mais sans appelant, ce n'est que du code testé que personne
 * n'invoque. Ce CLI est cet appelant, contre un VRAI Postgres, même patron
 * que `migration-backup.ts`/`migration-restore.ts` (mêmes variables
 * `POSTGRES_*`, jamais `DATABASE_URL`) :
 *
 *   pnpm --filter @bellum/api migration:shadow-compare \
 *     --old-table contacts_legacy --new-table contacts \
 *     --fields email,full_name --min-samples 20
 *
 * Le double-écriture lui-même reste spécifique à CHAQUE migration critique
 * (hors de portée d'un outil générique, cf. `migration-shadow-compare.ts`) —
 * cet outil suppose que les deux tables reçoivent déjà les mêmes écritures et
 * ne fait QUE la lecture comparée + le verdict de coupure. Sortie non-zéro
 * si la coupure n'est pas prête : utilisable comme porte dans un script
 * d'ops, jamais une coupure déclenchée automatiquement (doctrine : une
 * écriture d'infrastructure passe par une porte).
 */

export interface ShadowCompareCliArgs {
  oldTable: string
  newTable: string
  idColumn: string
  fields: string[]
  limit: number
  minSamples: number
}

function requireArg(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  return index === -1 ? undefined : argv[index + 1]
}

export function parseShadowCompareArgs(argv: string[]): ShadowCompareCliArgs {
  const oldTable = requireArg(argv, '--old-table')
  const newTable = requireArg(argv, '--new-table')
  const fieldsRaw = requireArg(argv, '--fields')
  if (!oldTable)
    throw new Error('Usage: migration:shadow-compare --old-table <table> --new-table <table> --fields <a,b,c>')
  if (!newTable) throw new Error('--new-table est obligatoire')
  if (!fieldsRaw) throw new Error('--fields est obligatoire — comparer sans champ nommé ne veut rien dire')

  const limitRaw = requireArg(argv, '--limit')
  const minSamplesRaw = requireArg(argv, '--min-samples')
  return {
    oldTable,
    newTable,
    idColumn: requireArg(argv, '--id-column') ?? 'id',
    fields: fieldsRaw
      .split(',')
      .map(f => f.trim())
      .filter(Boolean),
    limit: limitRaw ? Number(limitRaw) : 100,
    minSamples: minSamplesRaw ? Number(minSamplesRaw) : 20,
  }
}

/**
 * `SELECT id, <champs>` — jamais `SELECT *` : les champs suivis sont NOMMÉS,
 * jamais devinés depuis le schéma (doctrine : nommer, pas deviner).
 */
export function buildComparisonQueries(args: ShadowCompareCliArgs): { oldQuery: string; newQuery: string } {
  const columns = [args.idColumn, ...args.fields].join(', ')
  return {
    oldQuery: `SELECT ${columns} FROM ${args.oldTable} ORDER BY ${args.idColumn} LIMIT ${args.limit}`,
    newQuery: `SELECT ${columns} FROM ${args.newTable} ORDER BY ${args.idColumn} LIMIT ${args.limit}`,
  }
}

type Row = Record<string, unknown>

/**
 * Apparie les lignes des deux côtés par id. Une ligne présente d'un seul côté
 * est appariée à `null` — jamais ignorée en silence, `compareShadowRead` la
 * nomme ensuite comme un mismatch de présence.
 */
export function pairRowsById(
  oldRows: Row[],
  newRows: Row[],
  idColumn: string,
  fields: readonly string[],
): { oldValue: Row | null; newValue: Row | null }[] {
  const newById = new Map(newRows.map(row => [row[idColumn], row]))
  const seen = new Set<unknown>()
  const pairs: { oldValue: Row | null; newValue: Row | null }[] = oldRows.map(oldValue => {
    const id = oldValue[idColumn]
    seen.add(id)
    return { oldValue, newValue: newById.get(id) ?? null }
  })
  for (const newValue of newRows) {
    const id = newValue[idColumn]
    if (!seen.has(id)) pairs.push({ oldValue: null, newValue })
  }
  // `fields` n'est pas utilisé pour l'appariement (par id uniquement) — passé
  // pour que la forme de l'appelant reste explicite sur ce qui sera comparé.
  void fields
  return pairs
}

async function main(): Promise<void> {
  const args = parseShadowCompareArgs(process.argv.slice(2))
  const { oldQuery, newQuery } = buildComparisonQueries(args)

  const env = {
    host: process.env['POSTGRES_HOST'] ?? 'localhost',
    port: Number(process.env['POSTGRES_PORT'] ?? '5432'),
    user: process.env['POSTGRES_USER'] ?? 'postgres',
    password: process.env['POSTGRES_PASSWORD'] ?? 'postgres',
    database: process.env['POSTGRES_DB'] ?? 'postgres',
  }
  const client = new Client(env)
  await client.connect()
  try {
    const [oldResult, newResult] = await Promise.all([client.query(oldQuery), client.query(newQuery)])
    const pairs = pairRowsById(oldResult.rows, newResult.rows, args.idColumn, args.fields)
    const results = pairs.map(({ oldValue, newValue }) => compareShadowRead(oldValue, newValue, args.fields))
    const verdict = readyForCutover(results, { minSamples: args.minSamples })

    console.log(`[migration:shadow-compare] ${args.oldTable} ↔ ${args.newTable} sur [${args.fields.join(', ')}]`)
    console.log(`[migration:shadow-compare] ${verdict.reason}`)
    for (const [index, result] of results.entries()) {
      if (!result.matches)
        console.log(`[migration:shadow-compare]   divergence #${index} : ${JSON.stringify(result.mismatches)}`)
    }
    if (!verdict.ready) process.exitCode = 1
  } finally {
    await client.end()
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
