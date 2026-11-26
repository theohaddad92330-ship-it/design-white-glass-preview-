import type { QueryRunner } from 'typeorm'
import { PublicRegistryHeadcountChange1796461938273 } from '../1796461938273-PublicRegistryHeadcountChange'

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

// Les valeurs de `REGISTRY_ANNOUNCEMENT_KINDS` au moment de CE lot (14/10/2026) — pas un
// import live du paquet, qui grandit depuis (`award`, marchés attribués, #3920.8 / w3-signaux
// 15/10) et ferait échouer ce test historique sur une valeur que cette migration n'avait
// pas à couvrir (même règle que 1796440251873-PublicRegistryExecutiveChange.spec.ts).
const KINDS_AT_THIS_LOT = [
  'collective_proceeding',
  'creation',
  'sale',
  'accounts_filing',
  'modification',
  'deregistration',
  'new_establishment',
  'executive_change',
  'headcount_change',
  'other',
] as const

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

describe('PublicRegistryHeadcountChange1796461938273 (#3921)', () => {
  it('élargit le CHECK à TOUTES les valeurs de REGISTRY_ANNOUNCEMENT_KINDS de son lot (GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new PublicRegistryHeadcountChange1796461938273().up(runner)
    const flat = queries.map(normalize).join(' ')
    for (const kind of KINDS_AT_THIS_LOT) expect(flat).toContain(`'${kind}'`)
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS public_registry_announcements_kind_check')
    expect(flat).toContain('ADD CONSTRAINT public_registry_announcements_kind_check CHECK')
  })

  it('down() referme le CHECK sans la nouvelle valeur, après avoir retiré les lignes qu’elle seule autorisait', async () => {
    const { runner, queries } = createRunner()
    await new PublicRegistryHeadcountChange1796461938273().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain("DELETE FROM public_registry_announcements WHERE kind = 'headcount_change'")
    expect(flat.slice(flat.lastIndexOf('ADD CONSTRAINT'))).not.toContain("'headcount_change'")
  })
})
