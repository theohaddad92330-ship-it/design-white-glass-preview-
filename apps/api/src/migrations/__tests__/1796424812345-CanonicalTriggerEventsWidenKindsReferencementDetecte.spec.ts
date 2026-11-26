import type { QueryRunner } from 'typeorm'
import { canonicalTriggerKindValues } from '@bellum/contracts'
import { CanonicalTriggerEventsWidenKindsReferencementDetecte1796424812345 } from '../1796424812345-CanonicalTriggerEventsWidenKindsReferencementDetecte'

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

describe('CanonicalTriggerEventsWidenKindsReferencementDetecte1796424812345', () => {
  it('élargit le CHECK à TOUTES les valeurs de canonicalTriggerKindValues (GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEventsWidenKindsReferencementDetecte1796424812345().up(runner)
    const flat = queries.map(normalize).join(' ')
    // Comme `changement_decideur` : borné à SA valeur — les kinds CRM (1796437800005) élargissent ensuite et portent « toutes ».
    const upToReferencementDetecte = canonicalTriggerKindValues.slice(
      0,
      canonicalTriggerKindValues.indexOf('referencement_detecte') + 1,
    )
    for (const kind of upToReferencementDetecte) {
      expect(flat).toContain(`'${kind}'`)
    }
  })

  it('retire la contrainte avant de la reposer — jamais deux CHECK en même temps', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEventsWidenKindsReferencementDetecte1796424812345().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS canonical_trigger_events_kind_check')
    expect(flat).toContain('ADD CONSTRAINT canonical_trigger_events_kind_check CHECK')
  })

  it('down() referme le CHECK sur les valeurs d’origine — rejoue la migration précédente', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEventsWidenKindsReferencementDetecte1796424812345().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).not.toContain("'referencement_detecte'")
    expect(flat).toContain("'changement_decideur'")
  })
})
