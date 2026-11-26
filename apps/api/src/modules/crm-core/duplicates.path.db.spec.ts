import { Pool } from 'pg'
import { DuplicatesSweeper } from './duplicates.sweeper'
import { GovernanceService } from './governance.service'

/**
 * #3490 — LE CHEMIN COMPLET SUR UNE VRAIE BASE : ouverture de la liste →
 * balayage → écriture → lecture.
 *
 * Les tests du balayeur répondent aux requêtes par une SOUS-CHAÎNE du SQL : une
 * colonne mal nommée, un paramètre mal typé ou un filtre qui exclut tout y
 * passent. Ici le SQL RÉEL du balayeur ET de la lecture (`GovernanceService`,
 * jamais réécrits — importés) tourne sur Postgres.
 *
 * Les tables sont des tables TEMPORAIRES d'UNE seule connexion (`max: 1`) : elles
 * masquent les vraies pendant la session et disparaissent avec elle — la base
 * pointée n'est jamais modifiée. OPT-IN comme les autres preuves adossées à une
 * base (`access-summary.db.spec.ts`) : sans `PG_TEST_URL`, la CI reste verte sans
 * base ; avec lui, une base injoignable fait ÉCHOUER le run.
 *
 *   PG_TEST_URL="postgresql://postgres:…@localhost:5432/postgres" \
 *     npx jest src/modules/crm-core/duplicates.path.db
 *
 * Mesuré le 02/10/2026 (Postgres 16) : la paire « Société Générale » /
 * « Societe Generale » est proposée puis lue, sur le schéma des migrations
 * (`1789411862049-Governance.ts` pour `duplicate_pairs`).
 */
const CONN = process.env.PG_TEST_URL
const test = CONN ? it : it.skip

const WS = '11111111-1111-4111-8111-111111111111'
const SG1 = '0125b778-807b-4025-a363-b31bfc819af1'
const SG2 = '8b25ec87-68cb-49e1-a910-89223f12034f'

describe('doublons de comptes — du balayage à la liste, SQL réel', () => {
  let pool: Pool | null = null

  beforeAll(async () => {
    if (!CONN) return
    pool = new Pool({ connectionString: CONN, max: 1 })
    await pool.query(`
      CREATE TEMP TABLE workspaces (id uuid PRIMARY KEY, is_demo boolean NOT NULL DEFAULT false);
      CREATE TEMP TABLE profiles (user_id uuid, first_name text, last_name text, email text);
      CREATE TEMP TABLE accounts (id uuid PRIMARY KEY, workspace_id uuid, company_name text NOT NULL,
        status text NOT NULL DEFAULT 'completed', merged_into_id uuid, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TEMP TABLE contacts (id uuid PRIMARY KEY, workspace_id uuid, account_id uuid, full_name text, email text,
        deleted_at timestamptz, hidden boolean NOT NULL DEFAULT false, anonymized_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now());
      CREATE TEMP TABLE duplicate_pairs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, entity_type text NOT NULL,
        pair_key text NOT NULL, left_id uuid NOT NULL, right_id uuid NOT NULL, reason text NOT NULL,
        confidence numeric(4, 3) NOT NULL, decision text NOT NULL DEFAULT 'pending', decided_at timestamptz,
        decided_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT duplicate_pairs_entity_check CHECK (entity_type IN ('account', 'contact')),
        CONSTRAINT duplicate_pairs_decision_check CHECK (decision IN ('pending', 'merged', 'dismissed')));
      CREATE UNIQUE INDEX duplicate_pairs_unique ON duplicate_pairs (workspace_id, entity_type, pair_key);
    `)
    await pool.query(`INSERT INTO workspaces (id) VALUES ($1)`, [WS])
    await pool.query(
      `INSERT INTO accounts (id, workspace_id, company_name) VALUES ($1, $3, 'Société Générale'), ($2, $3, 'Societe Generale')`,
      [SG1, SG2, WS],
    )
  })

  afterAll(async () => {
    await pool?.end()
  })

  function build() {
    const manager = {
      query: async (sql: string, params?: unknown[]) => (await pool!.query(sql, params)).rows,
    }
    const repo = { manager } as never
    const governance = new GovernanceService(undefined as never, undefined as never, undefined as never, repo, {
      resolveActiveWorkspace: async () => ({ workspaceId: WS }),
    } as never)
    return { governance, sweeper: new DuplicatesSweeper(repo, governance) }
  }

  test('ouvrir la liste propose la paire, la lit, et rapporte ce qui a été examiné', async () => {
    const { governance, sweeper } = build()

    const scan = await sweeper.refreshWorkspace(WS)
    const items = await governance.listDuplicates('user-1')

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ entityType: 'account', decision: 'pending' })
    expect([items[0]!.leftLabel, items[0]!.rightLabel].sort()).toEqual(['Societe Generale', 'Société Générale'])
    expect(scan).toMatchObject({ accountsExamined: 2, contactsExamined: 0, pairsDetected: 1, failed: false })
  })

  test('une paire déjà tranchée ne revient pas, et le rapport le dit', async () => {
    const { governance, sweeper } = build()
    const [pair] = await governance.listDuplicates('user-1')
    await pool!.query(`UPDATE duplicate_pairs SET decision = 'dismissed' WHERE id = $1`, [pair!.id])

    const scan = await sweeper.refreshWorkspace(WS)

    expect(await governance.listDuplicates('user-1')).toHaveLength(0)
    expect(scan).toMatchObject({ pairsDetected: 1, alreadyKnown: 1 })
  })
})
