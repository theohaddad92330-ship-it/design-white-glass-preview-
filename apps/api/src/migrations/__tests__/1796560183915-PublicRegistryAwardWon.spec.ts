import type { QueryRunner } from 'typeorm'
import { REGISTRY_ANNOUNCEMENT_KINDS } from '@bellum/contracts'
import { PublicRegistryAwardWon1796560183915 } from '../1796560183915-PublicRegistryAwardWon'

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

// #3915.decp — le compte TITULAIRE d'un marché attribué (`award_won`).
describe('PublicRegistryAwardWon1796560183915 (#3915.decp)', () => {
  it('élargit le CHECK des genres à TOUTES les valeurs de REGISTRY_ANNOUNCEMENT_KINDS (GA-12), award_won compris', async () => {
    const { runner, queries } = createRunner()
    await new PublicRegistryAwardWon1796560183915().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(REGISTRY_ANNOUNCEMENT_KINDS).toContain('award_won')
    for (const kind of REGISTRY_ANNOUNCEMENT_KINDS) expect(flat).toContain(`'${kind}'`)
  })

  it('down() retire les lignes award_won AVANT de refermer le CHECK', async () => {
    const { runner, queries } = createRunner()
    await new PublicRegistryAwardWon1796560183915().down(runner)
    const flat = queries.map(normalize)
    expect(flat[0]).toBe("DELETE FROM public_registry_announcements WHERE kind = 'award_won'")
    expect(flat.join(' ').slice(flat.join(' ').lastIndexOf('ADD CONSTRAINT'))).not.toContain("'award_won'")
  })
})
