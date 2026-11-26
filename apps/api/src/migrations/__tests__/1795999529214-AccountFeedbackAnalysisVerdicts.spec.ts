import type { QueryRunner } from 'typeorm'
import { AccountFeedbackAnalysisVerdicts1795999529214 } from '../1795999529214-AccountFeedbackAnalysisVerdicts'

/** Capture every SQL statement the migration issues (no live DB needed). */
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

// #2076.9-.12 — GA-11/GA-12 : la contrainte s'élargit AVANT que le code écrive
// les nouveaux verdicts.
describe('AccountFeedbackAnalysisVerdicts1795999529214', () => {
  it('élargit la contrainte au vocabulaire complet, sans perdre les valeurs existantes', async () => {
    const { runner, queries } = createRunner()
    await new AccountFeedbackAnalysisVerdicts1795999529214().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS account_feedback_verdict_check')
    expect(sql).toContain(
      "ADD CONSTRAINT account_feedback_verdict_check CHECK (verdict IN ('utile', 'inutile', 'faux', 'obsolete', 'juste', 'partiel', 'manquant'))",
    )
  })

  it('AJOUT SEULEMENT côté montée : aucune autre table touchée', async () => {
    const { runner, queries } = createRunner()
    await new AccountFeedbackAnalysisVerdicts1795999529214().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).not.toContain('account_feedback_target_check')
    expect(sql).not.toContain('DROP TABLE')
  })

  it('sait redescendre : purge les 3 verdicts neufs puis resserre la contrainte', async () => {
    const { runner, queries } = createRunner()
    await new AccountFeedbackAnalysisVerdicts1795999529214().down(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain("DELETE FROM account_feedback WHERE verdict IN ('juste', 'partiel', 'manquant')")
    expect(sql).toContain(
      "ADD CONSTRAINT account_feedback_verdict_check CHECK (verdict IN ('utile', 'inutile', 'faux', 'obsolete'))",
    )
  })
})
