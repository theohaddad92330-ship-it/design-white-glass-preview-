import type { QueryRunner } from 'typeorm'
import { OpportunityObjective1794120000000 } from '../1794120000000-OpportunityObjective'

/**
 * #2172.37 — la colonne `objective` est posée AVANT le code qui l'écrit
 * (GA-11 / GA-12), et elle ÉLARGIT : rien n'est retiré, rien n'est resserré.
 */
async function ranQueries(): Promise<string[]> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  await new OpportunityObjective1794120000000().up(runner)
  return queries
}

describe('OpportunityObjective1794120000000 — #2172.37', () => {
  it('lit un corpus NON VIDE — sans ça les trois assertions du bas seraient vraies pour rien', async () => {
    expect((await ranQueries()).length).toBeGreaterThan(0)
  })

  it('ajoute la colonne, de façon idempotente', async () => {
    expect((await ranQueries()).join('\n')).toContain(
      'ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS objective text',
    )
  })

  it('n’enlève rien et ne resserre rien — porte « ajout seulement »', async () => {
    const sql = (await ranQueries()).join('\n')
    for (const forbidden of ['DROP COLUMN', 'DROP TABLE', 'NOT NULL', 'DEFAULT', 'ALTER COLUMN', 'TRUNCATE']) {
      expect(sql).not.toContain(forbidden)
    }
  })

  it('ne se défait pas : `down` refuse plutôt que de perdre ce que quelqu’un a écrit', async () => {
    await expect(new OpportunityObjective1794120000000().down()).rejects.toThrow('down migrations are not supported')
  })
})
