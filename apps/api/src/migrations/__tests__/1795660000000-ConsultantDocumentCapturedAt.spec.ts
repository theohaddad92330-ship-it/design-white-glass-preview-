import type { QueryRunner } from 'typeorm'
import { ConsultantDocumentCapturedAt1795660000000 } from '../1795660000000-ConsultantDocumentCapturedAt'

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

// #2569.2 — la date réelle du document, pour départager deux versions du même CV.
describe('ConsultantDocumentCapturedAt1795660000000', () => {
  it('ajoute `captured_at` et `cv_captured_at`, nullables, sans défaut', async () => {
    const { runner, queries } = createRunner()
    await new ConsultantDocumentCapturedAt1795660000000().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS captured_at timestamptz')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS cv_captured_at timestamptz')
    expect(sql).not.toMatch(/NOT NULL/)
    expect(sql).not.toMatch(/DEFAULT/)
  })

  it('est rejouable : IF NOT EXISTS sur chaque instruction', async () => {
    const { runner, queries } = createRunner()
    await new ConsultantDocumentCapturedAt1795660000000().up(runner)
    expect(queries.length).toBe(2)
    for (const statement of queries) expect(normalize(statement)).toContain('IF NOT EXISTS')
  })

  it('sait redescendre — les deux colonnes, jamais une de plus (témoin de non-fuite)', async () => {
    const { runner, queries } = createRunner()
    await new ConsultantDocumentCapturedAt1795660000000().down(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('DROP COLUMN IF EXISTS captured_at')
    expect(sql).toContain('DROP COLUMN IF EXISTS cv_captured_at')
    expect(sql).not.toContain('experience_keys')
  })
})
