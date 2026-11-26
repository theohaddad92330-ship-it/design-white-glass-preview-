import type { QueryRunner } from 'typeorm'
import { ChatPresence1796321990410 } from '../1796321990410-ChatPresence'

/** #3086 — la présence sur un fil de Laura : une table NEUVE, rien d'existant touché. */
async function ranQueries(): Promise<string[]> {
  const queries: string[] = []
  const runner = { query: jest.fn(async (sql: string) => void queries.push(sql.replace(/\s+/g, ' ').trim())) }
  await new ChatPresence1796321990410().up(runner as unknown as QueryRunner)
  return queries
}

describe('ChatPresence1796321990410', () => {
  it('ajoute seulement : aucun ALTER sur une table existante, aucune donnée réécrite', async () => {
    const queries = await ranQueries()
    const touched = queries.filter(q => /ALTER TABLE|UPDATE |DELETE |INSERT /.test(q))
    expect(touched.every(q => /ALTER TABLE chat_presence ENABLE ROW LEVEL SECURITY/.test(q))).toBe(true)
    expect(queries.some(q => q.includes('chat_messages'))).toBe(false)
  })

  it('porte une clé de fil TEXT non nullable — pas de paire (account_id, conversation_id) qui pourrait valoir NULL', async () => {
    const create = (await ranQueries()).find(q => q.includes('CREATE TABLE IF NOT EXISTS chat_presence ('))
    expect(create).toContain('thread_key text NOT NULL')
    expect(create).toContain('user_id uuid NOT NULL')
    expect(create).not.toContain('account_id')
    expect(create).not.toContain('conversation_id')
  })

  it('borne par espace : unicité (espace, fil, membre) pour un upsert stable, et RLS par appartenance', async () => {
    const queries = await ranQueries()
    expect(queries).toContainEqual(expect.stringContaining('ON chat_presence (workspace_id, thread_key, user_id)'))
    const policies = queries.filter(q => q.includes('CREATE POLICY'))
    expect(policies).toHaveLength(1)
    expect(policies[0]).toContain('SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()')
  })
})
