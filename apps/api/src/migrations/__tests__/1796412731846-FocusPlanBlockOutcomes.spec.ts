import type { QueryRunner } from 'typeorm'
import { FocusPlanBlockOutcomes1796412731846 } from '../1796412731846-FocusPlanBlockOutcomes'

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

describe('FocusPlanBlockOutcomes1796412731846', () => {
  it('crée la table, scopée par utilisateur', async () => {
    const { runner, queries } = createRunner()
    await new FocusPlanBlockOutcomes1796412731846().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('CREATE TABLE IF NOT EXISTS focus_plan_block_outcomes')
    expect(flat).toContain('user_id uuid NOT NULL')
    expect(flat).toContain('external_event_id text NOT NULL')
  })

  it('couvre les TROIS états déclarés au CHECK NOMMÉ, jamais moins (GA-12/GA-177)', async () => {
    const { runner, queries } = createRunner()
    await new FocusPlanBlockOutcomes1796412731846().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('CONSTRAINT focus_plan_block_outcomes_outcome_check CHECK (outcome IN')
    for (const outcome of ['realized', 'interrupted', 'postponed']) expect(flat).toContain(`'${outcome}'`)
  })

  it('une seule ligne par (utilisateur, évènement) — upsertable, une correction gagne toujours', async () => {
    const { runner, queries } = createRunner()
    await new FocusPlanBlockOutcomes1796412731846().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('CONSTRAINT focus_plan_block_outcomes_unique UNIQUE (user_id, external_event_id)')
  })

  it('est idempotente (IF NOT EXISTS)', async () => {
    const { runner } = createRunner()
    await expect(new FocusPlanBlockOutcomes1796412731846().up(runner)).resolves.not.toThrow()
  })

  it('down() n’est pas supporté (le dépôt archive, il ne réécrit pas)', async () => {
    await expect(new FocusPlanBlockOutcomes1796412731846().down()).rejects.toThrow('down migrations are not supported')
  })
})
