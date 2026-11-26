import type { QueryRunner } from 'typeorm'
import { canonicalTriggerKindValues } from '@bellum/contracts'
import { CanonicalTriggerEventsWidenKindsDeadlineAo1796374300123 } from '../1796374300123-CanonicalTriggerEventsWidenKindsDeadlineAo'

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

describe('CanonicalTriggerEventsWidenKindsDeadlineAo1796374300123', () => {
  it('élargit le CHECK à TOUTES les valeurs de canonicalTriggerKindValues (GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEventsWidenKindsDeadlineAo1796374300123().up(runner)
    const flat = queries.map(normalize).join(' ')
    const upToDeadlineAo = canonicalTriggerKindValues.slice(0, canonicalTriggerKindValues.indexOf('deadline_ao') + 1)
    for (const kind of upToDeadlineAo) {
      expect(flat).toContain(`'${kind}'`)
    }
  })

  it('retire la contrainte avant de la reposer — jamais deux CHECK en même temps', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEventsWidenKindsDeadlineAo1796374300123().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS canonical_trigger_events_kind_check')
    expect(flat).toContain('ADD CONSTRAINT canonical_trigger_events_kind_check CHECK')
  })

  it('down() referme le CHECK sur les valeurs d’origine — rejoue la migration précédente', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEventsWidenKindsDeadlineAo1796374300123().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).not.toContain("'deadline_ao'")
    expect(flat).toContain("'besoin_entrant'")
  })
})
