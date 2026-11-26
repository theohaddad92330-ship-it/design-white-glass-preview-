import type { QueryRunner } from 'typeorm'
import { canonicalTriggerKindValues } from '@bellum/contracts'
import { CanonicalTriggerEventsWidenKindsBesoinEntrant1796363218693 } from '../1796363218693-CanonicalTriggerEventsWidenKindsBesoinEntrant'

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

describe('CanonicalTriggerEventsWidenKindsBesoinEntrant1796363218693', () => {
  it('élargit le CHECK à TOUTES les valeurs de canonicalTriggerKindValues (GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEventsWidenKindsBesoinEntrant1796363218693().up(runner)
    const flat = queries.map(normalize).join(' ')
    // Jalon de la chaîne : le registre tel qu'il était à `besoin_entrant`.
    // Les valeurs ajoutées ensuite (`deadline_ao`…) ont leur propre migration.
    const upToBesoinEntrant = canonicalTriggerKindValues.slice(
      0,
      canonicalTriggerKindValues.indexOf('besoin_entrant') + 1,
    )
    for (const kind of upToBesoinEntrant) {
      expect(flat).toContain(`'${kind}'`)
    }
  })

  it('retire la contrainte avant de la reposer — jamais deux CHECK en même temps', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEventsWidenKindsBesoinEntrant1796363218693().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS canonical_trigger_events_kind_check')
    expect(flat).toContain('ADD CONSTRAINT canonical_trigger_events_kind_check CHECK')
  })

  it('down() referme le CHECK sur les vingt-et-une valeurs d’origine — rejoue la migration précédente', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEventsWidenKindsBesoinEntrant1796363218693().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).not.toContain("'besoin_entrant'")
    expect(flat).toContain("'signal_nouveau'")
  })
})
