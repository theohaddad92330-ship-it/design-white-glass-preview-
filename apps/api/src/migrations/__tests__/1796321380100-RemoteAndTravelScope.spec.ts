import type { QueryRunner } from 'typeorm'
import { RemoteAndTravelScope1796321380100 } from '../1796321380100-RemoteAndTravelScope'

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

describe('RemoteAndTravelScope1796321380100', () => {
  it('ajoute la colonne, NOT NULL DEFAULT tableau vide (#2036.2)', async () => {
    const { runner, queries } = createRunner()
    await new RemoteAndTravelScope1796321380100().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain(`ADD COLUMN IF NOT EXISTS remote_and_travel_scope text[] NOT NULL DEFAULT '{}'`)
  })

  it('est rejouable : passe par IF NOT EXISTS', async () => {
    const { runner, queries } = createRunner()
    await new RemoteAndTravelScope1796321380100().up(runner)
    const statements = normalize(queries.join(' '))
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
    expect(statements.length).toBe(1)
    expect(statements[0]).toContain('IF NOT EXISTS')
  })

  it('sait redescendre', async () => {
    const { runner, queries } = createRunner()
    await new RemoteAndTravelScope1796321380100().down(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('DROP COLUMN IF EXISTS remote_and_travel_scope')
  })
})
