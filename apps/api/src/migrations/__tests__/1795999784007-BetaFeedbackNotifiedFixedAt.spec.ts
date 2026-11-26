import type { QueryRunner } from 'typeorm'
import { BetaFeedbackNotifiedFixedAt1795999784007 } from '../1795999784007-BetaFeedbackNotifiedFixedAt'

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

// #2444.10 — GA-11/GA-12 : la colonne précède le code qui écrit `notified_fixed_at`.
describe('BetaFeedbackNotifiedFixedAt1795999784007', () => {
  it('ajoute `beta_feedback.notified_fixed_at`, timestamptz, NULLABLE, sans défaut deviné', async () => {
    const { runner, queries } = createRunner()
    await new BetaFeedbackNotifiedFixedAt1795999784007().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS notified_fixed_at timestamptz')
    expect(sql).not.toContain('DEFAULT')
    expect(sql).not.toContain('NOT NULL')
  })

  it('AJOUT SEULEMENT : la montée ne touche à aucune autre colonne', async () => {
    const { runner, queries } = createRunner()
    await new BetaFeedbackNotifiedFixedAt1795999784007().up(runner)
    const sql = normalize(queries.join(' '))
    for (const column of ['user_id', 'github_issue_number', 'reuse_scope', 'category', 'message']) {
      expect(sql).not.toContain(`DROP COLUMN IF EXISTS ${column}`)
    }
  })

  it('sait redescendre, et ne redescend QUE sa propre colonne', async () => {
    const { runner, queries } = createRunner()
    await new BetaFeedbackNotifiedFixedAt1795999784007().down(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('DROP COLUMN IF EXISTS notified_fixed_at')
    expect(sql).not.toContain('user_id')
  })
})
