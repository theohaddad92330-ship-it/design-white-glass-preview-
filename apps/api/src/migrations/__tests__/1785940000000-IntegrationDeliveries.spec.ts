import type { QueryRunner } from 'typeorm'
import { IntegrationDeliveries1785940000000 } from '../1785940000000-IntegrationDeliveries'

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

describe('IntegrationDeliveries1785940000000', () => {
  it('creates the journal table with FK CASCADE, status CHECK, and safe columns only', async () => {
    const { runner, queries } = createRunner()
    await new IntegrationDeliveries1785940000000().up(runner)
    const create = queries.map(normalize).find(q => q.includes('CREATE TABLE IF NOT EXISTS integration_deliveries'))
    expect(create).toBeDefined()
    // Journal dies with its integration (and with the user).
    expect(create).toContain('integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE')
    expect(create).toContain('user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE')
    expect(create).toContain("CHECK (status IN ('pending', 'success', 'failed'))")
    expect(create).toContain('http_status INT')
    expect(create).toContain('attempt INT NOT NULL DEFAULT 0')
    // The error column exists, but there is deliberately NO url/payload column:
    // the journal never stores the webhook URL or the event body.
    expect(create).toContain('error TEXT')
    expect(create).not.toMatch(/\burl\b/i)
    expect(create).not.toMatch(/payload/i)
  })

  it('indexes the journal for the "latest 50 of one integration" query', async () => {
    const { runner, queries } = createRunner()
    await new IntegrationDeliveries1785940000000().up(runner)
    const index = queries.map(normalize).find(q => q.includes('integration_deliveries_integration_created_idx'))
    expect(index).toBeDefined()
    expect(index).toContain('ON integration_deliveries (integration_id, created_at DESC)')
  })

  it('enables RLS scoped to the owner, like the neighbouring integrations table (read-only: rows are system-written)', async () => {
    const { runner, queries } = createRunner()
    await new IntegrationDeliveries1785940000000().up(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain('ALTER TABLE integration_deliveries ENABLE ROW LEVEL SECURITY')
    const policy = flat.find(q => q.includes('CREATE POLICY') && q.includes('integration_deliveries'))
    expect(policy).toBeDefined()
    expect(policy).toContain('FOR SELECT')
    expect(policy).toContain('USING (auth.uid() = user_id)')
  })

  it('adds the nullable events allow-list column to integrations (NULL = all events, compat)', async () => {
    const { runner, queries } = createRunner()
    await new IntegrationDeliveries1785940000000().up(runner)
    expect(queries.map(normalize)).toContain('ALTER TABLE integrations ADD COLUMN IF NOT EXISTS events JSONB')
  })

  it('down() drops the journal table and the events column (reversible, additive-only)', async () => {
    const { runner, queries } = createRunner()
    await new IntegrationDeliveries1785940000000().down(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain('DROP TABLE IF EXISTS integration_deliveries')
    expect(flat).toContain('ALTER TABLE integrations DROP COLUMN IF EXISTS events')
  })
})
