import type { QueryRunner } from 'typeorm'
import { TelephonyCallState1796349700419 } from '../1796349700419-TelephonyCallState'

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
  await new TelephonyCallState1796349700419().up(runner)
  return queries.map(normalize)
}

async function down(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new TelephonyCallState1796349700419().down(runner)
  return queries.map(normalize)
}

/** #2403.12 — la source « appel en cours », par utilisateur, avec expiration. */
describe('TelephonyCallState1796349700419 (#2403.12)', () => {
  it('ajoute le secret de webhook à la connexion existante', async () => {
    const flat = await up()
    expect(flat).toContain('ALTER TABLE telephony_connections ADD COLUMN IF NOT EXISTS webhook_secret_enc text')
  })

  it('crée la table : espace, personne, état, expiration, et l’unicité par membre', async () => {
    const create = (await up()).find(q => q.includes('CREATE TABLE IF NOT EXISTS telephony_call_states'))
    expect(create).toBeDefined()
    expect(create).toContain('workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE')
    expect(create).toContain('user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE')
    expect(create).toContain('state text NOT NULL')
    expect(create).toContain('expires_at timestamptz NOT NULL')
    expect(create).toContain('UNIQUE (workspace_id, user_id)')
    // GA-177 — nommée plutôt qu'en ligne, pour rester visible à GA-12.
    expect(create).toContain(
      "CONSTRAINT telephony_call_states_state_check CHECK (state IN ('in_progress', 'terminated'))",
    )
  })

  it('RLS : la personne ne voit que SON état', async () => {
    const flat = await up()
    expect(flat).toContain('ALTER TABLE telephony_call_states ENABLE ROW LEVEL SECURITY')
    const own = flat.find(q => q.startsWith('CREATE POLICY "telephony_call_states_own_read"'))
    expect(own).toContain('FOR SELECT')
    expect(own).toContain('USING (user_id = auth.uid())')
  })

  it('RLS : les administrateurs de l’espace voient ceux de LEUR espace, et eux seuls', async () => {
    const flat = await up()
    const admins = flat.find(q => q.startsWith('CREATE POLICY "telephony_call_states_admin_read"'))
    expect(admins).toContain('FOR SELECT')
    expect(admins).toContain(
      "USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')))",
    )
  })

  it('down() défait exactement ce que up() a fait', async () => {
    const flat = await down()
    expect(flat).toContain('DROP TABLE IF EXISTS telephony_call_states')
    expect(flat).toContain('ALTER TABLE telephony_connections DROP COLUMN IF EXISTS webhook_secret_enc')
  })
})
