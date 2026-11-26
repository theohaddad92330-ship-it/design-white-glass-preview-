import type { QueryRunner } from 'typeorm'
import { MissionRiskInvoiceBlocked1796322190000 } from '../1796322190000-MissionRiskInvoiceBlocked'

/**
 * Les dix valeurs de `missionRiskSchema` AU MOMENT de cette migration — même
 * instantané que `1796321507560-MissionRiskResolutions.spec.ts` : depuis
 * `1796610003098` (L15, #2408.3/.16/.17/.20/.21) le schéma porte cinq valeurs
 * de plus, et l'exhaustivité vis-à-vis du schéma COURANT passe au test de
 * cette migration-là, la plus récente qui touche la contrainte.
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
  'invoice_blocked',
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
  await new MissionRiskInvoiceBlocked1796322190000().up(runner)
  return queries.map(normalize)
}

describe('MissionRiskInvoiceBlocked1796322190000 (#2411.6, reste épopée #2881)', () => {
  it('DROP puis ADD la même contrainte nommée — un CHECK ne s’ALTER pas en place', async () => {
    const flat = await up()
    expect(flat).toContain(
      'ALTER TABLE mission_risk_resolutions DROP CONSTRAINT IF EXISTS mission_risk_resolutions_risk_check',
    )
    const add = flat.find(q =>
      q.startsWith('ALTER TABLE mission_risk_resolutions ADD CONSTRAINT mission_risk_resolutions_risk_check'),
    )
    expect(add).toBeDefined()
  })

  it('le CHECK élargi couvre EXACTEMENT les valeurs de `missionRiskSchema` À CETTE DATE — GA-11/GA-12', async () => {
    const flat = await up()
    const add = flat.find(q => q.includes('ADD CONSTRAINT mission_risk_resolutions_risk_check')) ?? ''
    for (const risk of RISKS_AT_THIS_MIGRATION) expect(add).toContain(`'${risk}'`)
    const matches = add.match(/'[a-z_]+'/g) ?? []
    expect(matches).toHaveLength(RISKS_AT_THIS_MIGRATION.length)
  })

  it('contient bien la valeur neuve, `invoice_blocked`', async () => {
    const flat = await up()
    const add = flat.find(q => q.includes('ADD CONSTRAINT mission_risk_resolutions_risk_check')) ?? ''
    expect(add).toContain("'invoice_blocked'")
  })

  it('down restaure la liste à neuf valeurs — sans `invoice_blocked`', async () => {
    const { runner, queries } = createRunner()
    await new MissionRiskInvoiceBlocked1796322190000().down(runner)
    const flat = queries.map(normalize)
    const add = flat.find(q => q.includes('ADD CONSTRAINT mission_risk_resolutions_risk_check')) ?? ''
    expect(add).not.toContain('invoice_blocked')
    expect(add).toContain("'missing_owner'")
  })
})
