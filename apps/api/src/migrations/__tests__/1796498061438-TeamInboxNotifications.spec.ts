import type { QueryRunner } from 'typeorm'
import { TeamInboxNotifications1796498061438 } from '../1796498061438-TeamInboxNotifications'

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

// #4158.14 / #4158.19 — la boîte de réception d'équipe. Ajout seulement : les
// lignes déjà écrites gardent NULL (« notification personnelle, sans espace »)
// et les quatre interrupteurs e-mail naissent FAUX (aucune case précochée).
describe('TeamInboxNotifications1796498061438', () => {
  it('adds nullable workspace_id and actor_user_id to notifications', async () => {
    const { runner, queries } = createRunner()
    await new TeamInboxNotifications1796498061438().up(runner)
    const flat = queries.map(normalize)
    expect(flat.some(q => q.includes('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS workspace_id uuid'))).toBe(
      true,
    )
    expect(flat.some(q => q.includes('ADD COLUMN IF NOT EXISTS actor_user_id uuid'))).toBe(true)
    expect(flat.some(q => /workspace_id uuid NOT NULL/.test(q))).toBe(false)
  })

  it('adds the four e-mail opt-ins, all DEFAULT false', async () => {
    const { runner, queries } = createRunner()
    await new TeamInboxNotifications1796498061438().up(runner)
    const flat = queries.map(normalize).join(' ')
    for (const col of ['email_on_assignment', 'email_on_delegation', 'email_on_mention', 'email_on_manager_digest']) {
      expect(flat).toContain(`ADD COLUMN IF NOT EXISTS ${col} boolean NOT NULL DEFAULT false`)
    }
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new TeamInboxNotifications1796498061438().down()).rejects.toThrow('down migrations are not supported')
  })
})
