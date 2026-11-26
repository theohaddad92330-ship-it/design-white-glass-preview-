import type { QueryRunner } from 'typeorm'
import { UnifiedCredits1787990000000 } from '../1787990000000-UnifiedCredits'

function createRunner(): { runner: QueryRunner; calls: string[] } {
  const calls: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      calls.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  return { runner, calls }
}

describe('UnifiedCredits1787990000000', () => {
  it('fond le solde d’enrichissements dans le quota du cycle — personne ne perd de capacité', async () => {
    const { runner, calls } = createRunner()
    await new UnifiedCredits1787990000000().up(runner)

    const soldes = calls[0]!
    expect(soldes).toContain('UPDATE subscriptions')
    expect(soldes).toContain('accounts_limit = accounts_limit + GREATEST(enrichment_credits, 0)')
    expect(soldes).toContain('enrichment_credits = 0')
  })

  it('applique la même règle au catalogue de paliers', async () => {
    const { runner, calls } = createRunner()
    await new UnifiedCredits1787990000000().up(runner)

    const catalogue = calls[1]!
    expect(catalogue).toContain('UPDATE plan_definitions')
    expect(catalogue).toContain('accounts_limit = accounts_limit + GREATEST(enrichment_credits, 0)')
  })

  it('est rejouable : seules les lignes encore porteuses d’un solde sont converties', async () => {
    const { runner, calls } = createRunner()
    await new UnifiedCredits1787990000000().up(runner)

    for (const sql of calls) expect(sql).toContain('WHERE COALESCE(enrichment_credits, 0) > 0')
  })

  it('ne touche à AUCUNE colonne : la bascule est une conversion de valeurs', async () => {
    const { runner, calls } = createRunner()
    await new UnifiedCredits1787990000000().up(runner)

    expect(calls.filter(sql => /\bALTER TABLE\b|\bDROP\b/i.test(sql))).toEqual([])
  })

  it('ne prétend pas savoir revenir en arrière (la somme est irréversible)', async () => {
    const { calls } = createRunner()
    await new UnifiedCredits1787990000000().down()

    expect(calls).toEqual([])
  })
})
