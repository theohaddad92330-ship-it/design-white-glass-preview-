import type { QueryRunner } from 'typeorm'
import { canonicalTriggerKindValues } from '@bellum/contracts'
import { CanonicalTriggerEventsWidenKindsCrmDeal1796437800005 } from '../1796437800005-CanonicalTriggerEventsWidenKindsCrmDeal'

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

/** Kinds widened by a LATER migration — absent here by construction. */
const LATER_KINDS: ReadonlySet<string> = new Set(['contact_changement_poste'])

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

describe('CanonicalTriggerEventsWidenKindsCrmDeal1796437800005', () => {
  it('élargit le CHECK à TOUTES les valeurs de canonicalTriggerKindValues (GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEventsWidenKindsCrmDeal1796437800005().up(runner)
    const flat = queries.map(normalize).join(' ')
    // `contact_changement_poste` arrives with the NEXT migration (1796437900102),
    // whose own spec checks the full list; this one must still cover everything before it.
    for (const kind of canonicalTriggerKindValues.filter(value => !LATER_KINDS.has(value))) {
      expect(flat).toContain(`'${kind}'`)
    }
  })

  it('retire la contrainte avant de la reposer — jamais deux CHECK en même temps', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEventsWidenKindsCrmDeal1796437800005().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS canonical_trigger_events_kind_check')
    expect(flat).toContain('ADD CONSTRAINT canonical_trigger_events_kind_check CHECK')
  })

  it('down() referme le CHECK sur les valeurs d’origine — rejoue la migration précédente', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEventsWidenKindsCrmDeal1796437800005().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).not.toContain("'affaire_perdue'")
    expect(flat).not.toContain("'affaire_dormante'")
    expect(flat).not.toContain("'affaire_renouvellement'")
    expect(flat).toContain("'referencement_detecte'")
  })
})
