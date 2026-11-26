import type { QueryRunner } from 'typeorm'
import { CommercialTransitionsSignalSubject1796340800001 } from '../1796340800001-CommercialTransitionsSignalSubject'

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

describe('CommercialTransitionsSignalSubject1796340800001', () => {
  it('up() élargit la contrainte à la sixième valeur, sans en perdre aucune (GA-11)', async () => {
    const { runner, queries } = createRunner()
    await new CommercialTransitionsSignalSubject1796340800001().up(runner)
    const sql = normalize(queries[0] ?? '')
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS commercial_transitions_subject_type_check')
    expect(sql).toContain(
      "ADD CONSTRAINT commercial_transitions_subject_type_check CHECK (subject_type IN ('need', 'shortlist', 'submission', 'mission', 'opportunity', 'signal'))",
    )
  })

  it('down() revient aux cinq valeurs précédentes', async () => {
    const { runner, queries } = createRunner()
    await new CommercialTransitionsSignalSubject1796340800001().down(runner)
    const sql = normalize(queries[0] ?? '')
    expect(sql).toContain(
      "ADD CONSTRAINT commercial_transitions_subject_type_check CHECK (subject_type IN ('need', 'shortlist', 'submission', 'mission', 'opportunity'))",
    )
  })
})
