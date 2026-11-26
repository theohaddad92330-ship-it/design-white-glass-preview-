import type { QueryRunner } from 'typeorm'
import { ConversationThreadState1792800130000 } from '../1792800130000-ConversationThreadState'

/** Capture every SQL statement the migration issues (no live DB needed) — same
 *  pattern as `1792800004817-RagDocumentConversationScope.spec.ts`. */
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

describe('ConversationThreadState1792800130000 — #1927.10', () => {
  it('adds a NULLABLE jsonb column without a default — additive, no table rewrite', async () => {
    const { runner, queries } = createRunner()
    await new ConversationThreadState1792800130000().up(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain('ALTER TABLE conversation_summaries ADD COLUMN IF NOT EXISTS thread_state jsonb')
    expect(flat.some(q => /thread_state jsonb (NOT NULL|DEFAULT)/.test(q))).toBe(false)
  })

  it('bounds the column at the database: an object, at most 32 000 bytes', async () => {
    const { runner, queries } = createRunner()
    await new ConversationThreadState1792800130000().up(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain(
      'ALTER TABLE conversation_summaries DROP CONSTRAINT IF EXISTS conversation_summaries_thread_state_check',
    )
    const check = flat.find(q => q.includes('ADD CONSTRAINT conversation_summaries_thread_state_check'))
    expect(check).toBeDefined()
    expect(check).toContain("jsonb_typeof(thread_state) = 'object'")
    expect(check).toContain('octet_length(thread_state::text) <= 32000')
    expect(check).toContain('thread_state IS NULL OR')
  })

  it('refuses to run down', async () => {
    await expect(new ConversationThreadState1792800130000().down()).rejects.toThrow('not supported')
  })
})
