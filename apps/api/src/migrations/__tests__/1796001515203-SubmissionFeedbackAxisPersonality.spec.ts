import type { QueryRunner } from 'typeorm'
import { SubmissionFeedbackAxisPersonality1796001515203 } from '../1796001515203-SubmissionFeedbackAxisPersonality'

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

describe('SubmissionFeedbackAxisPersonality1796001515203', () => {
  it('#2178.29 — ajoute la colonne « personality », additive, défaut « unknown » pour ne rien deviner', async () => {
    const { runner, queries } = createRunner()
    await new SubmissionFeedbackAxisPersonality1796001515203().up(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain(
      `ALTER TABLE submission_feedback ADD COLUMN IF NOT EXISTS personality text NOT NULL DEFAULT 'unknown'`,
    )
  })

  it('élargit la contrainte CHECK à onze axes, AVANT tout code qui les écrit (GA-11/GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new SubmissionFeedbackAxisPersonality1796001515203().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('ADD CONSTRAINT submission_feedback_verdicts_check')
    expect(flat).toContain("personality IN ('unknown', 'below', 'meets', 'above')")
    // Les dix axes précédents restent couverts — une contrainte qui RÉTRÉCIT
    // rejetterait des lignes déjà écrites (GA-11).
    expect(flat).toContain("timing IN ('unknown', 'below', 'meets', 'above')")
    expect(flat).toContain("\"other\" IN ('unknown', 'below', 'meets', 'above')")
  })

  it('est idempotente (IF NOT EXISTS)', async () => {
    const { runner } = createRunner()
    await expect(new SubmissionFeedbackAxisPersonality1796001515203().up(runner)).resolves.not.toThrow()
  })

  it('down() retire la colonne et restaure la contrainte aux dix axes', async () => {
    const { runner, queries } = createRunner()
    await new SubmissionFeedbackAxisPersonality1796001515203().down(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain('ALTER TABLE submission_feedback DROP COLUMN IF EXISTS personality')
    const constraintQuery = flat.find(query => query.includes('ADD CONSTRAINT submission_feedback_verdicts_check'))
    expect(constraintQuery).not.toContain('personality')
  })
})
