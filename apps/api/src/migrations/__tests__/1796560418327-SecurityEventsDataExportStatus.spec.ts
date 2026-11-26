import type { QueryRunner } from 'typeorm'
import { SecurityEventsDataExportStatus1796560418327 } from '../1796560418327-SecurityEventsDataExportStatus'

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

describe('SecurityEventsDataExportStatus1796560418327', () => {
  it('accepte le code 2xx d’une sortie de données autorisée (data_export), et seulement pour elle (GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new SecurityEventsDataExportStatus1796560418327().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS security_events_status_code_check')
    expect(flat).toContain(
      "CHECK (status_code IS NULL OR status_code IN (401, 403) OR (kind = 'data_export' AND status_code BETWEEN 200 AND 299))",
    )
  })

  it('le down efface les data_export 2xx avant de remettre l’ancien CHECK — jamais une ligne qui le viole', async () => {
    const { runner, queries } = createRunner()
    await new SecurityEventsDataExportStatus1796560418327().down(runner)
    const flat = queries.map(normalize)
    const del = flat.findIndex(q =>
      q.startsWith("DELETE FROM security_events WHERE kind = 'data_export' AND status_code BETWEEN 200 AND 299"),
    )
    const add = flat.findIndex(q => q.includes('CHECK (status_code IS NULL OR status_code IN (401, 403))'))
    expect(del).toBeGreaterThanOrEqual(0)
    expect(add).toBeGreaterThan(del)
  })
})
