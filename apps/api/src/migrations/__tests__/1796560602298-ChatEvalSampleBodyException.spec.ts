import type { QueryRunner } from 'typeorm'
import { ChatEvalSampleBodyException1796560602298 } from '../1796560602298-ChatEvalSampleBodyException'
import { MAX_EVAL_MESSAGE_BODY_CHARS } from '../../modules/chat-eval-sampling/chat-eval-anonymizer'

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

/** #2958.98 (DEC-4036 Q5) — le CHECK s'élargit AVANT le code qui écrit un corps (GA-11/GA-12). */
describe('ChatEvalSampleBodyException1796560602298', () => {
  it('élargit la borne de longueur à celle d’un corps, jamais au-delà', async () => {
    const queries: string[] = []
    const runner = { query: jest.fn(async (sql: string) => void queries.push(sql)) } as unknown as QueryRunner
    await new ChatEvalSampleBodyException1796560602298().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS chat_eval_samples_text_length_check')
    expect(flat).toContain(`CHECK (char_length(anonymized_text) BETWEEN 1 AND ${MAX_EVAL_MESSAGE_BODY_CHARS})`)
  })
})
