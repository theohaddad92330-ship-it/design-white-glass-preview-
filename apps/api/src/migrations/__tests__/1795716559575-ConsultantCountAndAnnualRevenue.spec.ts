import type { QueryRunner } from 'typeorm'
import { ConsultantCountAndAnnualRevenue1795716559575 } from '../1795716559575-ConsultantCountAndAnnualRevenue'

/** Capture every SQL statement the migration issues (no live DB needed). */
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

// #2088.12/.13 — les deux premiers vrais nombres du questionnaire.
describe('ConsultantCountAndAnnualRevenue1795716559575', () => {
  it('ajoute les trois colonnes, nullable (aucun NOT NULL)', async () => {
    const { runner, queries } = createRunner()
    await new ConsultantCountAndAnnualRevenue1795716559575().up(runner)
    const sql = normalize(queries.join(' '))

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS consultant_count integer')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS annual_revenue_amount integer')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS annual_revenue_period text')
    expect(sql).not.toMatch(/consultant_count integer NOT NULL/)
    expect(sql).not.toMatch(/annual_revenue_amount integer NOT NULL/)
    expect(sql).not.toMatch(/annual_revenue_period text NOT NULL/)
  })

  it('borne les deux nombres à `>= 0` (ou `NULL`), jamais négatifs', async () => {
    const { runner, queries } = createRunner()
    await new ConsultantCountAndAnnualRevenue1795716559575().up(runner)
    const sql = normalize(queries.join(' '))

    expect(sql).toContain('CHECK (consultant_count IS NULL OR consultant_count >= 0)')
    expect(sql).toContain('CHECK (annual_revenue_amount IS NULL OR annual_revenue_amount >= 0)')
  })

  it('est rejouable : chaque ADD COLUMN porte IF NOT EXISTS, chaque ADD CONSTRAINT est précédé d’un DROP CONSTRAINT IF EXISTS', async () => {
    const { runner, queries } = createRunner()
    await new ConsultantCountAndAnnualRevenue1795716559575().up(runner)
    const statements = normalize(queries.join(' '))
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)

    for (const statement of statements) {
      if (statement.startsWith('ALTER TABLE esn_profiles ADD COLUMN')) {
        expect(statement).toContain('IF NOT EXISTS')
      }
      if (statement.startsWith('ALTER TABLE esn_profiles ADD CONSTRAINT')) {
        const name = statement.match(/ADD CONSTRAINT (\S+)/)?.[1]
        expect(statements).toContain(`ALTER TABLE esn_profiles DROP CONSTRAINT IF EXISTS ${name}`)
      }
    }
  })

  it('down : retire les deux contraintes puis les trois colonnes, en IF EXISTS', async () => {
    const { runner, queries } = createRunner()
    await new ConsultantCountAndAnnualRevenue1795716559575().down(runner)
    const sql = normalize(queries.join(' '))

    expect(sql).toContain('DROP CONSTRAINT IF EXISTS esn_profiles_consultant_count_nonneg')
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS esn_profiles_annual_revenue_amount_nonneg')
    expect(sql).toContain('DROP COLUMN IF EXISTS consultant_count')
    expect(sql).toContain('DROP COLUMN IF EXISTS annual_revenue_amount')
    expect(sql).toContain('DROP COLUMN IF EXISTS annual_revenue_period')
  })
})
