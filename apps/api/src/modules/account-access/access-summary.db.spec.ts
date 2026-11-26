/**
 * N18 — `GET /accounts/access-summary` répondait **500** en production, sans
 * qu'une seule ligne de log ne le dise, et l'écran affichait « – » sur chaque
 * compte : EXACTEMENT ce qu'il affiche quand la fonctionnalité marche sur un
 * espace sans donnée. « cassé et non mesurable se ressemblent ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'HYPOTHÈSE TESTÉE, ET INFIRMÉE ICI
 * ─────────────────────────────────────────────────────────────────────────
 * `AccountAccessService.accessSummary` sélectionne trois colonnes par un
 * `select` en forme d'OBJET, dont `raw_analysis` (jsonb) :
 *
 *   this.accounts.find({
 *     where: { workspace_id },
 *     select: { id: true, status: true, raw_analysis: true },
 *   })
 *
 * L'hypothèse de départ était que TypeORM traiterait parfois les clés d'un
 * `select` objet comme une sélection IMBRIQUÉE, produisant du SQL invalide
 * sur une colonne JSON. `access-summary.spec.ts` (mocké) ne peut PAS trancher
 * cette question : un mock de repository ne construit jamais de vraie
 * requête SQL, donc il ne peut jamais reproduire du SQL invalide — précisément
 * pourquoi le défaut a pu passer inaperçu jusqu'en production.
 *
 * Ce fichier fait tourner le VRAI `AccountAccessService.accessSummary`
 * (jamais réécrit — importé) contre un VRAI PostgreSQL, construit par les 278
 * migrations réelles du dépôt (pas `synchronize: true`, qui aurait fabriqué
 * un schéma depuis l'entité au lieu de le VÉRIFIER contre les migrations).
 *
 * Résultat mesuré le 30/08/2026 (TypeORM 0.3.28, `pg` 8.20, Postgres 16 et
 * 17) : LA REQUÊTE S'EXÉCUTE SANS ERREUR, avec zéro compte et avec plusieurs,
 * `raw_analysis` peuplé ou vide. L'hypothèse initiale est donc FAUSSE pour
 * cette forme de `select` — ce test le prouve et le protège : si une
 * évolution future de TypeORM (ou une migration qui changerait le type réel
 * de `status`/`raw_analysis`) rendait cette requête invalide, c'est ICI que
 * ça se verrait, jamais dans le fichier mocké.
 *
 * La cause RÉELLE du 500 observé en production n'a pas pu être reproduite —
 * aucune base de production, aucune trace serveur exploitable (voir
 * `account-access.service.ts`, qui journalise maintenant l'échec). Ce que ce
 * chantier corrige avec certitude : l'absence totale de journalisation, qui
 * empêchait tout diagnostic (`access-summary.spec.ts`, les deux derniers cas).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * OPT-IN, comme les autres preuves adossées à une base
 * ─────────────────────────────────────────────────────────────────────────
 *   set -a; . tools/dev.secret.sh; set +a
 *   PG_TEST_URL="postgresql://postgres:$POSTGRES_PASSWORD@localhost:5440/postgres" \
 *     npx jest src/modules/account-access/access-summary.db
 *
 * Suppose une base dont les migrations sont déjà appliquées (`pnpm migration:run`),
 * avec le schéma Supabase (`auth.users`) tel que le fournit `tools/docker-compose.yml`
 * — même précondition que `1786970000000-RagWorkspaceScope.db.spec.ts`.
 *
 * L'interrupteur est lu SYNCHRONEMENT, avant que `describe` n'ait choisi entre
 * `it` et `it.skip`. Quand il est posé, une base injoignable fait ÉCHOUER le
 * run : une preuve opt-in qui se saute en silence est pire que pas de preuve.
 * Sans interrupteur, la CI reste verte sans base.
 */
import { Client } from 'pg'
import { DataSource } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountAccessService } from './account-access.service'

const CONN =
  process.env.PG_TEST_URL ??
  `postgresql://${process.env.POSTGRES_USER ?? 'postgres'}:${process.env.POSTGRES_PASSWORD ?? 'postgres'}` +
    `@${process.env.POSTGRES_HOST ?? 'localhost'}:${process.env.POSTGRES_PORT ?? '5440'}/${process.env.POSTGRES_DB ?? 'postgres'}`

/** Lu avant que `describe` ne choisisse `it` vs `it.skip` — voir l'en-tête. */
const DB_TEST_ENABLED = Boolean(process.env.PG_TEST_URL ?? process.env.RAG_DB_TEST)

const WS = 'a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1'
const USER = 'b2b2b2b2-b2b2-4b2b-b2b2-b2b2b2b2b2b2'
const ACC_WITH_BARRIER = 'c3c3c3c3-c3c3-4c3c-c3c3-c3c3c3c3c3c3'
const ACC_NO_BARRIER = 'd4d4d4d4-d4d4-4d4d-d4d4-d4d4d4d4d4d4'
const ACC_DELETED = 'e5e5e5e5-e5e5-4e5e-e5e5-e5e5e5e5e5e5'

