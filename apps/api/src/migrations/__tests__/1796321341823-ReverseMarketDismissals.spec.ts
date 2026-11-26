import type { QueryRunner } from 'typeorm'
import { ReverseMarketDismissals1796321341823 } from '../1796321341823-ReverseMarketDismissals'

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
  await new ReverseMarketDismissals1796321341823().up(runner)
  return queries.map(normalize)
}

/** #2968 — « Masquer » un environnement du Reverse Market, persistant et par personne. */
describe('ReverseMarketDismissals1796321341823 (#2968)', () => {
  it('crée la table : espace, personne, consultant, clé d’entreprise, et la clé composite', async () => {
    const create = (await up()).find(q => q.includes('CREATE TABLE IF NOT EXISTS reverse_market_dismissals'))
    expect(create).toBeDefined()
    expect(create).toContain('workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE')
    expect(create).toContain('user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE')
    expect(create).toContain('consultant_id uuid NOT NULL')
    expect(create).toContain('company_key text NOT NULL')
    expect(create).toContain('company_name text NOT NULL')
    expect(create).toContain('dismissed_at timestamptz')
    expect(create).toContain('PRIMARY KEY (workspace_id, user_id, consultant_id, company_key)')
  })

  it('RLS : la personne ne voit que SES masquages', async () => {
    const flat = await up()
    expect(flat).toContain('ALTER TABLE reverse_market_dismissals ENABLE ROW LEVEL SECURITY')
    const own = flat.find(q => q.startsWith('CREATE POLICY "reverse_market_dismissals_own_read"'))
    expect(own).toContain('FOR SELECT')
    expect(own).toContain('USING (user_id = auth.uid())')
  })

  it('RLS : les administrateurs de l’espace voient ceux de LEUR espace, et eux seuls', async () => {
    const flat = await up()
    const admins = flat.find(q => q.startsWith('CREATE POLICY "reverse_market_dismissals_admin_read"'))
    expect(admins).toContain('FOR SELECT')
    expect(admins).toContain(
      "USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')))",
    )
  })

  it('RLS : aucune politique d’écriture — seul le service écrit, après ses propres contrôles', async () => {
    const flat = await up()
    const policies = flat.filter(q => q.startsWith('CREATE POLICY') && q.includes('reverse_market_dismissals'))
    expect(policies).toHaveLength(2)
    for (const policy of policies) expect(policy).not.toMatch(/FOR (ALL|INSERT|UPDATE|DELETE)/)
  })

  it('down retire la table', async () => {
    const { runner, queries } = createRunner()
    await new ReverseMarketDismissals1796321341823().down(runner)
    expect(queries.map(normalize)).toContain('DROP TABLE IF EXISTS reverse_market_dismissals')
  })
})
