import type { QueryRunner } from 'typeorm'
import { EsnProfileCorrectionRequests1795670043127 } from '../1795670043127-EsnProfileCorrectionRequests'

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
  await new EsnProfileCorrectionRequests1795670043127().up(runner)
  return queries.map(normalize)
}

/** #2018.7 — signaler une information d'entreprise fausse, sans l'écraser. */
describe('EsnProfileCorrectionRequests1795670043127 (#2018.7)', () => {
  it('crée la table : espace, auteur, champ, raison, statut — et le CHECK de statut', async () => {
    const create = (await up()).find(q => q.includes('CREATE TABLE IF NOT EXISTS esn_profile_correction_requests'))
    expect(create).toBeDefined()
    expect(create).toContain('workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE')
    expect(create).toContain('reporter_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE')
    expect(create).toContain('field_key text NOT NULL')
    expect(create).toContain('reason text NOT NULL')
    expect(create).toContain("status text NOT NULL DEFAULT 'pending'")
    expect(create).toContain(
      "CONSTRAINT esn_profile_correction_requests_status_check CHECK (status IN ('pending', 'resolved', 'dismissed'))",
    )
    expect(create).toContain('created_at timestamptz NOT NULL DEFAULT now()')
    expect(create).toContain('resolved_at timestamptz')
    expect(create).toContain('resolved_by uuid')
    // #2018.7 — jamais une valeur proposée : signaler ne PROPOSE rien.
    expect(create).not.toMatch(/proposed_value|new_value/i)
  })

  it('RLS : l’auteur ne voit que SES signalements', async () => {
    const flat = await up()
    expect(flat).toContain('ALTER TABLE esn_profile_correction_requests ENABLE ROW LEVEL SECURITY')
    const own = flat.find(q => q.startsWith('CREATE POLICY "esn_profile_correction_requests_reporter_read"'))
    expect(own).toContain('FOR SELECT')
    expect(own).toContain('USING (reporter_user_id = auth.uid())')
  })

  it('RLS : les administrateurs de l’espace voient celles de LEUR espace, et elles seules', async () => {
    const flat = await up()
    const admins = flat.find(q => q.startsWith('CREATE POLICY "esn_profile_correction_requests_admin_read"'))
    expect(admins).toContain('FOR SELECT')
    expect(admins).toContain(
      "USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')))",
    )
  })

  it('RLS : aucune politique d’écriture — seul le service écrit, après ses propres contrôles', async () => {
    const flat = await up()
    const policies = flat.filter(q => q.startsWith('CREATE POLICY') && q.includes('esn_profile_correction_requests'))
    expect(policies).toHaveLength(2)
    for (const policy of policies) expect(policy).not.toMatch(/FOR (ALL|INSERT|UPDATE|DELETE)/)
  })

  it('down retire la table', async () => {
    const { runner, queries } = createRunner()
    await new EsnProfileCorrectionRequests1795670043127().down(runner)
    expect(queries.map(normalize)).toContain('DROP TABLE IF EXISTS esn_profile_correction_requests')
  })
})
