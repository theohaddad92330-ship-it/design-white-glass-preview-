import type { QueryRunner } from 'typeorm'
import { OpportunityScopeLabel1796372014823 } from '../1796372014823-OpportunityScopeLabel'

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

describe('OpportunityScopeLabel1796372014823 (#3266.1, #3292)', () => {
  it('ajoute une colonne texte nullable `scope_label`, idempotente, sans rien supprimer ni deviner', async () => {
    const queries: string[] = []
    const runner = {
      query: jest.fn(async (sql: string) => {
        queries.push(normalize(sql))
        return []
      }),
    } as unknown as QueryRunner
    await new OpportunityScopeLabel1796372014823().up(runner)
    expect(queries).toEqual(['ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS scope_label text'])
    expect(queries.some(q => /DROP|NOT NULL|UPDATE|INSERT/.test(q))).toBe(false)
  })

  it('down() non supporté (convention du dépôt : additive, vers l’avant)', async () => {
    await expect(new OpportunityScopeLabel1796372014823().down()).rejects.toThrow('down migrations are not supported')
  })
})
