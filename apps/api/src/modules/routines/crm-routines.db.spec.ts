import { Client } from 'pg'
import { needsWithoutShortlistSql } from './crm-routines.service'

/**
 * LA REQUÊTE DE « BESOINS SANS SHORTLIST » S'EXÉCUTE-T-ELLE VRAIMENT ?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Parce qu'un test qui vérifie une CHAÎNE ne prouve rien. C'est exactement ce
 * qui a laissé passer le défaut : la routine s'écrivait
 * `COALESCE(n.staffable, true) = true` sur une colonne `text`, et rien dans le
 * dépôt ne l'a vu. Le typage TypeScript ne regarde pas l'intérieur d'un gabarit,
 * les tests unitaires remplacent le dépôt TypeORM par un espion — donc personne
 * ne touchait jamais le vrai schéma — et la routine avale ses erreurs. Elle a
 * échoué à chaque exécution depuis sa mise en service, sans produire une ligne
 * ni un signalement.
 *
 * Seule une base réelle tranche. Postgres ANALYSE la requête avant de
 * l'exécuter : `EXPLAIN` suffit donc à la faire type-vérifier de bout en bout,
 * sans lire ni écrire une seule ligne.
 *
 * ⚠️ IL IMPORTE QUE CE FICHIER N'ÉCRIVE PAS LA REQUÊTE. Il l'IMPORTE
 * (`needsWithoutShortlistSql`). Une preuve qui recopie ce qu'elle prouve ne
 * prouve que la copie — et c'est un défaut que ce dépôt a déjà rencontré.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OPT-IN, comme les autres preuves adossées à une base
 * ─────────────────────────────────────────────────────────────────────────────
 *   set -a; . tools/dev.secret.sh; set +a
 *   PG_TEST_URL="postgresql://postgres:$POSTGRES_PASSWORD@localhost:5440/postgres" \
 *     npx jest src/modules/routines/crm-routines.db
 *
 * L'interrupteur est lu SYNCHRONEMENT, avant que `describe` n'ait choisi entre
 * `it` et `it.skip`. Quand il est posé, une base injoignable fait ÉCHOUER le
 * run : une preuve opt-in qui se saute en silence est pire que pas de preuve.
 * Sans interrupteur, la CI reste verte sans base — et c'est `GA-61`
 * (`src/database/sql-comparison-types.spec.ts`) qui tient la règle en continu.
 */

const CONN =
  process.env.PG_TEST_URL ??
  `postgresql://${process.env.POSTGRES_USER ?? 'postgres'}:${process.env.POSTGRES_PASSWORD ?? 'postgres'}` +
    `@${process.env.POSTGRES_HOST ?? 'localhost'}:${process.env.POSTGRES_PORT ?? '5440'}/${process.env.POSTGRES_DB ?? 'postgres'}`

/** Lu avant que `describe` ne choisisse `it` vs `it.skip` — voir l'en-tête. */
const DB_TEST_ENABLED = Boolean(process.env.PG_TEST_URL ?? process.env.RAG_DB_TEST)

/** Un espace qui n'existe pas : `EXPLAIN` ne lit aucune ligne, il analyse. */
const NOWHERE = '00000000-0000-0000-0000-000000000000'

describe('la requête « besoins sans shortlist » s’exécute contre un vrai Postgres', () => {
  const test = DB_TEST_ENABLED ? it : it.skip
  let client: Client | null = null

  beforeAll(async () => {
    if (!DB_TEST_ENABLED) return
    client = new Client({ connectionString: CONN })
    await client.connect()
  })

  afterAll(async () => {
    await client?.end()
  })

  test('Postgres l’analyse sans se plaindre d’un type', async () => {
    const sql = needsWithoutShortlistSql()
    // `EXPLAIN` fait tout le travail qui nous intéresse : analyse syntaxique,
    // résolution des colonnes ET vérification des types. Un
    // `COALESCE(text, boolean)` échoue ici, exactement comme en production.
    await expect(client!.query(`EXPLAIN ${sql}`, [NOWHERE, 5])).resolves.toBeDefined()
  })

  test('elle nomme des statuts que la contrainte de la base ACCEPTE', async () => {
    // Une valeur hors de `project_needs_status_check` ne lève pas dans un
    // `IN (…)` : elle est simplement inerte. La base est donc la seule à pouvoir
    // dire que les littéraux du prédicat sont de VRAIS statuts.
    const literals = [...needsWithoutShortlistSql().matchAll(/'([a-z_]+)'/g)].map(match => match[1])
    const statuses = literals.filter(value => value !== 'unknown' && value !== 'no')
    expect(statuses.length).toBeGreaterThan(5)

    const { rows } = await client!.query<{ ok: boolean }>(
      `SELECT bool_and(v = ANY($1::text[])) AS ok
         FROM unnest($2::text[]) AS v`,
      [await acceptedStatuses(client!), statuses],
    )
    expect(rows[0]?.ok).toBe(true)
  })

  test('et la garde sait dire NON : l’ancienne forme échoue bien ici', async () => {
    // La preuve que ce fichier n'est pas une tautologie — le prédicat retiré le
    // 28/08/2026, soumis à la même base, doit être REFUSÉ.
    const broken = needsWithoutShortlistSql().replace(
      /COALESCE\(n\.staffable, '[a-z]+'\) <> '[a-z]+'/,
      'COALESCE(n.staffable, true) = true',
    )
    expect(broken).toContain('COALESCE(n.staffable, true)')
    await expect(client!.query(`EXPLAIN ${broken}`, [NOWHERE, 5])).rejects.toThrow(/COALESCE|boolean/i)
  })
})

/** Les valeurs que `project_needs_status_check` admet réellement, lues dans la
 *  base et non dans une migration : une garde qui lit les migrations ne voit pas
 *  la base. */
async function acceptedStatuses(client: Client): Promise<string[]> {
  const { rows } = await client.query<{ def: string }>(
    `SELECT pg_get_constraintdef(oid) AS def
       FROM pg_constraint WHERE conname = 'project_needs_status_check'`,
  )
  const definition = rows[0]?.def ?? ''
  expect(definition).not.toBe('')
  return [...definition.matchAll(/'([a-z_]+)'/g)].map(match => match[1] ?? '')
}
