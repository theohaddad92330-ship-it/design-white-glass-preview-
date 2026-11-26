import type { QueryRunner } from 'typeorm'
import { getMetadataArgsStorage } from 'typeorm'
import { ProviderCostUnitsNumeric1796574508901 } from '../1796574508901-ProviderCostUnitsNumeric'
import { ProviderCostEntity } from '../../database/entities/provider-cost.entity'

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

/** #4452 — `units` reçoit des fractions (0,1666… page) : la colonne s'élargit AVANT le code (GA-11/GA-12). */
describe('ProviderCostUnitsNumeric1796574508901', () => {
  it('élargit `units` en numeric — une fraction ne fait plus échouer la ligne de coût', async () => {
    const { runner, queries } = createRunner()
    await new ProviderCostUnitsNumeric1796574508901().up(runner)
    expect(queries.map(normalize).join(' ')).toContain(
      'ALTER TABLE provider_costs ALTER COLUMN units TYPE numeric USING units::numeric',
    )
  })

  it('le retour arrondit au lieu d’échouer — jamais une ligne perdue', async () => {
    const { runner, queries } = createRunner()
    await new ProviderCostUnitsNumeric1796574508901().down(runner)
    expect(queries.map(normalize).join(' ')).toContain('ALTER COLUMN units TYPE int USING round(units)::int')
  })

  it('l’entité déclare numeric et relit un nombre (pas la chaîne du driver pg)', () => {
    const column = getMetadataArgsStorage().columns.find(
      c => c.target === ProviderCostEntity && c.propertyName === 'units',
    )
    expect(column?.options.type).toBe('numeric')
    const transformer = column?.options.transformer as { from: (v: unknown) => unknown; to: (v: unknown) => unknown }
    expect(transformer.from('0.16666666666666666')).toBeCloseTo(0.1666, 3)
    expect(transformer.to(0.1666)).toBe(0.1666)
    expect(transformer.from(null)).toBe(0)
  })
})
