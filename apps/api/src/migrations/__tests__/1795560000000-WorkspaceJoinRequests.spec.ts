import type { QueryRunner } from 'typeorm'
import { WorkspaceJoinRequests1795560000000 } from '../1795560000000-WorkspaceJoinRequests'

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
  await new WorkspaceJoinRequests1795560000000().up(runner)
  return queries.map(normalize)
}

/** #2016 — la table des demandes d'accès d'un NON-membre. */
describe('WorkspaceJoinRequests1795560000000 (#2016)', () => {
  it('crée la table : espace, demandeur, statut, dates — et le CHECK de statut', async () => {
    const create = (await up()).find(q => q.includes('CREATE TABLE IF NOT EXISTS workspace_join_requests'))
    expect(create).toBeDefined()
    expect(create).toContain('workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE')
    expect(create).toContain('user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE')
    expect(create).toContain("status text NOT NULL DEFAULT 'pending'")
    expect(create).toContain(
      "CONSTRAINT workspace_join_requests_status_check CHECK (status IN ('pending', 'accepted', 'refused', 'dismissed'))",
    )
    expect(create).toContain('created_at timestamptz NOT NULL DEFAULT now()')
    expect(create).toContain('decided_at timestamptz')
    expect(create).toContain('decided_by uuid')
    // Aucune coordonnée copiée dans la table : l'adresse se relit sur le profil.
    expect(create).not.toMatch(/email|phone/i)
  })

  it('une seule demande EN COURS par personne et par espace', async () => {
    const index = (await up()).find(q => q.includes('workspace_join_requests_pending_unique'))
    expect(index).toContain("ON workspace_join_requests (workspace_id, user_id) WHERE status = 'pending'")
  })

  it('RLS : le demandeur ne voit que SES demandes', async () => {
    const flat = await up()
    expect(flat).toContain('ALTER TABLE workspace_join_requests ENABLE ROW LEVEL SECURITY')
    const own = flat.find(q => q.startsWith('CREATE POLICY "workspace_join_requests_requester_read"'))
    expect(own).toContain('FOR SELECT')
    expect(own).toContain('USING (user_id = auth.uid())')
  })

  it('RLS : les administrateurs de l’espace voient celles de LEUR espace, et elles seules', async () => {
    const flat = await up()
    const admins = flat.find(q => q.startsWith('CREATE POLICY "workspace_join_requests_admin_read"'))
    expect(admins).toContain('FOR SELECT')
    expect(admins).toContain(
      "USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')))",
    )
  })

  it('RLS : aucune politique d’écriture — seul le service écrit, après ses propres contrôles', async () => {
    const flat = await up()
    const policies = flat.filter(q => q.startsWith('CREATE POLICY') && q.includes('workspace_join_requests'))
    expect(policies).toHaveLength(2)
    for (const policy of policies) expect(policy).not.toMatch(/FOR (ALL|INSERT|UPDATE|DELETE)/)
  })

  it('down retire la table', async () => {
    const { runner, queries } = createRunner()
    await new WorkspaceJoinRequests1795560000000().down(runner)
    expect(queries.map(normalize)).toContain('DROP TABLE IF EXISTS workspace_join_requests')
  })
})
