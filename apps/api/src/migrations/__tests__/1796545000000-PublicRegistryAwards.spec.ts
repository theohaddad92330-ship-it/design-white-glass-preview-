import type { QueryRunner } from 'typeorm'
import { REGISTRY_ANNOUNCEMENT_KINDS } from '@bellum/contracts'
import { PublicRegistryAwards1796545000000 } from '../1796545000000-PublicRegistryAwards'

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

describe('PublicRegistryAwards1796545000000 (#3920.8)', () => {
  it('élargit le CHECK des genres à TOUTES les valeurs de REGISTRY_ANNOUNCEMENT_KINDS (GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new PublicRegistryAwards1796545000000().up(runner)
    const flat = queries.map(normalize).join(' ')
    // Les genres posés APRÈS cette migration (RNE #3921.9, marché titulaire #3915.decp) sont élargis par la leur,
    // qui relit la liste COMPLÈTE.
    const addedLater = new Set<string>(['establishment_closure', 'award_won'])
    for (const kind of REGISTRY_ANNOUNCEMENT_KINDS.filter(k => !addedLater.has(k))) {
      expect(flat).toContain(`'${kind}'`)
    }
  })

  it('admet la source decp et ajoute le curseur du premier passage', async () => {
    const { runner, queries } = createRunner()
    await new PublicRegistryAwards1796545000000().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain("CHECK (source IN ('bodacc', 'sirene', 'decp'))")
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS awards_checked_at timestamptz')
  })

  it('down() retire les lignes que seules les nouvelles valeurs autorisaient avant de refermer les CHECK', async () => {
    const { runner, queries } = createRunner()
    await new PublicRegistryAwards1796545000000().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain("DELETE FROM public_registry_announcements WHERE source = 'decp' OR kind = 'award'")
    expect(flat.slice(flat.lastIndexOf('ADD CONSTRAINT'))).not.toContain("'decp'")
  })
})
