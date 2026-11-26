import type { QueryRunner } from 'typeorm'
import { DATAFORGE_NEED_SOURCE_FILES, DATAFORGE_NEED_STATUSES } from '@bellum/contracts'
import { DataforgeNeeds1796560603409 } from '../1796560603409-DataforgeNeeds'

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

// #4281.1 — les besoins historiques DataForge structurés : listes fermées AVANT le code qui écrit (GA-11/GA-12).
describe('DataforgeNeeds1796560603409', () => {
  it('ferme statut et fichier source sur les listes du contrat', async () => {
    const { runner, queries } = createRunner()
    await new DataforgeNeeds1796560603409().up(runner)
    const all = queries.map(normalize).join('\n')
    expect(all).toContain(`CHECK (status IN ( ${DATAFORGE_NEED_STATUSES.map(s => `'${s}'`).join(', ')} ))`)
    expect(all).toContain(`CHECK (source_file IN ( ${DATAFORGE_NEED_SOURCE_FILES.map(s => `'${s}'`).join(', ')} ))`)
  })

  it('un besoin est unique par (fichier, identifiant) — ré-ingestion idempotente — et la table est fermée au client', async () => {
    const { runner, queries } = createRunner()
    await new DataforgeNeeds1796560603409().up(runner)
    const all = queries.map(normalize).join('\n')
    expect(all).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS dataforge_needs_source_need_unique ON dataforge_needs (source_file, need_id)',
    )
    expect(all).toContain('USING gin (technologies)')
    expect(all).toContain('ALTER TABLE dataforge_needs ENABLE ROW LEVEL SECURITY')
    expect(all).not.toMatch(/workspace_id/)
  })
})
