import type { QueryRunner } from 'typeorm'
import { EXPERIENCE_DATE_PRECISIONS } from '@bellum/contracts'
import { ConsultantExperienceDatePrecision1796437902201 } from '../1796437902201-ConsultantExperienceDatePrecision'

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

const flat = (queries: string[]): string => queries.map(sql => sql.replace(/\s+/g, ' ').trim()).join(' ')

describe('ConsultantExperienceDatePrecision1796437902201 (#3935, lot P03)', () => {
  it('ajoute une précision NULLABLE par date — NULL = date saisie telle quelle', async () => {
    const { runner, queries } = createRunner()
    await new ConsultantExperienceDatePrecision1796437902201().up(runner)
    const sql = flat(queries)
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS date_debut_precision text')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS date_fin_precision text')
    expect(flat(queries.filter(q => q.includes('ADD COLUMN')))).not.toContain('NOT NULL')
  })

  it('chaque colonne porte un CHECK NOMMÉ couvrant toute la précision (GA-12, GA-177)', async () => {
    const { runner, queries } = createRunner()
    await new ConsultantExperienceDatePrecision1796437902201().up(runner)
    const sql = flat(queries)
    for (const column of ['date_debut_precision', 'date_fin_precision']) {
      expect(sql).toContain(`ADD CONSTRAINT consultant_experiences_${column}_check`)
      expect(sql).toContain(`CHECK (${column} IS NULL OR ${column} IN (`)
    }
    for (const precision of EXPERIENCE_DATE_PRECISIONS) expect(sql).toContain(`'${precision}'`)
    expect(EXPERIENCE_DATE_PRECISIONS).toEqual(['year', 'month'])
  })

  it('down() retire tout ce que up() a posé', async () => {
    const { runner, queries } = createRunner()
    await new ConsultantExperienceDatePrecision1796437902201().down(runner)
    const sql = flat(queries)
    expect(sql).toContain('DROP COLUMN IF EXISTS date_debut_precision')
    expect(sql).toContain('DROP COLUMN IF EXISTS date_fin_precision')
  })
})
