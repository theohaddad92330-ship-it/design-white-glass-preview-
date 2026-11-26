import type { QueryRunner } from 'typeorm'
import { TeamCommentsConversationScope1795999685841 } from '../1795999685841-TeamCommentsConversationScope'

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

// #1940.6 — un commentaire sur un FIL ou une RÉPONSE précise, pas seulement
// sur un compte. Additive, nullable : les commentaires du cockpit (§10)
// existants gardent `conversation_id`/`message_id` à NULL, comportement
// inchangé.
describe('TeamCommentsConversationScope1795999685841', () => {
  it('adds conversation_id (text, nullable) — same type as chat_messages.conversation_id', async () => {
    const { runner, queries } = createRunner()
    await new TeamCommentsConversationScope1795999685841().up(runner)
    const flat = queries.map(normalize)
    const add = flat.find(q => q.includes('ADD COLUMN IF NOT EXISTS conversation_id'))
    expect(add).toBeDefined()
    expect(add).toContain('ALTER TABLE team_comments ADD COLUMN IF NOT EXISTS conversation_id text')
  })

  it('adds message_id (uuid, nullable), FK to chat_messages, cascades on delete', async () => {
    const { runner, queries } = createRunner()
    await new TeamCommentsConversationScope1795999685841().up(runner)
    const flat = queries.map(normalize)
    const add = flat.find(q => q.includes('ADD COLUMN IF NOT EXISTS message_id'))
    expect(add).toBeDefined()
    expect(add).toContain('uuid REFERENCES chat_messages(id) ON DELETE CASCADE')
  })

  it('indexes the thread reading order per workspace + conversation', async () => {
    const { runner, queries } = createRunner()
    await new TeamCommentsConversationScope1795999685841().up(runner)
    const idx = queries.map(normalize).find(q => q.includes('team_comments_conversation_idx'))
    expect(idx).toBeDefined()
    expect(idx).toContain('ON team_comments (workspace_id, conversation_id, created_at)')
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new TeamCommentsConversationScope1795999685841().down()).rejects.toThrow(
      'down migrations are not supported',
    )
  })
})
