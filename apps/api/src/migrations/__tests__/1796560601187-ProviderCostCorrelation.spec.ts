import type { QueryRunner } from 'typeorm'
import { ProviderCostCorrelation1796560601187 } from '../1796560601187-ProviderCostCorrelation'
import { PROVIDER_COST_CORRELATION_MAX } from '../../modules/analytics/provider-cost.service'

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

/** #3717.7 / #3777 (DEC-4036 Q10) — la colonne posée AVANT le code qui l'écrit (GA-11/GA-12). */
describe('ProviderCostCorrelation1796560601187', () => {
  it('ajoute une colonne NULLABLE, sans défaut — une ligne d’avant ne porte aucun identifiant deviné', async () => {
    const { runner, queries } = createRunner()
    await new ProviderCostCorrelation1796560601187().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS correlation_id text')
    expect(flat).not.toMatch(/correlation_id text (NOT NULL|DEFAULT)/)
  })

  it('la contrainte borne la longueur à celle que le service écrit', async () => {
    const { runner, queries } = createRunner()
    await new ProviderCostCorrelation1796560601187().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain(
      `CHECK (correlation_id IS NULL OR char_length(correlation_id) <= ${PROVIDER_COST_CORRELATION_MAX})`,
    )
    expect(flat).toContain('provider_costs (correlation_id) WHERE correlation_id IS NOT NULL')
  })
})
