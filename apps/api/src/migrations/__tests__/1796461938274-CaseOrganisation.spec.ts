import type { QueryRunner } from 'typeorm'
import { CASE_ORGANISATIONS } from '@bellum/contracts'
import { CaseOrganisation1796461938274 } from '../1796461938274-CaseOrganisation'

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

// #3246 / #3210.3 (lot cloud 14/10) — organisation de la décision, vocabulaire fermé.
describe('CaseOrganisation1796461938274', () => {
  it('ajoute la colonne nullable sur rex_entries ET opportunities, sans valeur devinée', async () => {
    const { runner, queries } = createRunner()
    await new CaseOrganisation1796461938274().up(runner)
    const flat = queries.map(normalize).join(' ')
    for (const table of ['rex_entries', 'opportunities']) {
      expect(flat).toContain(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS organisation text`)
    }
    expect(flat).not.toMatch(/NOT NULL|DEFAULT/)
  })

  it('pose le CHECK, image exacte du vocabulaire du contrat (GA-11/GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new CaseOrganisation1796461938274().up(runner)
    const flat = queries.map(normalize).join(' ')
    for (const code of CASE_ORGANISATIONS) expect(flat).toContain(`'${code}'`)
    expect(flat).toContain('CONSTRAINT rex_entries_organisation_check')
    expect(flat).toContain('CONSTRAINT opportunities_organisation_check')
    expect(flat).toContain('organisation IS NULL OR organisation IN')
  })

  it('down retire contraintes puis colonnes', async () => {
    const { runner, queries } = createRunner()
    await new CaseOrganisation1796461938274().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS rex_entries_organisation_check')
    expect(flat).toContain('DROP COLUMN IF EXISTS organisation')
  })
})
