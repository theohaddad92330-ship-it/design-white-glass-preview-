import type { QueryRunner } from 'typeorm'
import { OpportunityRisks1796000718437 } from '../1796000718437-OpportunityRisks'

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

describe('OpportunityRisks1796000718437 (#2324.37)', () => {
  it('ajoute une colonne texte nullable `risks`, idempotente, sans rien supprimer ni deviner', async () => {
    const queries: string[] = []
    const runner = {
      query: jest.fn(async (sql: string) => {
        queries.push(normalize(sql))
        return []
      }),
    } as unknown as QueryRunner
    await new OpportunityRisks1796000718437().up(runner)
    expect(queries).toEqual(['ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS risks text'])
    expect(queries.some(q => /DROP|NOT NULL|UPDATE|INSERT/.test(q))).toBe(false)
  })

  it('down() non supporté (convention du dépôt : additive, vers l’avant)', async () => {
    await expect(new OpportunityRisks1796000718437().down()).rejects.toThrow('down migrations are not supported')
  })
})