const MEASURED_BARRIER_A = {
  score: 2.1,
  accessibility: 7.9,
  access_class: 'A',
  label: 'Ouvert probable',
  proxies: [],
  measurable: true,
  missing: [],
  corrections: [],
}

describe('accessSummary — le VRAI service, contre un VRAI Postgres migré', () => {
  const test = DB_TEST_ENABLED ? it : it.skip
  let client: Client | null = null
  let dataSource: DataSource | null = null
  let service: AccountAccessService | null = null

  beforeAll(async () => {
    if (!DB_TEST_ENABLED) return

    client = new Client({ connectionString: CONN })
    await client.connect()
    const q = (sql: string, params?: unknown[]) => client!.query(sql, params)

    // Nettoyage puis semis — même ordre que
    // `1786970000000-RagWorkspaceScope.db.spec.ts` : les comptes dépendent du
    // workspace, qui dépend de l'utilisateur.
    await q(`DELETE FROM accounts WHERE workspace_id = $1`, [WS])
    await q(`DELETE FROM workspaces WHERE id = $1`, [WS])
    await q(`DELETE FROM auth.users WHERE id = $1`, [USER])

    await q(
      `INSERT INTO auth.users (id, email, instance_id, aud, role)
       VALUES ($1, 'n18-test@bellum.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
       ON CONFLICT (id) DO NOTHING`,
      [USER],
    )
    // Le trigger de création de compte crée un workspace par défaut pour ce
    // user — on le retire pour ne garder QUE celui du test.
    await q(`DELETE FROM workspaces WHERE owner_user_id = $1`, [USER])
    await q(`INSERT INTO workspaces (id, owner_user_id, name) VALUES ($1, $2, 'ESN N18')`, [WS, USER])

    await q(
      `INSERT INTO accounts (id, user_id, workspace_id, company_name, status, raw_analysis)
       VALUES ($1, $2, $3, 'Avec barrière', 'completed', $4::jsonb)`,
      [ACC_WITH_BARRIER, USER, WS, JSON.stringify({ access_barrier: MEASURED_BARRIER_A })],
    )
    await q(
      `INSERT INTO accounts (id, user_id, workspace_id, company_name, status, raw_analysis)
       VALUES ($1, $2, $3, 'Sans barrière', 'analyzing', '{}'::jsonb)`,
      [ACC_NO_BARRIER, USER, WS],
    )
    await q(
      `INSERT INTO accounts (id, user_id, workspace_id, company_name, status, raw_analysis)
       VALUES ($1, $2, $3, 'Supprimé', 'deleted', $4::jsonb)`,
      [ACC_DELETED, USER, WS, JSON.stringify({ access_barrier: MEASURED_BARRIER_A })],
    )

    dataSource = new DataSource({
      type: 'postgres',
      url: CONN,
      entities: [AccountEntity],
      synchronize: false,
      logging: false,
    })
    await dataSource.initialize()
    const accounts = dataSource.getRepository(AccountEntity)
    // `facts` et `entities` ne sont jamais touchés par `accessSummary` — de
    // vrais stubs suffisent, exactement comme dans `access-summary.spec.ts`.
    const facts = { find: jest.fn(), query: jest.fn(), save: jest.fn(), create: jest.fn() }
    const entities = { find: jest.fn() }
    service = new AccountAccessService(facts as never, accounts, entities as never)
  })

  afterAll(async () => {
    if (client) {
      await client.query(`DELETE FROM accounts WHERE workspace_id = $1`, [WS])
      await client.query(`DELETE FROM workspaces WHERE id = $1`, [WS])
      await client.query(`DELETE FROM auth.users WHERE id = $1`, [USER])
      await client.end().catch(() => undefined)
    }
    await dataSource?.destroy().catch(() => undefined)
  })

  test('sur un workspace SANS compte, la requête s’exécute — le `select` objet sur `raw_analysis` n’est pas du SQL invalide', async () => {
    await expect(service!.accessSummary('00000000-0000-0000-0000-000000000000')).resolves.toEqual([])
  })

  test('sur un workspace avec des comptes, la barrière stockée en jsonb est lue correctement et les supprimés sont exclus', async () => {
    const summary = await service!.accessSummary(WS)

    expect(summary.sort((a, b) => a.accountId.localeCompare(b.accountId))).toEqual(
      [
        { accountId: ACC_WITH_BARRIER, accessClass: 'A' },
        { accountId: ACC_NO_BARRIER, accessClass: null },
      ].sort((a, b) => a.accountId.localeCompare(b.accountId)),
    )
    expect(summary.map(row => row.accountId)).not.toContain(ACC_DELETED)
  })
})
