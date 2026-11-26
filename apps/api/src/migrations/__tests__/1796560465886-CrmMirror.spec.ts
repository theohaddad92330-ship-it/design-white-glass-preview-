import type { QueryRunner } from 'typeorm'
import {
  CRM_MIRROR_ACTIVITY_KINDS,
  CRM_MIRROR_DEAL_STATUSES,
  CRM_MIRROR_TABLES,
  CRM_PROVIDERS,
} from '@bellum/contracts'
import { CrmMirror1796560465886 } from '../1796560465886-CrmMirror'

function createRunner(): { runner: QueryRunner; queries: string[] } {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  return { runner, queries }
}

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

async function upQueries(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new CrmMirror1796560465886().up(runner)
  return queries.map(normalize)
}

const createOf = (queries: string[], table: string): string =>
  queries.find(sql => sql.startsWith(`CREATE TABLE IF NOT EXISTS ${table} `)) ?? ''

// SYNC-A (19/10/2026) — le miroir CRM : la forme du SQL.
describe('CrmMirror1796560465886 (SYNC-A A.2)', () => {
  it('ajoute seulement : aucune suppression, aucune mise à jour de l’existant', async () => {
    const flat = (await upQueries()).join(' ; ')
    expect(flat).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i)
    expect(flat).not.toMatch(/\bDELETE\s+FROM\b/i)
    expect(flat).not.toMatch(/\bUPDATE\s+\w+\s+SET\b/i)
  })

  it.each(CRM_MIRROR_TABLES)('%s : clé miroir, archivage, champs propres, RLS par espace', async table => {
    const queries = await upQueries()
    const create = createOf(queries, table)
    expect(create).not.toBe('')
    for (const column of [
      'workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE',
      'provider text NOT NULL',
      'external_id text NOT NULL',
      'crm_updated_at timestamptz',
      'crm_url text',
      "crm_custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb",
      'archived_at timestamptz',
    ])
      expect(create).toContain(column)
    expect(create).toContain(`CONSTRAINT ${table}_external_unique UNIQUE (workspace_id, provider, external_id)`)
    const providerCheck = create.slice(create.indexOf(`${table}_provider_check`)).slice(0, 200)
    for (const provider of [...CRM_PROVIDERS, 'demo']) expect(providerCheck).toContain(`'${provider}'`)
    const flat = queries.join(' ; ')
    expect(flat).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
    expect(flat).toContain(
      `CREATE POLICY "${table}_member_read" ON ${table} FOR SELECT USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))`,
    )
  })

  it('les CHECK couvrent le contrat AVANT le code qui écrit (GA-12)', async () => {
    const queries = await upQueries()
    const deals = createOf(queries, 'crm_deals')
    const status = deals.slice(deals.indexOf('crm_deals_status_check')).slice(0, 120)
    for (const value of CRM_MIRROR_DEAL_STATUSES) expect(status).toContain(`'${value}'`)
    const activities = createOf(queries, 'crm_activities')
    const kind = activities.slice(activities.indexOf('crm_activities_kind_check')).slice(0, 160)
    for (const value of CRM_MIRROR_ACTIVITY_KINDS) expect(kind).toContain(`'${value}'`)
  })

  it('une activité ne garde pas le corps du message (doctrine c96)', async () => {
    const activities = createOf(await upQueries(), 'crm_activities')
    expect(activities).not.toMatch(/\b(body|content|description)\b/)
    expect(activities).toContain('subject text')
  })

  it('affaires et activités : compte lié nullable (SET NULL) et index (workspace_id, account_id)', async () => {
    const queries = await upQueries()
    for (const table of ['crm_deals', 'crm_activities']) {
      expect(createOf(queries, table)).toContain('account_id uuid REFERENCES accounts(id) ON DELETE SET NULL')
      expect(queries).toContain(
        `CREATE INDEX IF NOT EXISTS ${table}_workspace_account_idx ON ${table} (workspace_id, account_id)`,
      )
    }
    expect(createOf(queries, 'crm_deals')).toContain("contact_external_ids text[] NOT NULL DEFAULT '{}'")
  })

  it('une étape appartient à son pipeline (cascade)', async () => {
    const stages = createOf(await upQueries(), 'crm_stages')
    expect(stages).toContain('pipeline_id uuid NOT NULL REFERENCES crm_pipelines(id) ON DELETE CASCADE')
  })

  it('comptes et contacts : colonnes CRM ajoutées si absentes', async () => {
    const flat = (await upQueries()).join(' ; ')
    for (const table of ['accounts', 'contacts'])
      for (const column of [
        'crm_owner_external_id text',
        "crm_custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb",
        'crm_updated_at timestamptz',
        'crm_url text',
      ])
        expect(flat).toContain(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column}`)
  })

  it('down() retire seulement ce qui a été ajouté', async () => {
    const { runner, queries } = createRunner()
    await new CrmMirror1796560465886().down(runner)
    const flat = queries.map(normalize).join(' ; ')
    for (const table of CRM_MIRROR_TABLES) expect(flat).toContain(`DROP TABLE IF EXISTS ${table}`)
    expect(flat).not.toMatch(/DROP TABLE IF EXISTS (accounts|contacts)\b/)
  })
})
