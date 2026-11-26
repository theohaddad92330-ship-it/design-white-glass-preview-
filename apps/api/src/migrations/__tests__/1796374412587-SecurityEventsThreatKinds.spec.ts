import type { QueryRunner } from 'typeorm'
import { SecurityEventsThreatKinds1796374412587 } from '../1796374412587-SecurityEventsThreatKinds'

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

describe('SecurityEventsThreatKinds1796374412587 (#2442.14)', () => {
  it('élargit le CHECK aux deux espèces neuves sans en perdre une (GA-08, GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new SecurityEventsThreatKinds1796374412587().up(runner)
    const flat = flatten(queries)
    for (const kind of ['authorization_denied', 'leak_detected', 'cross_tenant_suspected', 'injection_suspected']) {
      expect(flat).toContain(`'${kind}'`)
    }
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS security_events_kind_check')
  })

  it('down() referme sur les deux espèces d’avant et purge les lignes neuves', async () => {
    const { runner, queries } = createRunner()
    await new SecurityEventsThreatKinds1796374412587().down(runner)
    const flat = flatten(queries)
    expect(flat).toContain(
      "DELETE FROM security_events WHERE kind IN ('cross_tenant_suspected', 'injection_suspected')",
    )
    expect(flat).toContain("CHECK (kind IN ('authorization_denied', 'leak_detected'))")
  })
})
