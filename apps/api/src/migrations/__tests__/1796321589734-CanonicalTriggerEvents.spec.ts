import type { QueryRunner } from 'typeorm'
import { CanonicalTriggerEvents1796321589734 } from '../1796321589734-CanonicalTriggerEvents'

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

describe('CanonicalTriggerEvents1796321589734', () => {
  it('crée la table, sans clé métier devinée : `kind` reste borné par un CHECK', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEvents1796321589734().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('CREATE TABLE IF NOT EXISTS canonical_trigger_events')
    expect(flat).toContain("CONSTRAINT canonical_trigger_events_kind_check CHECK (kind IN ('duplicate_pair_detected'))")
  })

  it('pose un index par espace, genre et date — la lecture qu’un futur émetteur lira', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEvents1796321589734().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('CREATE INDEX IF NOT EXISTS canonical_trigger_events_workspace_idx')
    expect(flat).toContain('ON canonical_trigger_events (workspace_id, kind, occurred_at DESC)')
  })

  it('est idempotente (IF NOT EXISTS)', async () => {
    const { runner } = createRunner()
    await expect(new CanonicalTriggerEvents1796321589734().up(runner)).resolves.not.toThrow()
  })

  it('down() retire la table', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEvents1796321589734().down(runner)
    expect(queries.map(normalize).join(' ')).toContain('DROP TABLE IF EXISTS canonical_trigger_events')
  })
})
