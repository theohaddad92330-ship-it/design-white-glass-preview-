import type { QueryRunner } from 'typeorm'
import { CompanyLevelReferencesNoGo1795610000001 } from '../1795610000001-CompanyLevelReferencesNoGo'

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

// #2005.4 (DÉCISION Louis 17/09, lot CP2) — client_references / no_go_sectors
// passent ENTREPRISE : migration de DONNÉE, idempotente, jamais un écrasement.
describe('CompanyLevelReferencesNoGo1795610000001', () => {
  it('backfill les deux colonnes, une requête chacune', async () => {
    const { runner, queries } = createRunner()
    await new CompanyLevelReferencesNoGo1795610000001().up(runner)
    expect(queries.length).toBe(2)
    const [clientReferencesSql, noGoSectorsSql] = queries.map(normalize)
    expect(clientReferencesSql).toContain('UPDATE esn_profiles AS canonical')
    expect(clientReferencesSql).toContain('SET client_references = source.client_references')
    expect(noGoSectorsSql).toContain('SET no_go_sectors = source.no_go_sectors')
  })

  it('ne touche QUE les lignes canoniques dont la colonne est VIDE — jamais un écrasement', async () => {
    const { runner, queries } = createRunner()
    await new CompanyLevelReferencesNoGo1795610000001().up(runner)
    for (const sql of queries.map(normalize)) {
      expect(sql).toContain('canonical.is_workspace_canonical = true')
      expect(sql).toMatch(/canonical\.\w+ IS NULL OR array_length\(canonical\.\w+, 1\) IS NULL/)
    }
  })

  it('choisit une source DÉTERMINISTE (la plus ancienne réponse non vide du même espace)', async () => {
    const { runner, queries } = createRunner()
    await new CompanyLevelReferencesNoGo1795610000001().up(runner)
    for (const sql of queries.map(normalize)) {
      expect(sql).toContain('DISTINCT ON (workspace_id)')
      expect(sql).toContain('ORDER BY workspace_id, created_at ASC')
    }
  })

  it('SAIT DIRE NON : une colonne d’un autre lot ne doit jamais apparaître ici', async () => {
    const { runner, queries } = createRunner()
    await new CompanyLevelReferencesNoGo1795610000001().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).not.toContain('consultants_managed_by_user_band')
    expect(sql).not.toContain('company_locations')
  })

  it('down est un no-op explicite — une donnée promue ne se retire pas au hasard', async () => {
    const { runner, queries } = createRunner()
    await new CompanyLevelReferencesNoGo1795610000001().down()
    expect(queries).toEqual([])
  })
})
