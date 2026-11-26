import type { QueryRunner } from 'typeorm'
import { MemoryItemKindOriginExpiry1788241633084 } from '../1788241633084-MemoryItemKindOriginExpiry'

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

describe('MemoryItemKindOriginExpiry1788241633084', () => {
  it('adds kind / origin / expires_at idempotently, with defaults that preserve today’s behaviour', async () => {
    const { runner, queries } = createRunner()
    await new MemoryItemKindOriginExpiry1788241633084().up(runner)
    const sql = queries.map(normalize)

    expect(sql).toContain("ALTER TABLE memory_pinned_facts ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'fact'")
    expect(sql).toContain(
      "ALTER TABLE memory_pinned_facts ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'manual'",
    )
    // Nullable on purpose: no deadline = the historical "true forever" pin.
    expect(sql).toContain('ALTER TABLE memory_pinned_facts ADD COLUMN IF NOT EXISTS expires_at timestamptz')
  })

  it('constrains kind and origin to the report’s vocabularies, under a re-run guard', async () => {
    const { runner, queries } = createRunner()
    await new MemoryItemKindOriginExpiry1788241633084().up(runner)
    const kind = queries.map(normalize).find(q => q.includes('memory_pinned_facts_kind_check'))
    const origin = queries.map(normalize).find(q => q.includes('memory_pinned_facts_origin_check'))

    expect(kind).toContain("CHECK (kind IN ('fact', 'preference', 'correction'))")
    expect(kind).toContain('IF NOT EXISTS ( SELECT 1 FROM pg_constraint')
    expect(origin).toContain("CHECK (origin IN ('manual', 'copilot', 'analysis'))")
    expect(origin).toContain('IF NOT EXISTS ( SELECT 1 FROM pg_constraint')
  })

  it('indexes only the dated rows (the expiry filter), and backfills NOTHING', async () => {
    const { runner, queries } = createRunner()
    await new MemoryItemKindOriginExpiry1788241633084().up(runner)
    const sql = queries.map(normalize)

    expect(sql.some(q => q.includes('CREATE INDEX IF NOT EXISTS memory_pinned_facts_expires_at_idx'))).toBe(true)
    expect(sql.some(q => q.includes('WHERE expires_at IS NOT NULL'))).toBe(true)
    // On ne devine NI l'origine NI l'échéance d'un fait déjà épinglé.
    expect(sql.some(q => q.startsWith('UPDATE memory_pinned_facts'))).toBe(false)
    expect(sql.some(q => q.includes('INSERT INTO'))).toBe(false)
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new MemoryItemKindOriginExpiry1788241633084().down()).rejects.toThrow(
      'down migrations are not supported',
    )
  })
})
