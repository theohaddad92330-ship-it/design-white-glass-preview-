import type { QueryRunner } from 'typeorm'
import { MissionRiskResolutions1796321507560 } from '../1796321507560-MissionRiskResolutions'

/**
 * Les neuf valeurs de `missionRiskSchema` AU MOMENT de cette migration — pas
 * l'import live du schéma courant. Une migration est un instantané : depuis
 * `1796322190000-MissionRiskInvoiceBlocked.ts` (#2411.6), le schéma porte une
 * dixième valeur (`invoice_blocked`) que CETTE contrainte, plus ancienne,
 * n'a jamais portée et ne doit pas se voir reprocher de ne pas porter.
 * L'exhaustivité vis-à-vis du schéma COURANT est désormais la responsabilité
 * du test de la migration la plus récente qui touche cette contrainte.
 */
const RISKS_AT_THIS_MIGRATION = [
  'renewal_not_started',
  'timesheet_disputed',
  'timesheet_missing',
  'margin_at_risk',
  'margin_unknown',
  'no_end_date',
  'missing_po',
  'ending_soon',
  'missing_owner',
] as const

/** Capture chaque instruction SQL (aucune base réelle). */
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

async function up(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new MissionRiskResolutions1796321507560().up(runner)
  return queries.map(normalize)
}

describe('MissionRiskResolutions1796321507560 (#2411.11, reste épopée #2881)', () => {
  it('crée la table : espace, mission, risque, clé composite', async () => {
    const create = (await up()).find(q => q.includes('CREATE TABLE IF NOT EXISTS mission_risk_resolutions'))
    expect(create).toBeDefined()
    expect(create).toContain('workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE')
    expect(create).toContain('mission_id uuid NOT NULL REFERENCES missions (id) ON DELETE CASCADE')
    expect(create).toContain('resolved_at timestamptz')
    expect(create).toContain('mission_updated_at_snapshot timestamptz NOT NULL')
    expect(create).toContain('PRIMARY KEY (mission_id, risk)')
  })

  it('le CHECK sur `risk` couvre exactement les valeurs de `missionRiskSchema` À CETTE DATE — GA-11/GA-12', async () => {
    const create = (await up()).find(q => q.includes('CREATE TABLE IF NOT EXISTS mission_risk_resolutions')) ?? ''
    for (const risk of RISKS_AT_THIS_MIGRATION) expect(create).toContain(`'${risk}'`)
    // Aucune valeur inconnue glissée dans la contrainte : le compte doit correspondre exactement.
    const matches = create.match(/'[a-z_]+'/g) ?? []
    expect(matches).toHaveLength(RISKS_AT_THIS_MIGRATION.length)
  })

  it('index partiel sur les résolutions actives (`resolved_at IS NOT NULL`)', async () => {
    const flat = await up()
    const index = flat.find(q => q.includes('CREATE INDEX IF NOT EXISTS idx_mission_risk_resolutions_active'))
    expect(index).toContain('ON mission_risk_resolutions (mission_id)')
    expect(index).toContain('WHERE resolved_at IS NOT NULL')
  })

  it('RLS activée, une seule politique de LECTURE par appartenance à l’espace — aucune politique d’écriture', async () => {
    const flat = await up()
    expect(flat).toContain('ALTER TABLE mission_risk_resolutions ENABLE ROW LEVEL SECURITY')
    const policies = flat.filter(q => q.startsWith('CREATE POLICY') && q.includes('mission_risk_resolutions'))
    expect(policies).toHaveLength(1)
    expect(policies[0]).toContain('FOR SELECT')
    expect(policies[0]).toContain(
      'USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))',
    )
  })

  it('down retire la table (table neuve, sans donnée à préserver)', async () => {
    const { runner, queries } = createRunner()
    await new MissionRiskResolutions1796321507560().down(runner)
    expect(queries.map(normalize)).toContain('DROP TABLE IF EXISTS mission_risk_resolutions')
  })
})
