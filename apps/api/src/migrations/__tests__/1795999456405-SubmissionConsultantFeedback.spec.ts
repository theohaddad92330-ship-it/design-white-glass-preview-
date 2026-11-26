import type { QueryRunner } from 'typeorm'
import { SubmissionConsultantFeedback1795999456405 } from '../1795999456405-SubmissionConsultantFeedback'

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

describe('SubmissionConsultantFeedback1795999456405', () => {
  it('crée la table, séparée de `submission_feedback`', async () => {
    const { runner, queries } = createRunner()
    await new SubmissionConsultantFeedback1795999456405().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('CREATE TABLE IF NOT EXISTS submission_consultant_feedback')
    expect(flat).toContain('REFERENCES submissions(id) ON DELETE CASCADE')
  })

  it('porte les huit axes, défaut « unknown » — rien de deviné', async () => {
    const { runner, queries } = createRunner()
    await new SubmissionConsultantFeedback1795999456405().up(runner)
    const flat = queries.map(normalize).join(' ')
    for (const axis of [
      'interest',
      'understanding',
      'manager',
      'mission',
      'conditions',
      'concerns',
      'availability',
      'decision',
    ]) {
      expect(flat).toContain(`${axis} text NOT NULL DEFAULT 'unknown'`)
    }
  })

  it('élargit la contrainte CHECK aux huit axes', async () => {
    const { runner, queries } = createRunner()
    await new SubmissionConsultantFeedback1795999456405().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('CONSTRAINT submission_consultant_feedback_verdicts_check')
  })

  it('est idempotente (IF NOT EXISTS)', async () => {
    const { runner } = createRunner()
    await expect(new SubmissionConsultantFeedback1795999456405().up(runner)).resolves.not.toThrow()
  })

  it('down() retire la table', async () => {
    const { runner, queries } = createRunner()
    await new SubmissionConsultantFeedback1795999456405().down(runner)
    expect(queries.map(normalize)).toEqual(['DROP TABLE IF EXISTS submission_consultant_feedback'])
  })
})
