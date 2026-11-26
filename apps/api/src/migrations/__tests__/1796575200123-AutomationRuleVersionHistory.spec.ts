import type { QueryRunner } from 'typeorm'
import { AutomationRuleVersionHistory1796575200123 } from '../1796575200123-AutomationRuleVersionHistory'

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

describe('AutomationRuleVersionHistory1796575200123', () => {
  it('ajoute la comparaison rendue et l’historique des versions, sans réécrire aucune ligne', async () => {
    const { runner, queries } = createRunner()
    await new AutomationRuleVersionHistory1796575200123().up(runner)
    const flat = queries.map(normalize)
    const alter = flat.find(q => q.startsWith('ALTER TABLE automation_rules ADD COLUMN'))
    expect(alter).toContain('ADD COLUMN IF NOT EXISTS draft_compared_at timestamptz')
    expect(alter).toContain("ADD COLUMN IF NOT EXISTS version_history jsonb NOT NULL DEFAULT '[]'::jsonb")
    expect(flat.some(q => /\b(UPDATE|DELETE|DROP)\b/.test(q))).toBe(false)
  })

  it('contraint l’historique à un tableau', async () => {
    const { runner, queries } = createRunner()
    await new AutomationRuleVersionHistory1796575200123().up(runner)
    expect(queries.map(normalize).join('\n')).toContain("CHECK (jsonb_typeof(version_history) = 'array')")
  })

  it('down() n’est pas supporté (convention du dépôt — additif, en avant seulement)', async () => {
    await expect(new AutomationRuleVersionHistory1796575200123().down()).rejects.toThrow(
      'down migrations are not supported',
    )
  })
})
