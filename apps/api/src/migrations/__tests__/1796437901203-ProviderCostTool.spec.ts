import type { QueryRunner } from 'typeorm'
import { ProviderCostTool1796437901203 } from '../1796437901203-ProviderCostTool'
import { PROVIDER_COST_TOOL_PATTERN } from '../../modules/analytics/provider-cost.service'

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

/**
 * #2442.12 (épopée #2879, lot M10 09/10) — la colonne `tool` de
 * `provider_costs` et sa contrainte, posées AVANT le code qui les écrit
 * (GA-11/GA-12).
 */
describe('ProviderCostTool1796437901203', () => {
  it('ajoute une colonne NULLABLE — une ligne d’avant, ou hors outil, ne porte aucun outil deviné', async () => {
    const { runner, queries } = createRunner()
    await new ProviderCostTool1796437901203().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS tool text')
    expect(flat).not.toMatch(/tool text (NOT NULL|DEFAULT)/)
  })

  it('la contrainte admet EXACTEMENT la forme que le service écrit — la même expression des deux côtés', async () => {
    const { runner, queries } = createRunner()
    await new ProviderCostTool1796437901203().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS provider_costs_tool_check')
    expect(flat).toContain(`CHECK (tool IS NULL OR tool ~ '${PROVIDER_COST_TOOL_PATTERN.source}')`)
  })

  it('sait dire NON — la forme refuse un nom qui n’est pas un identifiant d’outil', () => {
    expect(PROVIDER_COST_TOOL_PATTERN.test('web_search')).toBe(true)
    expect(PROVIDER_COST_TOOL_PATTERN.test('Web Search; DROP')).toBe(false)
    expect(PROVIDER_COST_TOOL_PATTERN.test('')).toBe(false)
  })

  it('down() retire la contrainte puis la colonne', async () => {
    const { runner, queries } = createRunner()
    await new ProviderCostTool1796437901203().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS provider_costs_tool_check')
    expect(flat).toContain('DROP COLUMN IF EXISTS tool')
  })
})
