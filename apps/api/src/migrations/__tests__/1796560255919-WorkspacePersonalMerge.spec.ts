import type { QueryRunner } from 'typeorm'
import { WORKSPACE_MERGE_ITEM_OUTCOMES, WORKSPACE_MERGE_STATUSES, WORKSPACE_MERGE_TABLES } from '@bellum/contracts'
import { WorkspacePersonalMerge1796560255919 } from '../1796560255919-WorkspacePersonalMerge'

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

async function upQueries(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new WorkspacePersonalMerge1796560255919().up(runner)
  return queries.map(normalize)
}

// #4158.57 — rapatrier l'espace personnel : migration en AJOUT seulement (condition d).
describe('WorkspacePersonalMerge1796560255919 (#4158.57)', () => {
  it('ajoute seulement : aucune suppression, aucun rétrécissement, aucune colonne NOT NULL sans défaut sur une table existante', async () => {
    const flat = (await upQueries()).join(' ; ')
    expect(flat).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i)
    expect(flat).not.toMatch(/\bDELETE\s+FROM\b/i)
    expect(flat).not.toMatch(/\bUPDATE\s+\w+\s+SET\b/i)
    expect(flat).not.toMatch(/ALTER COLUMN/i)
    // Les deux colonnes de `workspaces` sont NULLables : un espace existant n'est ni archivé ni fusionné.
    expect(flat).toContain('ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS archived_at timestamptz')
    expect(flat).toContain('ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS merged_into_workspace_id uuid')
    for (const statement of flat.split(' ; ').filter(sql => sql.startsWith('ALTER TABLE workspaces ADD COLUMN'))) {
      expect(statement).not.toMatch(/NOT NULL/i)
    }
  })

  it('crée la demande (aperçu + empreinte) et le journal par ligne, idempotent par (demande, table, ligne)', async () => {
    const flat = (await upQueries()).join(' ; ')
    expect(flat).toContain('CREATE TABLE IF NOT EXISTS workspace_merge_requests')
    expect(flat).toMatch(/preview jsonb NOT NULL/)
    expect(flat).toMatch(/preview_hash text NOT NULL/)
    expect(flat).toContain('CREATE TABLE IF NOT EXISTS workspace_merge_items')
    expect(flat).toContain('CONSTRAINT workspace_merge_items_once UNIQUE (request_id, source_table, source_id)')
    // La source et la cible ne sont jamais le même espace.
    expect(flat).toContain('CHECK (source_workspace_id <> workspace_id)')
    // Une seule demande vivante par espace personnel.
    expect(flat).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS workspace_merge_requests_one_live_idx/)
  })

  it('les CHECK couvrent TOUTES les valeurs des énumérations du contrat (GA-12)', async () => {
    const flat = (await upQueries()).join(' ; ')
    const check = (name: string): string => flat.slice(flat.indexOf(name), flat.indexOf(')', flat.indexOf(name)) + 1)
    for (const status of WORKSPACE_MERGE_STATUSES) {
      expect(check('workspace_merge_requests_status_check')).toContain(`'${status}'`)
    }
    for (const outcome of WORKSPACE_MERGE_ITEM_OUTCOMES) {
      expect(check('workspace_merge_items_outcome_check')).toContain(`'${outcome}'`)
    }
    for (const table of WORKSPACE_MERGE_TABLES) {
      expect(check('workspace_merge_items_table_check')).toContain(`'${table}'`)
    }
  })

  it('RLS activée sur les deux tables neuves, lecture réservée au demandeur et aux admins de la cible', async () => {
    const flat = (await upQueries()).join(' ; ')
    expect(flat).toContain('ALTER TABLE workspace_merge_requests ENABLE ROW LEVEL SECURITY')
    expect(flat).toContain('ALTER TABLE workspace_merge_items ENABLE ROW LEVEL SECURITY')
    expect(flat).toMatch(/CREATE POLICY workspace_merge_requests_read ON workspace_merge_requests FOR SELECT/)
    expect(flat).toMatch(/requested_by = auth\.uid\(\)/)
    expect(flat).toMatch(/m\.role IN \('owner', 'admin'\)/)
  })

  it('down() retire seulement ce que up() a ajouté', async () => {
    const { runner, queries } = createRunner()
    await new WorkspacePersonalMerge1796560255919().down(runner)
    const flat = queries.map(normalize).join(' ; ')
    expect(flat).toContain('DROP TABLE IF EXISTS workspace_merge_items')
    expect(flat).toContain('DROP TABLE IF EXISTS workspace_merge_requests')
    expect(flat).toContain('ALTER TABLE workspaces DROP COLUMN IF EXISTS merged_into_workspace_id')
    expect(flat).toContain('ALTER TABLE workspaces DROP COLUMN IF EXISTS archived_at')
    expect(flat).not.toMatch(/DROP TABLE IF EXISTS (accounts|contacts|workspaces)\b/)
  })
})
