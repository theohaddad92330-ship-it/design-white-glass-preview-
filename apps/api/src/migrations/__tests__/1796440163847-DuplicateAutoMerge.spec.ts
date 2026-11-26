import type { QueryRunner } from 'typeorm'
import { DUPLICATE_DECISIONS } from '@bellum/contracts'
import { DuplicateAutoMerge1796440163847 } from '../1796440163847-DuplicateAutoMerge'

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

// #4016 L6 — la fusion automatique ≥ 0,99, réversible, côté Bellum seulement.
describe('DuplicateAutoMerge1796440163847', () => {
  it('élargit la contrainte de décision à TOUTES les valeurs du contrat, `auto_merged` compris (GA-11/GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new DuplicateAutoMerge1796440163847().up(runner)
    const flat = queries.map(normalize).join(' ')
    for (const decision of DUPLICATE_DECISIONS) expect(flat).toContain(`'${decision}'`)
    expect(flat).toContain('CONSTRAINT duplicate_pairs_decision_check')
  })

  it('pose le journal de la fusion et de son annulation, nullable', async () => {
    const { runner, queries } = createRunner()
    await new DuplicateAutoMerge1796440163847().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS absorbed_id uuid')
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS undone_at timestamptz')
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS undone_by uuid')
    expect(flat).toContain('absorbed_id = left_id OR absorbed_id = right_id')
    expect(flat).not.toMatch(/absorbed_id uuid NOT NULL/)
  })

  it('la fiche absorbée pointe vers la survivante — jamais vers elle-même', async () => {
    const { runner, queries } = createRunner()
    await new DuplicateAutoMerge1796440163847().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('ALTER TABLE contacts ADD COLUMN IF NOT EXISTS merged_into_id uuid')
    expect(flat).toContain('merged_into_id IS NULL OR merged_into_id <> id')
  })

  it('down ne perd aucune valeur écrite : les fusions automatiques redeviennent des paires écartées', async () => {
    const { runner, queries } = createRunner()
    await new DuplicateAutoMerge1796440163847().down(runner)
    const flat = queries.map(normalize)
    const rewrite = flat.findIndex(sql => sql.includes("SET decision = 'dismissed' WHERE decision = 'auto_merged'"))
    const tighten = flat.findIndex(sql => sql.includes("CHECK (decision IN ('pending', 'merged', 'dismissed'))"))
    expect(rewrite).toBeGreaterThanOrEqual(0)
    expect(tighten).toBeGreaterThan(rewrite)
  })
})
