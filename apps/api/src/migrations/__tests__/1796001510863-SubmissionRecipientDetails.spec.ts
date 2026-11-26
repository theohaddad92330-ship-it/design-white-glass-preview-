import type { QueryRunner } from 'typeorm'
import { SubmissionRecipientDetails1796001510863 } from '../1796001510863-SubmissionRecipientDetails'

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

describe('SubmissionRecipientDetails1796001510863', () => {
  it('ajoute les cinq colonnes, toutes NULLABLES, SANS défaut — #2177.6/.8/.24/.28/.30', async () => {
    const { runner, queries } = createRunner()
    await new SubmissionRecipientDetails1796001510863().up(runner)
    const flat = queries.map(normalize)
    expect(
      flat.some(q => q.startsWith('ALTER TABLE submissions ADD COLUMN IF NOT EXISTS recipient_contact_id uuid')),
    ).toBe(true)
    expect(flat).toContain('ALTER TABLE submissions ADD COLUMN IF NOT EXISTS channel text')
    expect(flat).toContain('ALTER TABLE submissions ADD COLUMN IF NOT EXISTS message text')
    expect(flat).toContain('ALTER TABLE submissions ADD COLUMN IF NOT EXISTS availability text')
    expect(flat).toContain('ALTER TABLE submissions ADD COLUMN IF NOT EXISTS conditions text')
    expect(flat.some(q => q.includes('DEFAULT'))).toBe(false)
  })

  it('contraint le canal aux QUATRE valeurs déjà canoniques, NULL autorisé', async () => {
    const { runner, queries } = createRunner()
    await new SubmissionRecipientDetails1796001510863().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('ADD CONSTRAINT submissions_channel_check')
    expect(flat).toContain('channel IS NULL OR channel IN')
    expect(flat).toContain("'phone', 'email', 'linkedin', 'meeting'")
  })

  it('référence le contact destinataire, jamais un id orphelin', async () => {
    const { runner, queries } = createRunner()
    await new SubmissionRecipientDetails1796001510863().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('REFERENCES contacts(id) ON DELETE SET NULL')
  })

  it('est idempotente (IF NOT EXISTS)', async () => {
    const { runner } = createRunner()
    await expect(new SubmissionRecipientDetails1796001510863().up(runner)).resolves.not.toThrow()
  })

  it('down() retire la contrainte puis les cinq colonnes', async () => {
    const { runner, queries } = createRunner()
    await new SubmissionRecipientDetails1796001510863().down(runner)
    const flat = queries.map(normalize)
    expect(flat[0]).toBe('ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_channel_check')
    expect(flat).toContain('ALTER TABLE submissions DROP COLUMN IF EXISTS recipient_contact_id')
    expect(flat).toContain('ALTER TABLE submissions DROP COLUMN IF EXISTS channel')
    expect(flat).toContain('ALTER TABLE submissions DROP COLUMN IF EXISTS message')
    expect(flat).toContain('ALTER TABLE submissions DROP COLUMN IF EXISTS availability')
    expect(flat).toContain('ALTER TABLE submissions DROP COLUMN IF EXISTS conditions')
  })
})
