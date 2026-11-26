import type { QueryRunner } from 'typeorm'
import { canonicalTriggerKindValues } from '@bellum/contracts'
import { CanonicalTriggerEventsWidenKindsSignalNouveau1796363217481 } from '../1796363217481-CanonicalTriggerEventsWidenKindsSignalNouveau'

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

describe('CanonicalTriggerEventsWidenKindsSignalNouveau1796363217481', () => {
  it('élargit le CHECK à TOUTES les valeurs de canonicalTriggerKindValues (GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEventsWidenKindsSignalNouveau1796363217481().up(runner)
    const flat = queries.map(normalize).join(' ')
    // Cette migration est un jalon de la chaîne : elle couvre le registre tel
    // qu'il était à `signal_nouveau`. Les valeurs ajoutées ensuite (`besoin_entrant`…)
    // ont leur propre migration, dont le spec vérifie le registre COMPLET.
    const upToSignalNouveau = canonicalTriggerKindValues.slice(
      0,
      canonicalTriggerKindValues.indexOf('signal_nouveau') + 1,
    )
    for (const kind of upToSignalNouveau) {
      expect(flat).toContain(`'${kind}'`)
    }
  })

  it('retire la contrainte avant de la reposer — jamais deux CHECK en même temps', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEventsWidenKindsSignalNouveau1796363217481().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS canonical_trigger_events_kind_check')
    expect(flat).toContain('ADD CONSTRAINT canonical_trigger_events_kind_check CHECK')
  })

  it('down() referme le CHECK sur les vingt valeurs d’origine — rejoue la migration précédente', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEventsWidenKindsSignalNouveau1796363217481().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).not.toContain("'signal_nouveau'")
    expect(flat).toContain("'reponse_positive'")
  })
})
