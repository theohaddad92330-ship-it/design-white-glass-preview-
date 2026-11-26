import type { QueryRunner } from 'typeorm'
import { FOCUS_PLAN_ACTUAL_MINUTES_MAX, FOCUS_PLAN_OUTCOME_NOTE_MAX } from '@bellum/contracts'
import { FocusPlanBlockOutcomeDeclared1796413344271 } from '../1796413344271-FocusPlanBlockOutcomeDeclared'

async function sqlOf(): Promise<string> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  await new FocusPlanBlockOutcomeDeclared1796413344271().up(runner)
  return queries.map(q => q.replace(/\s+/g, ' ').trim()).join(' ')
}

describe('FocusPlanBlockOutcomeDeclared1796413344271', () => {
  it('ajoute les deux colonnes NULLABLES, idempotemment', async () => {
    const flat = await sqlOf()
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS result_note text')
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS actual_minutes integer')
    expect(flat).not.toMatch(/result_note text NOT NULL|actual_minutes integer NOT NULL/)
  })

  it('pose des CHECK NOMMÉS dont les bornes SONT celles du contrat (GA-12/GA-177)', async () => {
    const flat = await sqlOf()
    expect(flat).toContain('CONSTRAINT focus_plan_block_outcomes_note_length_check')
    expect(flat).toContain(`BETWEEN 1 AND ${FOCUS_PLAN_OUTCOME_NOTE_MAX}`)
    expect(flat).toContain('CONSTRAINT focus_plan_block_outcomes_minutes_check')
    expect(flat).toContain(`BETWEEN 1 AND ${FOCUS_PLAN_ACTUAL_MINUTES_MAX}`)
  })

  it('down() n’est pas supporté', async () => {
    await expect(new FocusPlanBlockOutcomeDeclared1796413344271().down()).rejects.toThrow(
      'down migrations are not supported',
    )
  })
})
