import type { QueryRunner } from 'typeorm'
import { ContactAssignment1788236104913 } from '../1788236104913-ContactAssignment'

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

describe('ContactAssignment1788236104913', () => {
  it('adds a NULLABLE contacts.assigned_to (NULL = non attribué, l’état honnête)', async () => {
    const { runner, queries } = createRunner()
    await new ContactAssignment1788236104913().up(runner)
    const alter = queries.map(normalize).find(q => q.includes('ALTER TABLE contacts'))
    expect(alter).toBe('ALTER TABLE contacts ADD COLUMN IF NOT EXISTS assigned_to uuid')
    expect(alter).not.toContain('NOT NULL')
  })

  // Le backfill « créateur = porteur » déclarerait une répartition fictive dès
  // le premier jour — exactement le signal que l'écran doit montrer.
  it('never backfills the column from user_id', async () => {
    const { runner, queries } = createRunner()
    await new ContactAssignment1788236104913().up(runner)
    expect(queries.map(normalize).some(q => q.startsWith('UPDATE contacts'))).toBe(false)
  })

  it('indexes (workspace_id, assigned_to) — every read is workspace-scoped first', async () => {
    const { runner, queries } = createRunner()
    await new ContactAssignment1788236104913().up(runner)
    const index = queries.map(normalize).find(q => q.includes('contacts_workspace_assigned_idx'))
    expect(index).toBe(
      'CREATE INDEX IF NOT EXISTS contacts_workspace_assigned_idx ON contacts (workspace_id, assigned_to)',
    )
  })

  it('is idempotent — replaying it is a no-op', async () => {
    const { runner, queries } = createRunner()
    await new ContactAssignment1788236104913().up(runner)
    for (const sql of queries) expect(normalize(sql)).toContain('IF NOT EXISTS')
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new ContactAssignment1788236104913().down()).rejects.toThrow('down migrations are not supported')
  })
})
