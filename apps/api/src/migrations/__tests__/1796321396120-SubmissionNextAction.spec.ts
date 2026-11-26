import type { QueryRunner } from 'typeorm'
import { SubmissionNextAction1796321396120 } from '../1796321396120-SubmissionNextAction'

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

describe('SubmissionNextAction1796321396120', () => {
  it('ajoute les trois colonnes, NULLABLES, sans défaut', async () => {
    const { runner, queries } = createRunner()
    await new SubmissionNextAction1796321396120().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS next_action_label text NULL')
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS next_action_due_at date NULL')
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS next_action_owner_id uuid NULL')
  })

  it('pose une contrainte qui exige les trois champs ENSEMBLE, ou aucun', async () => {
    const { runner, queries } = createRunner()
    await new SubmissionNextAction1796321396120().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('ADD CONSTRAINT submissions_next_action_check')
    expect(flat).toContain('next_action_label IS NULL AND next_action_due_at IS NULL AND next_action_owner_id IS NULL')
    expect(flat).toContain(
      'next_action_label IS NOT NULL AND next_action_due_at IS NOT NULL AND next_action_owner_id IS NOT NULL',
    )
  })

  it('est idempotente (IF NOT EXISTS / DROP CONSTRAINT IF EXISTS)', async () => {
    const { runner } = createRunner()
    await expect(new SubmissionNextAction1796321396120().up(runner)).resolves.not.toThrow()
  })

  it('down() retire la contrainte puis les trois colonnes', async () => {
    const { runner, queries } = createRunner()
    await new SubmissionNextAction1796321396120().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS submissions_next_action_check')
    expect(flat).toContain('DROP COLUMN IF EXISTS next_action_owner_id')
    expect(flat).toContain('DROP COLUMN IF EXISTS next_action_due_at')
    expect(flat).toContain('DROP COLUMN IF EXISTS next_action_label')
  })
})
