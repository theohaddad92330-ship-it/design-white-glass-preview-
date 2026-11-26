import type { QueryRunner } from 'typeorm'
import { MarketZones1796433901253 } from '../1796433901253-MarketZones'

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

const run = async (direction: 'up' | 'down'): Promise<string> => {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  await new MarketZones1796433901253()[direction](runner)
  return queries.map(normalize).join(' ')
}

describe('MarketZones1796433901253', () => {
  it('crée la table scopée à un espace, en cascade (le reset démo ne doit pas casser)', async () => {
    const flat = await run('up')
    expect(flat).toContain('CREATE TABLE IF NOT EXISTS market_zones')
    expect(flat).toContain('workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE')
  })

  it('une zone est unique par (espace, slug)', async () => {
    expect(await run('up')).toContain('UNIQUE (workspace_id, slug)')
  })

  it('contraint scope et brief_origin au vocabulaire du contrat', async () => {
    const flat = await run('up')
    expect(flat).toContain("CHECK (scope IN ('france', 'suisse'))")
    expect(flat).toContain("brief_origin IS NULL OR brief_origin IN ('seed', 'generated')")
  })

  it('active la RLS avec une lecture réservée aux membres', async () => {
    const flat = await run('up')
    expect(flat).toContain('ALTER TABLE market_zones ENABLE ROW LEVEL SECURITY')
    expect(flat).toContain('FROM workspace_members WHERE user_id = auth.uid()')
  })

  it('down supprime la table', async () => {
    expect(await run('down')).toContain('DROP TABLE IF EXISTS market_zones')
  })
})
