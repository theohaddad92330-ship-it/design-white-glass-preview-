import type { QueryRunner } from 'typeorm'
import { SecurityEventsLeakDetected1796350991511 } from '../1796350991511-SecurityEventsLeakDetected'

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

describe('SecurityEventsLeakDetected1796350991511', () => {
  it('élargit le CHECK de kind à authorization_denied ET leak_detected (GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new SecurityEventsLeakDetected1796350991511().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain("'authorization_denied'")
    expect(flat).toContain("'leak_detected'")
  })

  it('retire la contrainte de kind avant de la reposer — jamais deux CHECK en même temps', async () => {
    const { runner, queries } = createRunner()
    await new SecurityEventsLeakDetected1796350991511().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS security_events_kind_check')
    expect(flat).toContain('ADD CONSTRAINT security_events_kind_check CHECK')
  })

  it('rend status_code NULLABLE et accepte NULL dans son CHECK — jamais une valeur inventée', async () => {
    const { runner, queries } = createRunner()
    await new SecurityEventsLeakDetected1796350991511().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('ALTER COLUMN status_code DROP NOT NULL')
    expect(flat).toContain('CHECK (status_code IS NULL OR status_code IN (401, 403))')
  })

  it('down() referme le CHECK sur la seule valeur d’origine et restaure NOT NULL', async () => {
    const { runner, queries } = createRunner()
    await new SecurityEventsLeakDetected1796350991511().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).not.toContain("'leak_detected'")
    expect(flat).toContain("'authorization_denied'")
    expect(flat).toContain('ALTER COLUMN status_code SET NOT NULL')
  })
})
