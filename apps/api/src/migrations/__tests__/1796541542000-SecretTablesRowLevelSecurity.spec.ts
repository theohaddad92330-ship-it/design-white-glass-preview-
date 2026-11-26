import type { QueryRunner } from 'typeorm'
import { SecretTablesRowLevelSecurity1796541542000 } from '../1796541542000-SecretTablesRowLevelSecurity'

async function run(direction: 'up' | 'down'): Promise<string[]> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  await new SecretTablesRowLevelSecurity1796541542000()[direction](runner)
  return queries.map(sql => sql.replace(/\s+/g, ' ').trim())
}

const TABLES = [
  'oauth_clients',
  'oauth_authorization_codes',
  'oauth_refresh_tokens',
  'oauth_consents',
  'api_keys',
  'google_connections',
  'user_sessions',
]

describe('SecretTablesRowLevelSecurity1796541542000 — audit IA M6', () => {
  it('active la RLS et retire les droits anon/authenticated, SANS aucune policy', async () => {
    const flat = await run('up')
    for (const t of TABLES) {
      expect(flat).toContain(`ALTER TABLE IF EXISTS ${t} ENABLE ROW LEVEL SECURITY`)
      expect(flat.some(q => q.includes(`REVOKE ALL ON public.${t} FROM anon, authenticated`))).toBe(true)
    }
    expect(flat.some(q => q.includes('CREATE POLICY'))).toBe(false)
  })

  it('down : RLS désactivée et droits par défaut rétablis', async () => {
    const flat = await run('down')
    for (const t of TABLES) {
      expect(flat).toContain(`ALTER TABLE IF EXISTS ${t} DISABLE ROW LEVEL SECURITY`)
      expect(flat.some(q => q.includes(`GRANT ALL ON public.${t} TO anon, authenticated`))).toBe(true)
    }
  })
})
