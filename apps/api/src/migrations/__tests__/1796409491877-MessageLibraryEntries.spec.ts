import type { QueryRunner } from 'typeorm'
import { MessageLibraryEntries1796409491877 } from '../1796409491877-MessageLibraryEntries'

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

describe('MessageLibraryEntries1796409491877', () => {
  it('crée la table, scopée à un espace', async () => {
    const { runner, queries } = createRunner()
    await new MessageLibraryEntries1796409491877().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('CREATE TABLE IF NOT EXISTS message_library_entries')
    expect(flat).toContain('workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE')
  })

  it('contraint channel/scenario_id/persona au vocabulaire partagé outreach-scenarios.ts (GA-26)', async () => {
    const { runner, queries } = createRunner()
    await new MessageLibraryEntries1796409491877().up(runner)
    const flat = queries.map(normalize).join(' ')
    for (const channel of ['linkedin_draft', 'email_draft', 'call_brief']) expect(flat).toContain(`'${channel}'`)
    for (const scenario of ['accepted_connection', 'dormant_connection', 'referred_contact', 'cold_approach']) {
      expect(flat).toContain(`'${scenario}'`)
    }
    for (const persona of ['decideur', 'gouvernance', 'direction', 'manager', 'acheteur', 'expert', 'operationnel']) {
      expect(flat).toContain(`'${persona}'`)
    }
  })

  it('contraint status aux quatre valeurs de la règle absolue', async () => {
    const { runner, queries } = createRunner()
    await new MessageLibraryEntries1796409491877().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain("CHECK (status IN ('approuve', 'a_revoir', 'historique', 'interdit'))")
  })

  it('contraint mode à verbatim/inspiration', async () => {
    const { runner, queries } = createRunner()
    await new MessageLibraryEntries1796409491877().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain("CHECK (mode IN ('verbatim', 'inspiration'))")
  })

  it('indexe les critères de sélection structurée', async () => {
    const { runner, queries } = createRunner()
    await new MessageLibraryEntries1796409491877().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain(
      'CREATE INDEX IF NOT EXISTS ix_message_library_entries_selection ON message_library_entries (workspace_id, channel, scenario_id, persona, mode, status)',
    )
  })

  it('active la RLS, lecture scopée à l’espace', async () => {
    const { runner, queries } = createRunner()
    await new MessageLibraryEntries1796409491877().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('ALTER TABLE message_library_entries ENABLE ROW LEVEL SECURITY')
    expect(flat).toContain('workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())')
  })

  it('est idempotente (IF NOT EXISTS)', async () => {
    const { runner } = createRunner()
    await expect(new MessageLibraryEntries1796409491877().up(runner)).resolves.not.toThrow()
  })

  it('down() supprime la table', async () => {
    const { runner, queries } = createRunner()
    await new MessageLibraryEntries1796409491877().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('DROP TABLE IF EXISTS message_library_entries')
  })
})
