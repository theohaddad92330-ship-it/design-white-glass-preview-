import type { QueryRunner } from 'typeorm'
import { canonicalTriggerKindValues } from '@bellum/contracts'
import { CanonicalTriggerEventsWidenKindsReponsePositive1796342400000 } from '../1796342400000-CanonicalTriggerEventsWidenKindsReponsePositive'

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

describe('CanonicalTriggerEventsWidenKindsReponsePositive1796342400000', () => {
  it('élargit le CHECK à TOUTES les valeurs de canonicalTriggerKindValues (GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEventsWidenKindsReponsePositive1796342400000().up(runner)
    const flat = queries.map(normalize).join(' ')
    // Les valeurs ajoutées APRÈS `reponse_positive` (signal_nouveau,
    // besoin_entrant…) sont élargies par leurs propres migrations.
    const upTo = canonicalTriggerKindValues.slice(0, canonicalTriggerKindValues.indexOf('reponse_positive') + 1)
    expect(upTo).toContain('reponse_positive')
    for (const kind of upTo) {
      expect(flat).toContain(`'${kind}'`)
    }
  })

  it('retire la contrainte avant de la reposer — jamais deux CHECK en même temps', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEventsWidenKindsReponsePositive1796342400000().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS canonical_trigger_events_kind_check')
    expect(flat).toContain('ADD CONSTRAINT canonical_trigger_events_kind_check CHECK')
  })

  it('down() referme le CHECK sur les dix-neuf valeurs d’origine — rejoue la migration précédente', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEventsWidenKindsReponsePositive1796342400000().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).not.toContain("'reponse_positive'")
    expect(flat).toContain("'margin_alert'")
  })
})
