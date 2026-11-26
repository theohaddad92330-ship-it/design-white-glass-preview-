import type { QueryRunner } from 'typeorm'
import { EffectifBusinessUnitBand1795702847909 } from '../1795702847909-EffectifBusinessUnitBand'

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

// #2035.2 — l'effectif de LA BU, distinct du total entreprise/groupe.
describe('EffectifBusinessUnitBand1795702847909', () => {
  it('ajoute la colonne, nullable (aucun CHECK, aucun NOT NULL)', async () => {
    const { runner, queries } = createRunner()
    await new EffectifBusinessUnitBand1795702847909().up(runner)
    const sql = normalize(queries.join(' '))

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS consultant_size_business_unit_band text')
    expect(sql).not.toMatch(/consultant_size_business_unit_band text NOT NULL/)
  })

  it('est rejouable : passe par IF NOT EXISTS', async () => {
    const { runner, queries } = createRunner()
    await new EffectifBusinessUnitBand1795702847909().up(runner)
    const statements = normalize(queries.join(' '))
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
    for (const statement of statements) {
      expect(statement).toContain('IF NOT EXISTS')
    }
  })

  it('sait redescendre', async () => {
    const { runner, queries } = createRunner()
    await new EffectifBusinessUnitBand1795702847909().down(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('DROP COLUMN IF EXISTS consultant_size_business_unit_band')
  })
})
