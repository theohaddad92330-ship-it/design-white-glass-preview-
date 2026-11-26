import type { QueryRunner } from 'typeorm'
import { ChatConversations1795999431572 } from '../1795999431572-ChatConversations'

/**
 * #2430.11 — l'objet conversation : deux tables NEUVES, rien d'existant touché.
 */
async function ranQueries(): Promise<string[]> {
  const queries: string[] = []
  const runner = { query: jest.fn(async (sql: string) => void queries.push(sql.replace(/\s+/g, ' ').trim())) }
  await new ChatConversations1795999431572().up(runner as unknown as QueryRunner)
  return queries
}

describe('ChatConversations1795999431572', () => {
  it('ajoute seulement : aucun ALTER sur une table existante, aucune donnée réécrite', async () => {
    const queries = await ranQueries()
    const touched = queries.filter(q => /ALTER TABLE|UPDATE |DELETE |INSERT /.test(q))
    // Seul `ENABLE ROW LEVEL SECURITY` altère — et seulement les deux tables neuves.
    expect(touched.every(q => /ALTER TABLE chat_conversation(s|_versions) ENABLE ROW LEVEL SECURITY/.test(q))).toBe(
      true,
    )
    expect(queries.some(q => q.includes('chat_messages'))).toBe(false)
  })

  it('la clé du fil est TEXT, comme `chat_messages.conversation_id` (clés « general », « account-… »)', async () => {
    const create = (await ranQueries()).find(q => q.includes('CREATE TABLE IF NOT EXISTS chat_conversations ('))
    expect(create).toContain('conversation_id text NOT NULL')
    expect(create).toContain('parent_conversation_id text')
    // Colonnes de personne nullables dès la création (RGPD, GA-129).
    expect(create).toContain('owner_user_id uuid,')
    expect(create).not.toMatch(/owner_user_id uuid NOT NULL/)
  })

  it('borne chaque table par espace : unicité (espace, fil) et RLS par appartenance', async () => {
    const queries = await ranQueries()
    expect(queries).toContainEqual(expect.stringContaining('ON chat_conversations (workspace_id, conversation_id)'))
    expect(queries).toContainEqual(
      expect.stringContaining('ON chat_conversation_versions (workspace_id, conversation_id, version)'),
    )
    const policies = queries.filter(q => q.includes('CREATE POLICY'))
    expect(policies).toHaveLength(2)
    for (const policy of policies)
      expect(policy).toContain('SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()')
  })
})
