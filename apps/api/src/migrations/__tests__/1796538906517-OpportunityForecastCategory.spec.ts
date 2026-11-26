import type { QueryRunner } from 'typeorm'
import { FORECAST_CATEGORIES } from '@bellum/contracts'
import { OpportunityForecastCategory1796538906517 } from '../1796538906517-OpportunityForecastCategory'

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

async function up(): Promise<string> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  await new OpportunityForecastCategory1796538906517().up(runner)
  return queries.map(normalize).join(' ; ')
}

describe('OpportunityForecastCategory1796538906517', () => {
  it('colonne nullable + CHECK égal à la liste des contrats, posé avant tout code écrivant', async () => {
    const flat = await up()
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS forecast_category text NULL')
    const list = FORECAST_CATEGORIES.map(value => `'${value}'`).join(', ')
    expect(flat).toContain(`CHECK (forecast_category IS NULL OR forecast_category IN (${list}))`)
  })

  it('journal append-only des montants et des dates, RLS activée', async () => {
    const flat = await up()
    expect(flat).toContain('CREATE TABLE IF NOT EXISTS opportunity_field_changes')
    expect(flat).toContain("CHECK (field IN ('amount_cents', 'expected_close_on'))")
    expect(flat).toContain('ALTER TABLE opportunity_field_changes ENABLE ROW LEVEL SECURITY')
  })

  it('un trigger journalise montant ET date prévue sur TOUT chemin d’écriture, seulement si la valeur change', async () => {
    const flat = await up()
    expect(flat).toContain('AFTER UPDATE OF amount_cents, expected_close_on ON opportunities')
    expect(flat).toContain('NEW.amount_cents IS DISTINCT FROM OLD.amount_cents')
    expect(flat).toContain('NEW.expected_close_on IS DISTINCT FROM OLD.expected_close_on')
  })
})
