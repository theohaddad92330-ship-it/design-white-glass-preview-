import type { QueryRunner } from 'typeorm'
import { LemlistConnections1796570106283 } from '../1796570106283-LemlistConnections'

/** Capture chaque instruction SQL (aucune base réelle). */
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

async function up(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new LemlistConnections1796570106283().up(runner)
  return queries.map(normalize)
}

/** #4427 — la clé Lemlist par espace, et la trace des leads poussés. */
describe('LemlistConnections1796570106283 (#4427)', () => {
  it('#4427.1 — une connexion par espace, clé chiffrée, RLS sans politique', async () => {
    const flat = await up()
    const create = flat.find(q => q.includes('CREATE TABLE IF NOT EXISTS lemlist_connections'))
    expect(create).toContain('workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE')
    expect(create).toContain('credentials_enc text NOT NULL')
    expect(create).toContain('CONSTRAINT lemlist_connections_workspace UNIQUE (workspace_id)')
    expect(flat).toContain('ALTER TABLE lemlist_connections ENABLE ROW LEVEL SECURITY')
  })

  it('#4427.2 — un contact poussé une fois par campagne, pour relire ses statuts (#4427.3)', async () => {
    const flat = await up()
    const create = flat.find(q => q.includes('CREATE TABLE IF NOT EXISTS lemlist_lead_pushes'))
    expect(create).toContain('contact_id uuid NOT NULL REFERENCES contacts (id) ON DELETE CASCADE')
    expect(create).toContain('campaign_id text NOT NULL')
    expect(create).toContain('lead_id text')
    expect(create).toContain('CONSTRAINT lemlist_lead_pushes_unique UNIQUE (workspace_id, contact_id, campaign_id)')
    expect(flat).toContain('ALTER TABLE lemlist_lead_pushes ENABLE ROW LEVEL SECURITY')
  })

  it('down retire les deux tables', async () => {
    const { runner, queries } = createRunner()
    await new LemlistConnections1796570106283().down(runner)
    expect(queries.map(normalize)).toEqual([
      'DROP TABLE IF EXISTS lemlist_lead_pushes',
      'DROP TABLE IF EXISTS lemlist_connections',
    ])
  })
})
