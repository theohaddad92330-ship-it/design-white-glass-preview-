import type { QueryRunner } from 'typeorm'
import { SubmissionFeedbackAxesExtended1795999455405 } from '../1795999455405-SubmissionFeedbackAxesExtended'

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

describe('SubmissionFeedbackAxesExtended1795999455405', () => {
  it('ajoute les six nouveaux axes, additifs, défaut « unknown » pour ne rien deviner', async () => {
    const { runner, queries } = createRunner()
    await new SubmissionFeedbackAxesExtended1795999455405().up(runner)
    const flat = queries.map(normalize)
    for (const column of ['seniority', 'context', 'availability', 'location', 'timing']) {
      expect(flat).toContain(
        `ALTER TABLE submission_feedback ADD COLUMN IF NOT EXISTS ${column} text NOT NULL DEFAULT 'unknown'`,
      )
    }
    expect(flat).toContain(
      `ALTER TABLE submission_feedback ADD COLUMN IF NOT EXISTS "other" text NOT NULL DEFAULT 'unknown'`,
    )
  })

  it('ajoute `learning`, nullable, sans DEFAULT — jamais un apprentissage inventé', async () => {
    const { runner, queries } = createRunner()
    await new SubmissionFeedbackAxesExtended1795999455405().up(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain('ALTER TABLE submission_feedback ADD COLUMN IF NOT EXISTS learning text')
  })

  it('élargit la contrainte CHECK aux dix axes, AVANT tout code qui les écrit (GA-11/GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new SubmissionFeedbackAxesExtended1795999455405().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('ADD CONSTRAINT submission_feedback_verdicts_check')
    expect(flat).toContain("seniority IN ('unknown', 'below', 'meets', 'above')")
    expect(flat).toContain("\"other\" IN ('unknown', 'below', 'meets', 'above')")
  })

  it('est idempotente (IF NOT EXISTS)', async () => {
    const { runner } = createRunner()
    await expect(new SubmissionFeedbackAxesExtended1795999455405().up(runner)).resolves.not.toThrow()
  })

  it('down() retire les six colonnes et `learning`, restaure la contrainte à quatre axes', async () => {
    const { runner, queries } = createRunner()
    await new SubmissionFeedbackAxesExtended1795999455405().down(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain('ALTER TABLE submission_feedback DROP COLUMN IF EXISTS learning')
    expect(flat).toContain('ALTER TABLE submission_feedback DROP COLUMN IF EXISTS "other"')
    expect(flat).toContain('ALTER TABLE submission_feedback DROP COLUMN IF EXISTS seniority')
  })
})
