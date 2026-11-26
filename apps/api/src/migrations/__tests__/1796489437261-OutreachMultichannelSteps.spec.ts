import type { QueryRunner } from 'typeorm'
import { OUTREACH_DELAY_UNITS, outreachStepKindSchema } from '@bellum/contracts'
import { OutreachMultichannelSteps1796489437261 } from '../1796489437261-OutreachMultichannelSteps'

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

// Lot L-B (#4165) — la contrainte SQL est élargie AVANT le code qui écrit les nouvelles natures (GA-11/GA-12).
describe('OutreachMultichannelSteps1796489437261', () => {
  it('élargit le CHECK de kind à TOUTES les natures du contrat, sans en retirer', async () => {
    const { runner, queries } = createRunner()
    await new OutreachMultichannelSteps1796489437261().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('CONSTRAINT outreach_sequence_steps_kind_check')
    for (const kind of outreachStepKindSchema.options) expect(flat).toContain(`'${kind}'`)
  })

  it('ajoute delay_unit avec le défaut calendar_days (l’existant ne change pas en silence) et son CHECK', async () => {
    const { runner, queries } = createRunner()
    await new OutreachMultichannelSteps1796489437261().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain("ADD COLUMN IF NOT EXISTS delay_unit text NOT NULL DEFAULT 'calendar_days'")
    expect(flat).toContain('CONSTRAINT outreach_sequences_delay_unit_check')
    for (const unit of OUTREACH_DELAY_UNITS) expect(flat).toContain(`'${unit}'`)
  })

  it('ajoute les deux colonnes de la pause vacances, nullables', async () => {
    const { runner, queries } = createRunner()
    await new OutreachMultichannelSteps1796489437261().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS vacation_paused_at timestamptz')
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS vacation_until timestamptz')
  })

  it('down rend les trois natures historiques seulement après avoir retiré les lignes neuves', async () => {
    const { runner, queries } = createRunner()
    await new OutreachMultichannelSteps1796489437261().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain(
      "UPDATE outreach_sequence_steps SET kind = 'task' WHERE kind IN ('linkedin_invite', 'linkedin_message', 'call')",
    )
    expect(flat).toContain("kind IN ('email', 'reminder', 'task')")
    expect(flat).toContain('DROP COLUMN IF EXISTS delay_unit')
  })
})
