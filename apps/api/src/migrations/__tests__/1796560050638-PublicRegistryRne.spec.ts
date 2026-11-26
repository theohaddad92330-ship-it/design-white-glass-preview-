import type { QueryRunner } from 'typeorm'
import { REGISTRY_ANNOUNCEMENT_KINDS } from '@bellum/contracts'
import { PublicRegistryRne1796560050638 } from '../1796560050638-PublicRegistryRne'

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

describe('PublicRegistryRne1796560050638 (#3921.9)', () => {
  it('élargit le CHECK des genres à TOUTES les valeurs de REGISTRY_ANNOUNCEMENT_KINDS (GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new PublicRegistryRne1796560050638().up(runner)
    const flat = queries.map(normalize).join(' ')
    // `award_won` vient APRÈS (1796560183915-PublicRegistryAwardWon), dont le CHECK est l'union finale.
    for (const kind of REGISTRY_ANNOUNCEMENT_KINDS.filter(k => k !== 'award_won')) expect(flat).toContain(`'${kind}'`)
  })

  it('admet la source rne et ajoute le curseur du premier passage', async () => {
    const { runner, queries } = createRunner()
    await new PublicRegistryRne1796560050638().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain("CHECK (source IN ('bodacc', 'sirene', 'decp', 'rne'))")
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS rne_checked_at timestamptz')
  })

  it('down() retire les lignes que seules les nouvelles valeurs autorisaient avant de refermer les CHECK', async () => {
    const { runner, queries } = createRunner()
    await new PublicRegistryRne1796560050638().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain(
      "DELETE FROM public_registry_announcements WHERE source = 'rne' OR kind = 'establishment_closure'",
    )
    expect(flat.slice(flat.lastIndexOf('ADD CONSTRAINT'))).not.toContain("'rne'")
  })
})
