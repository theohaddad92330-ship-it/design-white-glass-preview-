import type { QueryRunner } from 'typeorm'
import { SecurityEventsDataExport1796419437219 } from '../1796419437219-SecurityEventsDataExport'

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

const flatten = (queries: string[]): string => queries.map(sql => sql.replace(/\s+/g, ' ').trim()).join(' ')

describe('SecurityEventsDataExport1796419437219 (#2442.14, lot X17)', () => {
  it('élargit le CHECK à data_export sans perdre une espèce (GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new SecurityEventsDataExport1796419437219().up(runner)
    const flat = flatten(queries)
    for (const kind of [
      'authorization_denied',
      'leak_detected',
      'cross_tenant_suspected',
      'injection_suspected',
      'permission_escalated',
      'data_export',
    ]) {
      expect(flat).toContain(`'${kind}'`)
    }
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS security_events_kind_check')
  })

  it('down() purge les lignes neuves et referme sur les cinq espèces d’avant', async () => {
    const { runner, queries } = createRunner()
    await new SecurityEventsDataExport1796419437219().down(runner)
    const flat = flatten(queries)
    expect(flat).toContain("DELETE FROM security_events WHERE kind = 'data_export'")
    expect(flat).not.toMatch(/CHECK \(kind IN \([^)]*data_export/)
    expect(flat).toContain("'permission_escalated'")
  })
})
