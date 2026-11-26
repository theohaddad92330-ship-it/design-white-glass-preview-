import type { QueryRunner } from 'typeorm'
import { ProfileCommercialAuditVersion1796321387251 } from '../1796321387251-ProfileCommercialAuditVersion'

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

// #2908 (#2011.4) — `commercial_audit_version` : une empreinte de contenu,
// jamais un compteur. Additive, nullable : `NULL` tant qu'aucune génération
// n'a encore posé d'empreinte (comportement d'avant, inchangé).
describe('ProfileCommercialAuditVersion1796321387251', () => {
  it('adds commercial_audit_version (text, nullable) on profiles', async () => {
    const { runner, queries } = createRunner()
    await new ProfileCommercialAuditVersion1796321387251().up(runner)
    const add = queries.map(normalize).find(q => q.includes('ADD COLUMN IF NOT EXISTS commercial_audit_version'))
    expect(add).toBeDefined()
    expect(add).toContain('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS commercial_audit_version text')
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new ProfileCommercialAuditVersion1796321387251().down()).rejects.toThrow(
      'down migrations are not supported',
    )
  })
})
