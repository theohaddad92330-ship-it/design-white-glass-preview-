import type { QueryRunner } from 'typeorm'
import { ChatReplyFeedbackCategory1795999802722 } from '../1795999802722-ChatReplyFeedbackCategory'

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

// #2444.1 — GA-11/GA-12 : la colonne précède le code qui écrit `category`.
describe('ChatReplyFeedbackCategory1795999802722', () => {
  it('ajoute `chat_reply_feedback.category`, text, NULLABLE, sans défaut deviné', async () => {
    const { runner, queries } = createRunner()
    await new ChatReplyFeedbackCategory1795999802722().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS category text')
    expect(sql).not.toContain('DEFAULT')
    expect(sql).not.toContain('NOT NULL')
  })

  it('AJOUT SEULEMENT : la montée ne touche à aucune autre colonne', async () => {
    const { runner, queries } = createRunner()
    await new ChatReplyFeedbackCategory1795999802722().up(runner)
    const sql = normalize(queries.join(' '))
    for (const column of ['verdict', 'reason', 'note', 'correction_field', 'withdrawn_at']) {
      expect(sql).not.toContain(`DROP COLUMN IF EXISTS ${column}`)
    }
  })

  it('sait redescendre, et ne redescend QUE sa propre colonne', async () => {
    const { runner, queries } = createRunner()
    await new ChatReplyFeedbackCategory1795999802722().down(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('DROP COLUMN IF EXISTS category')
    expect(sql).not.toContain('verdict')
  })
})
