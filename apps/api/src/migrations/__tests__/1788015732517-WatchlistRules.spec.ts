import type { QueryRunner } from 'typeorm'
import { WatchlistRules1788015732517 } from '../1788015732517-WatchlistRules'

/** Capture every SQL statement the migration issues (no live DB needed). */
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

describe('WatchlistRules1788015732517', () => {
  it('creates watchlist_rules idempotently with the 5-kind CHECK and FK CASCADE', async () => {
    const { runner, queries } = createRunner()
    await new WatchlistRules1788015732517().up(runner)
    const create = queries.map(normalize).find(q => q.includes('CREATE TABLE IF NOT EXISTS watchlist_rules'))
    expect(create).toBeDefined()
    expect(create).toContain('user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE')
    expect(create).toContain('workspace_id uuid NOT NULL')
    expect(create).toContain("CHECK (kind IN ('sector', 'techno', 'account', 'need', 'person'))")
    expect(create).toContain('value text NOT NULL')
    expect(create).toContain('created_at timestamptz NOT NULL DEFAULT now()')
  })

  it('adds the workspace scope index and a per-workspace uniqueness guard', async () => {
    const { runner, queries } = createRunner()
    await new WatchlistRules1788015732517().up(runner)
    const flat = queries.map(normalize)
    expect(flat.find(q => q.includes('watchlist_rules_workspace_idx'))).toBeDefined()
    const uniq = flat.find(q => q.includes('watchlist_rules_workspace_kind_value_uidx'))
    expect(uniq).toBeDefined()
    expect(uniq).toContain('UNIQUE INDEX')
    expect(uniq).toContain('ON watchlist_rules (workspace_id, kind, value)')
  })

  it('enables owner-scoped RLS (auth.uid() = user_id), like the other métier tables', async () => {
    const { runner, queries } = createRunner()
    await new WatchlistRules1788015732517().up(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain('ALTER TABLE watchlist_rules ENABLE ROW LEVEL SECURITY')
    const policy = flat.find(q => q.includes('CREATE POLICY') && q.includes('watchlist_rules'))
    expect(policy).toBeDefined()
    expect(policy).toContain('auth.uid() = user_id')
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new WatchlistRules1788015732517().down()).rejects.toThrow('down migrations are not supported')
  })
})
