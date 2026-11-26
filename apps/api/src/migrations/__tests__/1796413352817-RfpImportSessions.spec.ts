import type { QueryRunner } from 'typeorm'
import { RfpImportSessions1796413352817 } from '../1796413352817-RfpImportSessions'

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

// #2957 (#2180.53) — l'import interruptible et reprenable.
describe('RfpImportSessions1796413352817', () => {
  it('crée la table avec un statut contraint aux trois états', async () => {
    const { runner, queries } = createRunner()
    await new RfpImportSessions1796413352817().up(runner)
    const create = queries.map(normalize).find(q => q.includes('CREATE TABLE IF NOT EXISTS rfp_import_sessions'))
    expect(create).toBeDefined()
    expect(create).toContain("CHECK (status IN ('in_progress', 'confirmed', 'cancelled'))")
    expect(create).toContain('preview jsonb NOT NULL')
  })

  it('garantit UNE session en cours par espace et par personne (index unique partiel)', async () => {
    const { runner, queries } = createRunner()
    await new RfpImportSessions1796413352817().up(runner)
    const unique = queries.map(normalize).find(q => q.includes('CREATE UNIQUE INDEX'))
    expect(unique).toContain('(workspace_id, user_id)')
    expect(unique).toContain("WHERE status = 'in_progress'")
  })

  it('ne stocke aucun octet de fichier (pas de colonne base64/bytea)', async () => {
    const { runner, queries } = createRunner()
    await new RfpImportSessions1796413352817().up(runner)
    const create = queries.map(normalize).find(q => q.includes('CREATE TABLE'))!
    expect(create).not.toMatch(/bytea|base64|file_base64/)
  })

  it('down() supprime la table', async () => {
    const { runner, queries } = createRunner()
    await new RfpImportSessions1796413352817().down(runner)
    expect(queries.map(normalize)).toContain('DROP TABLE IF EXISTS rfp_import_sessions')
  })
})
