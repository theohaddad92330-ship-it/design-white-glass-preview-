import type { QueryRunner } from 'typeorm'
import { SubmissionSubstatusPresentationDecision1796321396100 } from '../1796321396100-SubmissionSubstatusPresentationDecision'

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

describe('SubmissionSubstatusPresentationDecision1796321396100', () => {
  it('élargit la contrainte CHECK aux cinq nouveaux sous-statuts, sans retirer les seize existants', async () => {
    const { runner, queries } = createRunner()
    await new SubmissionSubstatusPresentationDecision1796321396100().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('ADD CONSTRAINT submissions_substatus_check')
    for (const value of [
      'to_qualify',
      'archived',
      'presentation_failed',
      'presented_manually',
      'to_pursue',
      'to_clarify',
      'to_negotiate',
    ]) {
      expect(flat).toContain(value)
    }
  })

  it('est idempotente (DROP CONSTRAINT IF EXISTS avant de la reposer)', async () => {
    const { runner, queries } = createRunner()
    await new SubmissionSubstatusPresentationDecision1796321396100().up(runner)
    expect(queries.map(normalize)[0]).toBe(
      'ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_substatus_check',
    )
  })

  it('down() purge les lignes des cinq nouvelles natures avant de resserrer la contrainte', async () => {
    const { runner, queries } = createRunner()
    await new SubmissionSubstatusPresentationDecision1796321396100().down(runner)
    const flat = queries.map(normalize)
    expect(flat[0]).toContain('UPDATE submissions SET substatus = NULL')
    expect(flat[0]).toContain('presentation_failed')

    // La contrainte reposée par `down()` ne connaît plus les cinq nouvelles valeurs.
    const restoredConstraint = flat.find(q => q.includes('ADD CONSTRAINT submissions_substatus_check'))
    expect(restoredConstraint).toContain('archived')
    expect(restoredConstraint).not.toContain('presentation_failed')
    expect(restoredConstraint).not.toContain('to_pursue')
  })
})
