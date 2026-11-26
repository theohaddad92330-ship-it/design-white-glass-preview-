import type { QueryRunner } from 'typeorm'
import { TeamNotificationsBackfillWorkspace1796541382915 } from '../1796541382915-TeamNotificationsBackfillWorkspace'

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

// #4158.56 — ajout seulement : on ne renseigne que des `workspace_id` NULL, jamais de suppression.
describe('TeamNotificationsBackfillWorkspace1796541382915', () => {
  const run = async () => {
    const queries: string[] = []
    const runner = {
      query: jest.fn(async (sql: string) => {
        queries.push(normalize(sql))
        return []
      }),
    } as unknown as QueryRunner
    await new TeamNotificationsBackfillWorkspace1796541382915().up(runner)
    return queries
  }

  it('ne touche que les notifications d’équipe sans espace, et ne supprime rien', async () => {
    const queries = await run()
    expect(queries).toHaveLength(2)
    for (const sql of queries) {
      expect(sql).toMatch(/^UPDATE notifications n SET workspace_id = /)
      expect(sql).toContain('n.workspace_id IS NULL')
      expect(sql).toContain("n.type IN ('chat_mention', 'chat_action_assigned', 'approval_assigned')")
      expect(sql).not.toMatch(/DELETE|DROP|TRUNCATE/i)
    }
  })

  it('déduit l’espace du compte cité, puis du fil de chat cité — jamais d’une valeur devinée', async () => {
    const [byAccount, byConversation] = await run()
    expect(byAccount).toContain('accountId=')
    expect(byAccount).toContain('FROM accounts a')
    expect(byConversation).toContain('conversationId=')
    expect(byConversation).toContain('HAVING count(DISTINCT workspace_id) = 1')
  })
})
