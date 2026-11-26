import { FAVORITE_ENTITY_TYPES } from '@bellum/contracts'
import type { QueryRunner } from 'typeorm'
import { TalentFavorites1790973000002 } from '../1790973000002-TalentFavorites'

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

async function upQueries(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new TalentFavorites1790973000002().up(runner)
  return queries.map(normalize)
}

describe('TalentFavorites1790973000002', () => {
  it('élargit la contrainte pour couvrir TOUT le contrat TypeScript courant (GA-12)', async () => {
    const flat = await upQueries()
    const check = flat.find(q => q.includes('user_favorites_entity_type_check') && q.includes('ADD CONSTRAINT'))
    expect(check).toBeDefined()
    for (const type of FAVORITE_ENTITY_TYPES) {
      expect(check).toContain(`'${type}'`)
    }
  })

  it('dépose la contrainte avant de la reposer (GA-11 — jamais deux fois "already exists")', async () => {
    const flat = await upQueries()
    expect(flat).toContain('ALTER TABLE user_favorites DROP CONSTRAINT IF EXISTS user_favorites_entity_type_check')
  })

  it('down() revient EXACTEMENT à la liste précédente, pas plus large', async () => {
    const { runner, queries } = createRunner()
    await new TalentFavorites1790973000002().down(runner)
    const flat = queries.map(normalize)
    const check = flat.find(q => q.includes('ADD CONSTRAINT'))
    expect(check).toContain("CHECK (entity_type IN ('contact', 'account'))")
    expect(check).not.toContain('talent')
  })
})
