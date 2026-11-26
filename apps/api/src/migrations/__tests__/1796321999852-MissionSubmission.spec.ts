import type { QueryRunner } from 'typeorm'
import { MissionSubmission1796321999852 } from '../1796321999852-MissionSubmission'

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

describe('MissionSubmission1796321999852', () => {
  it('ajoute submission_id, NULLABLE, référencée sur submissions(id)', async () => {
    const { runner, queries } = createRunner()
    await new MissionSubmission1796321999852().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS submission_id uuid NULL REFERENCES submissions(id)')
  })

  it('pose un index sur submission_id', async () => {
    const { runner, queries } = createRunner()
    await new MissionSubmission1796321999852().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('CREATE INDEX IF NOT EXISTS missions_submission_idx ON missions (submission_id)')
  })

  it('est idempotente (IF NOT EXISTS)', async () => {
    const { runner } = createRunner()
    await expect(new MissionSubmission1796321999852().up(runner)).resolves.not.toThrow()
  })

  it('down() retire l’index puis la colonne', async () => {
    const { runner, queries } = createRunner()
    await new MissionSubmission1796321999852().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('DROP INDEX IF EXISTS missions_submission_idx')
    expect(flat).toContain('DROP COLUMN IF EXISTS submission_id')
  })
})
