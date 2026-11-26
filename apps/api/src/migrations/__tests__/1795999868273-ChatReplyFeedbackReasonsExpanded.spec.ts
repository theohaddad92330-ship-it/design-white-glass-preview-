import type { QueryRunner } from 'typeorm'
import { ChatReplyFeedbackReasonsExpanded1795999868273 } from '../1795999868273-ChatReplyFeedbackReasonsExpanded'

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

// #2444.1 (suite) — GA-11/GA-12 : la contrainte s'élargit AVANT le code qui écrit
// les cinq nouveaux motifs.
describe('ChatReplyFeedbackReasonsExpanded1795999868273', () => {
  it('élargit `chat_reply_feedback_reason_check` aux cinq nouveaux motifs, sans en perdre un seul', async () => {
    const { runner, queries } = createRunner()
    await new ChatReplyFeedbackReasonsExpanded1795999868273().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS chat_reply_feedback_reason_check')
    expect(sql).toContain('ADD CONSTRAINT chat_reply_feedback_reason_check')
    for (const reason of [
      'mauvais_compte',
      'mauvais_contact',
      'mauvais_timing',
      'hors_positionnement',
      'deja_traite',
      'autre',
      'trop_long',
      'doublon',
      'source_douteuse',
      'contact_parti',
      'concurrent_en_place',
      'budget_insuffisant',
    ]) {
      expect(sql).toContain(`'${reason}'`)
    }
    expect(sql).toContain('reason IS NULL OR reason IN')
  })

  it('AJOUT SEULEMENT : la montée ne touche à aucune autre colonne ni contrainte', async () => {
    const { runner, queries } = createRunner()
    await new ChatReplyFeedbackReasonsExpanded1795999868273().up(runner)
    const sql = normalize(queries.join(' '))
    for (const constraint of [
      'chat_reply_feedback_verdict_check',
      'chat_reply_feedback_correction_scope_check',
      'chat_reply_feedback_reuse_scope_check',
    ]) {
      expect(sql).not.toContain(constraint)
    }
  })

  it('sait redescendre à la liste des sept motifs d’origine', async () => {
    const { runner, queries } = createRunner()
    await new ChatReplyFeedbackReasonsExpanded1795999868273().down(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain("'trop_long'")
    expect(sql).not.toContain("'doublon'")
    expect(sql).not.toContain("'source_douteuse'")
    expect(sql).not.toContain("'contact_parti'")
    expect(sql).not.toContain("'concurrent_en_place'")
    expect(sql).not.toContain("'budget_insuffisant'")
  })
})
