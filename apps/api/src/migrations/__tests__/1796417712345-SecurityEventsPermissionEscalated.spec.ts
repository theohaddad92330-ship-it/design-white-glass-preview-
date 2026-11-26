import type { QueryRunner } from 'typeorm'
import { SecurityEventsPermissionEscalated1796417712345 } from '../1796417712345-SecurityEventsPermissionEscalated'

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

describe('SecurityEventsPermissionEscalated1796417712345 (#2442.14)', () => {
  it('élargit le CHECK à permission_escalated sans perdre une espèce (GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new SecurityEventsPermissionEscalated1796417712345().up(runner)
    const flat = flatten(queries)
    for (const kind of [
      'authorization_denied',
      'leak_detected',
      'cross_tenant_suspected',
      'injection_suspected',
      'permission_escalated',
    ]) {
      expect(flat).toContain(`'${kind}'`)
    }
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS security_events_kind_check')
  })

  it('down() purge les lignes neuves et referme sur les quatre espèces d’avant', async () => {
    const { runner, queries } = createRunner()
    await new SecurityEventsPermissionEscalated1796417712345().down(runner)
    const flat = flatten(queries)
    expect(flat).toContain("DELETE FROM security_events WHERE kind = 'permission_escalated'")
    expect(flat).not.toMatch(/CHECK \(kind IN \([^)]*permission_escalated/)
  })
})
