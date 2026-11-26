import type { QueryRunner } from 'typeorm'
import { SharedPersonCoordinates1796546100000 } from '../1796546100000-SharedPersonCoordinates'

async function run(): Promise<string[]> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  await new SharedPersonCoordinates1796546100000().up(runner)
  return queries
}

describe('SharedPersonCoordinates1796546100000 (#3989.7)', () => {
  it('rattache chaque coordonnée à un fait commun NOMMÉ, et l’effacement RGPD l’emporte (CASCADE)', async () => {
    const create = (await run()).find(q => q.includes('CREATE TABLE IF NOT EXISTS shared_person_coordinates')) ?? ''
    expect(create).toContain('REFERENCES shared_company_people (id) ON DELETE CASCADE')
    expect(create).toContain('CHECK (email IS NOT NULL OR phone IS NOT NULL)')
  })

  it('sait dire NON — ni espace, ni note, ni statut, ni coût, ni fournisseur', async () => {
    const create = (await run()).find(q => q.includes('CREATE TABLE IF NOT EXISTS shared_person_coordinates')) ?? ''
    expect(create).not.toMatch(/workspace|user_id|account_id|note|status|cost|credit|provider|source/i)
  })

  it('RLS activée', async () => {
    expect(await run()).toContain('ALTER TABLE shared_person_coordinates ENABLE ROW LEVEL SECURITY')
  })
})
