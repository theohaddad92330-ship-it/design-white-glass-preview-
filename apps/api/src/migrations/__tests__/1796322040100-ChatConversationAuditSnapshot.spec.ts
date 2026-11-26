import type { QueryRunner } from 'typeorm'
import { ChatConversationAuditSnapshot1796322040100 } from '../1796322040100-ChatConversationAuditSnapshot'

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

// #2075.29 / #2075.30 — `audit_snapshot` : posé une fois à l'ouverture du fil
// depuis l'audit, jamais réécrit par une régénération ultérieure. Additive,
// nullable : une conversation qui ne vient pas de l'audit garde `NULL`,
// comportement d'avant au byte près.
describe('ChatConversationAuditSnapshot1796322040100', () => {
  it('adds audit_snapshot (jsonb, nullable) on chat_conversations', async () => {
    const { runner, queries } = createRunner()
    await new ChatConversationAuditSnapshot1796322040100().up(runner)
    const add = queries.map(normalize).find(q => q.includes('ADD COLUMN IF NOT EXISTS audit_snapshot'))
    expect(add).toBeDefined()
    expect(add).toContain('ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS audit_snapshot jsonb')
  })

  it('down() drops the column (reversible, additive-only column)', async () => {
    const { runner, queries } = createRunner()
    await new ChatConversationAuditSnapshot1796322040100().down(runner)
    const drop = queries.map(normalize).find(q => q.includes('DROP COLUMN IF EXISTS audit_snapshot'))
    expect(drop).toBeDefined()
    expect(drop).toContain('ALTER TABLE chat_conversations DROP COLUMN IF EXISTS audit_snapshot')
  })
})
