import type { QueryRunner } from 'typeorm'
import { canonicalTriggerKindValues } from '@bellum/contracts'
import { CanonicalTriggerEventsWidenKindsChangementDecideur1796413203817 } from '../1796413203817-CanonicalTriggerEventsWidenKindsChangementDecideur'

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

describe('CanonicalTriggerEventsWidenKindsChangementDecideur1796413203817', () => {
  it('élargit le CHECK à TOUTES les valeurs de canonicalTriggerKindValues (GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEventsWidenKindsChangementDecideur1796413203817().up(runner)
    const flat = queries.map(normalize).join(' ')
    // Comme `deadline_ao` : borné à SA valeur — `referencement_detecte` (1796424812345) élargit ensuite et porte « toutes ».
    const upToChangementDecideur = canonicalTriggerKindValues.slice(
      0,
      canonicalTriggerKindValues.indexOf('changement_decideur') + 1,
    )
    for (const kind of upToChangementDecideur) {
      expect(flat).toContain(`'${kind}'`)
    }
  })

  it('retire la contrainte avant de la reposer — jamais deux CHECK en même temps', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEventsWidenKindsChangementDecideur1796413203817().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS canonical_trigger_events_kind_check')
    expect(flat).toContain('ADD CONSTRAINT canonical_trigger_events_kind_check CHECK')
  })

  it('down() referme le CHECK sur les valeurs d’origine — rejoue la migration précédente', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEventsWidenKindsChangementDecideur1796413203817().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).not.toContain("'changement_decideur'")
    expect(flat).toContain("'deadline_ao'")
  })
})
