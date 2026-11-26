import type { QueryRunner } from 'typeorm'
import { OutillageNomsInternes1796610000200 } from '../1796610000200-OutillageNomsInternes'

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

// #4971.1 — les noms des outils maison : une colonne ADDITIVE, posée avant le
// code qui l'écrit (GA-11/12).
describe('OutillageNomsInternes1796610000200', () => {
  it('ajoute une colonne text[] NULLABLE, sans défaut (absente = question passée, jamais « aucun outil »)', async () => {
    const { runner, queries } = createRunner()
    await new OutillageNomsInternes1796610000200().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS tooling_internal_names text[]')
    expect(sql).not.toMatch(/NOT NULL|DEFAULT/i)
  })

  it('n’efface, ne renomme ni ne modifie rien à la montée (ajout seulement)', async () => {
    const { runner, queries } = createRunner()
    await new OutillageNomsInternes1796610000200().up(runner)
    expect(normalize(queries.join(' '))).not.toMatch(/\b(DROP|RENAME|UPDATE|DELETE|ALTER COLUMN)\b/i)
  })

  it('retire la seule colonne ajoutée à la descente', async () => {
    const { runner, queries } = createRunner()
    await new OutillageNomsInternes1796610000200().down(runner)
    expect(normalize(queries.join(' '))).toBe('ALTER TABLE esn_profiles DROP COLUMN IF EXISTS tooling_internal_names;')
  })
})
