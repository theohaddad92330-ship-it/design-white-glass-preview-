import type { QueryRunner } from 'typeorm'
import { SubmissionSubstatus1795999454405 } from '../1795999454405-SubmissionSubstatus'

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

describe('SubmissionSubstatus1795999454405', () => {
  it('ajoute une colonne texte nullable, SANS défaut — un sous-statut ne se devine pas', async () => {
    const { runner, queries } = createRunner()
    await new SubmissionSubstatus1795999454405().up(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain('ALTER TABLE submissions ADD COLUMN IF NOT EXISTS substatus text')
    expect(flat.some(q => q.includes('DEFAULT'))).toBe(false)
  })

  it('pose la contrainte CHECK sur les seize valeurs, NULL autorisé', async () => {
    const { runner, queries } = createRunner()
    await new SubmissionSubstatus1795999454405().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('ADD CONSTRAINT submissions_substatus_check')
    expect(flat).toContain('substatus IS NULL OR substatus IN')
    expect(flat).toContain('archived')
  })

  it('est idempotente (IF NOT EXISTS)', async () => {
    const { runner } = createRunner()
    await expect(new SubmissionSubstatus1795999454405().up(runner)).resolves.not.toThrow()
  })

  it('down() retire la contrainte puis la colonne', async () => {
    const { runner, queries } = createRunner()
    await new SubmissionSubstatus1795999454405().down(runner)
    expect(queries.map(normalize)).toEqual([
      'ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_substatus_check',
      'ALTER TABLE submissions DROP COLUMN IF EXISTS substatus',
    ])
  })
})
