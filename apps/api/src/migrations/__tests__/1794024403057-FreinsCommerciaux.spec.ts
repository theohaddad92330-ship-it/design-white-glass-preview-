import type { QueryRunner } from 'typeorm'
import { FreinsCommerciaux1794024403057 } from '../1794024403057-FreinsCommerciaux'

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

// #2055 — lot G4 : les freins commerciaux et les trois relances.
describe('FreinsCommerciaux1794024403057', () => {
  it('ajoute les quatre colonnes : les freins, puis les trois relances', async () => {
    const { runner, queries } = createRunner()
    await new FreinsCommerciaux1794024403057().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS sales_freins text[] NOT NULL DEFAULT '{}'")
    for (const column of ['frein_attempted', 'frein_stopped', 'frein_stopped_reason']) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${column} text`)
    }
  })

  it('ne rend obligatoire aucune relance et ne contraint aucune valeur', async () => {
    // Un frein non renseigné n'est pas un frein absent : c'est la LECTURE qui
    // tient la distinction, jamais une valeur de remplissage écrite en base.
    const { runner, queries } = createRunner()
    await new FreinsCommerciaux1794024403057().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS frein_[a-z_]+ text NOT NULL/)
    expect(sql).not.toContain('CHECK')
  })

  it('ne touche PAS `sales_blockers` ni `main_sales_pain`, qui gardent leurs lecteurs', async () => {
    const { runner, queries } = createRunner()
    await new FreinsCommerciaux1794024403057().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).not.toContain('sales_blockers')
    expect(sql).not.toContain('main_sales_pain')
  })

  it('est rejouable : quatre instructions, toutes en IF NOT EXISTS', async () => {
    const { runner, queries } = createRunner()
    await new FreinsCommerciaux1794024403057().up(runner)
    const statements = normalize(queries.join(' '))
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
    expect(statements.length).toBe(4)
    for (const statement of statements) {
      expect(statement).toContain('IF NOT EXISTS')
    }
  })

  it('sait redescendre', async () => {
    const { runner, queries } = createRunner()
    await new FreinsCommerciaux1794024403057().down(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('DROP COLUMN IF EXISTS sales_freins')
    expect(sql).toContain('DROP COLUMN IF EXISTS frein_stopped_reason')
  })
})
