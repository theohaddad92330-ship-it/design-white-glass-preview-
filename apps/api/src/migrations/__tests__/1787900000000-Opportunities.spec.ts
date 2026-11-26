import type { QueryRunner } from 'typeorm'
import { Opportunities1787900000000 } from '../1787900000000-Opportunities'

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

describe('Opportunities1787900000000', () => {
  it('creates the opportunities table with the lifecycle CHECK and FK CASCADE', async () => {
    const { runner, queries } = createRunner()
    await new Opportunities1787900000000().up(runner)
    const create = queries.map(normalize).find(q => q.includes('CREATE TABLE IF NOT EXISTS opportunities'))
    expect(create).toBeDefined()
    expect(create).toContain('account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE')
    expect(create).toContain("lifecycle_status text NOT NULL DEFAULT 'nouveau'")
    expect(create).toContain(
      "CHECK (lifecycle_status IN ('nouveau', 'confirme', 'obsolete', 'transforme', 'converti'))",
    )
    expect(create).toContain('first_detected_at timestamptz NOT NULL DEFAULT now()')
  })

  it('creates a unique index for idempotent re-materialization (account, kind, md5(label))', async () => {
    const { runner, queries } = createRunner()
    await new Opportunities1787900000000().up(runner)
    const uniq = queries.map(normalize).find(q => q.includes('opportunities_account_kind_label_uniq'))
    expect(uniq).toBeDefined()
    expect(uniq).toContain('UNIQUE INDEX')
    expect(uniq).toContain('ON opportunities (account_id, kind, md5(label))')
  })

  it('enables workspace-scoped RLS (defence in depth), like the other métier tables', async () => {
    const { runner, queries } = createRunner()
    await new Opportunities1787900000000().up(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain('ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY')
    const policy = flat.find(q => q.includes('CREATE POLICY') && q.includes('opportunities'))
    expect(policy).toBeDefined()
    expect(policy).toContain('FOR SELECT')
    expect(policy).toContain('SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()')
  })

  it('backfills every need kind deterministically, idempotently (ON CONFLICT DO NOTHING)', async () => {
    const { runner, queries } = createRunner()
    await new Opportunities1787900000000().up(runner)
    const inserts = queries.map(normalize).filter(q => q.includes('INSERT INTO opportunities'))
    // pain / challenge / program / implication
    expect(inserts).toHaveLength(4)
    expect(inserts.every(q => q.includes('ON CONFLICT (account_id, kind, md5(label)) DO NOTHING'))).toBe(true)
    expect(inserts.some(q => q.includes("'pain'") && q.includes("raw_analysis -> 'pains'"))).toBe(true)
    expect(inserts.some(q => q.includes("'challenge'") && q.includes('it_challenges'))).toBe(true)
    expect(inserts.some(q => q.includes("'program'") && q.includes("raw_analysis -> 'program_names'"))).toBe(true)
    expect(inserts.some(q => q.includes("'implication'") && q.includes('it_implications_for_esn'))).toBe(true)
    // Never materialize a deleted account.
    expect(inserts.every(q => q.includes("a.status <> 'deleted'"))).toBe(true)
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new Opportunities1787900000000().down()).rejects.toThrow('down migrations are not supported')
  })
})
