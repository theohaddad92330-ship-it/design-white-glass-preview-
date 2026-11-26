import type { QueryRunner } from 'typeorm'
import { QualificationGrids1796435218742 } from '../1796435218742-QualificationGrids'

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

const run = async (direction: 'up' | 'down'): Promise<string> => {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  await new QualificationGrids1796435218742()[direction](runner)
  return queries.map(normalize).join(' ')
}

describe('QualificationGrids1796435218742 (#3755)', () => {
  it('crée les grilles scopées à un espace, en cascade, une version unique par espace', async () => {
    const flat = await run('up')
    expect(flat).toContain('CREATE TABLE IF NOT EXISTS qualification_grids')
    expect(flat).toContain('workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE')
    expect(flat).toContain('UNIQUE (workspace_id, version)')
    // Une seule grille ACTIVE par espace — l'ancienne version reste, inactive.
    expect(flat).toContain('ON qualification_grids (workspace_id) WHERE active')
  })

  it('contraint le type de critère et le poids (null pour un éliminatoire)', async () => {
    const flat = await run('up')
    expect(flat).toContain('CREATE TABLE IF NOT EXISTS qualification_criteria')
    expect(flat).toContain('REFERENCES qualification_grids (id) ON DELETE CASCADE')
    expect(flat).toContain("CHECK (kind IN ('eliminatory', 'weighted'))")
    expect(flat).toContain("(kind = 'eliminatory' AND weight IS NULL) OR (kind = 'weighted' AND weight > 0)")
  })

  it('stocke l’évaluation d’un compte avec la version de grille qui l’a produite', async () => {
    const flat = await run('up')
    expect(flat).toContain('CREATE TABLE IF NOT EXISTS account_qualifications')
    expect(flat).toContain('grid_version integer NOT NULL')
    expect(flat).toContain('REFERENCES accounts (id) ON DELETE CASCADE')
    expect(flat).toContain('UNIQUE (account_id, grid_id)')
  })

  it('active la RLS des trois tables, lecture réservée aux membres', async () => {
    const flat = await run('up')
    for (const table of ['qualification_grids', 'qualification_criteria', 'account_qualifications']) {
      expect(flat).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
    }
    expect(flat).toContain('FROM workspace_members WHERE user_id = auth.uid()')
  })

  it('down supprime les trois tables', async () => {
    const flat = await run('down')
    expect(flat).toContain('DROP TABLE IF EXISTS account_qualifications')
    expect(flat).toContain('DROP TABLE IF EXISTS qualification_criteria')
    expect(flat).toContain('DROP TABLE IF EXISTS qualification_grids')
  })
})
