import type { QueryRunner } from 'typeorm'
import { CASE_BUYING_MODELS, CASE_STRATEGIES } from '@bellum/contracts'
import { CaseStrategyBuyingModel1796440123457 } from '../1796440123457-CaseStrategyBuyingModel'

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

// #3246 / #3210.3 (lot W9) — stratégie et modèle d'achat, vocabulaires fermés.
describe('CaseStrategyBuyingModel1796440123457', () => {
  it('ajoute les deux colonnes nullable sur rex_entries ET opportunities, sans valeur devinée', async () => {
    const { runner, queries } = createRunner()
    await new CaseStrategyBuyingModel1796440123457().up(runner)
    const flat = queries.map(normalize).join(' ')
    for (const table of ['rex_entries', 'opportunities']) {
      expect(flat).toContain(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS strategy text`)
      expect(flat).toContain(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS buying_model text`)
    }
    expect(flat).not.toMatch(/NOT NULL|DEFAULT/)
  })

  it('pose les CHECK, image exacte des vocabulaires du contrat (GA-11/GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new CaseStrategyBuyingModel1796440123457().up(runner)
    const flat = queries.map(normalize).join(' ')
    for (const code of [...CASE_STRATEGIES, ...CASE_BUYING_MODELS]) expect(flat).toContain(`'${code}'`)
    expect(flat).toContain('CONSTRAINT rex_entries_strategy_check')
    expect(flat).toContain('CONSTRAINT opportunities_buying_model_check')
    expect(flat).toContain('strategy IS NULL OR strategy IN')
  })

  it('down retire contraintes puis colonnes', async () => {
    const { runner, queries } = createRunner()
    await new CaseStrategyBuyingModel1796440123457().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS rex_entries_strategy_check')
    expect(flat).toContain('DROP COLUMN IF EXISTS buying_model')
  })
})
