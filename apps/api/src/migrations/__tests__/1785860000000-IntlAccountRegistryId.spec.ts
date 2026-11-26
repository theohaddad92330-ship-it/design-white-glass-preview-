import type { QueryRunner } from 'typeorm'
import { IntlAccountRegistryId1785860000000 } from '../1785860000000-IntlAccountRegistryId'

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

describe('IntlAccountRegistryId1785860000000', () => {
  it('adds the two ADDITIVE nullable columns (idempotent IF NOT EXISTS)', async () => {
    const { runner, queries } = createRunner()
    await new IntlAccountRegistryId1785860000000().up(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain('ALTER TABLE accounts ADD COLUMN IF NOT EXISTS registry_id TEXT')
    expect(flat).toContain('ALTER TABLE accounts ADD COLUMN IF NOT EXISTS registry_country TEXT')
  })

  it("backfills FR rows: registry_id = siren / registry_country = 'FR' where a real SIREN exists", async () => {
    const { runner, queries } = createRunner()
    await new IntlAccountRegistryId1785860000000().up(runner)
    const backfill = queries.map(normalize).find(q => q.includes("registry_country = 'FR'"))
    expect(backfill).toBeDefined()
    expect(backfill).toContain('SET registry_id = siren')
    // Only real SIRENs, and idempotent on re-run (never overwrites a stamped row).
    expect(backfill).toContain("WHERE siren IS NOT NULL AND siren <> ''")
    expect(backfill).toContain('registry_id IS NULL')
  })

  it('creates the partial UNIQUE index on (workspace_id, registry_country, registry_id) for ACTIVE rows', async () => {
    const { runner, queries } = createRunner()
    await new IntlAccountRegistryId1785860000000().up(runner)
    const index = queries.map(normalize).find(q => q.includes('accounts_workspace_registry_active_uniq'))
    expect(index).toBeDefined()
    expect(index).toContain('CREATE UNIQUE INDEX IF NOT EXISTS accounts_workspace_registry_active_uniq')
    expect(index).toContain('ON accounts (workspace_id, registry_country, registry_id)')
    // Predicate mirrors the SIREN index: non-null/non-empty key, scoped
    // workspace, active rows only (deleted/archived rows never collide).
    expect(index).toContain("WHERE registry_id IS NOT NULL AND registry_id <> ''")
    expect(index).toContain('registry_country IS NOT NULL AND workspace_id IS NOT NULL')
    expect(index).toContain("status NOT IN ('deleted', 'archived')")
  })

  it('archives all-but-the-newest active duplicate per key BEFORE building the index (defensive, mirror of the SIREN migration)', async () => {
    const { runner, queries } = createRunner()
    await new IntlAccountRegistryId1785860000000().up(runner)
    const flat = queries.map(normalize)
    const archiveAt = flat.findIndex(q => q.includes('PARTITION BY workspace_id, registry_country, registry_id'))
    const indexAt = flat.findIndex(q => q.includes('CREATE UNIQUE INDEX'))
    expect(archiveAt).toBeGreaterThanOrEqual(0)
    expect(flat[archiveAt]).toContain("SET status = 'archived'")
    expect(archiveAt).toBeLessThan(indexAt)
  })

  it('KEEPS the legacy SIREN index — the FR dedup path still runs on it', async () => {
    const { runner, queries } = createRunner()
    await new IntlAccountRegistryId1785860000000().up(runner)
    expect(queries.some(q => q.includes('DROP INDEX'))).toBe(false)
    expect(queries.some(q => q.includes('accounts_workspace_siren_active_uniq'))).toBe(false)
  })

  it('down() drops the index then both columns (reversible, additive-only)', async () => {
    const { runner, queries } = createRunner()
    await new IntlAccountRegistryId1785860000000().down(runner)
    const flat = queries.map(normalize)
    expect(flat[0]).toBe('DROP INDEX IF EXISTS accounts_workspace_registry_active_uniq')
    expect(flat).toContain('ALTER TABLE accounts DROP COLUMN IF EXISTS registry_country')
    expect(flat).toContain('ALTER TABLE accounts DROP COLUMN IF EXISTS registry_id')
  })
})
