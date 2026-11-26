import type { QueryRunner } from 'typeorm'
import { PublicRegistryExecutiveChange1796440251873 } from '../1796440251873-PublicRegistryExecutiveChange'

// Les valeurs de `REGISTRY_ANNOUNCEMENT_KINDS` au moment de CE lot (11/10/2026) —
// pas un import live du paquet, qui grandit depuis (#3915/#3921, `headcount_change`,
// lot S7 cloud 14/10) et ferait échouer ce test historique sur une valeur que
// cette migration n'avait pas à couvrir.
const KINDS_AT_THIS_LOT = [
  'collective_proceeding',
  'creation',
  'sale',
  'accounts_filing',
  'modification',
  'deregistration',
  'new_establishment',
  'executive_change',
  'other',
] as const

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

describe('PublicRegistryExecutiveChange1796440251873 (#3921.2)', () => {
  it('élargit le CHECK à TOUTES les valeurs de REGISTRY_ANNOUNCEMENT_KINDS (GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new PublicRegistryExecutiveChange1796440251873().up(runner)
    const flat = queries.map(normalize).join(' ')
    for (const kind of KINDS_AT_THIS_LOT) expect(flat).toContain(`'${kind}'`)
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS public_registry_announcements_kind_check')
    expect(flat).toContain('ADD CONSTRAINT public_registry_announcements_kind_check CHECK')
  })

  it('rattrape l’existant : seuls les SIREN déjà lus avec une modification repartent de zéro (relecture silencieuse)', async () => {
    const { runner, queries } = createRunner()
    await new PublicRegistryExecutiveChange1796440251873().up(runner)
    const reset = queries.map(normalize).find(q => q.includes('UPDATE public_registry_watch_state'))
    expect(reset).toContain('SET bodacc_through = NULL')
    expect(reset).toContain("kind = 'modification'")
    expect(reset).not.toMatch(/WHERE\s*$/)
  })

  it('down() referme le CHECK sans la nouvelle valeur et requalifie les lignes', async () => {
    const { runner, queries } = createRunner()
    await new PublicRegistryExecutiveChange1796440251873().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain("SET kind = 'modification' WHERE kind = 'executive_change'")
    expect(flat.slice(flat.lastIndexOf('ADD CONSTRAINT'))).not.toContain("'executive_change'")
  })
})
