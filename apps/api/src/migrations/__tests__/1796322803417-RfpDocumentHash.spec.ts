import type { QueryRunner } from 'typeorm'
import { RfpDocumentHash1796322803417 } from '../1796322803417-RfpDocumentHash'

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

// #2957 (#2180.40) — hash documentaire pour la détection de doublon. Additive,
// nullable : un dossier importé avant cette colonne n'a jamais eu son hash
// calculé, jamais un hash deviné après coup.
describe('RfpDocumentHash1796322803417', () => {
  it('adds document_hash (char(64), nullable)', async () => {
    const { runner, queries } = createRunner()
    await new RfpDocumentHash1796322803417().up(runner)
    const flat = queries.map(normalize)
    const add = flat.find(q => q.includes('ADD COLUMN IF NOT EXISTS document_hash'))
    expect(add).toBeDefined()
    expect(add).toContain('char(64)')
    expect(add).not.toContain('NOT NULL')
  })

  it('index le doublon scopé PAR ESPACE — jamais une recherche entre espaces (GA-43)', async () => {
    const { runner, queries } = createRunner()
    await new RfpDocumentHash1796322803417().up(runner)
    const flat = queries.map(normalize)
    const index = flat.find(q => q.includes('CREATE INDEX'))
    expect(index).toBeDefined()
    expect(index).toContain('ON rfps (workspace_id, document_hash)')
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new RfpDocumentHash1796322803417().down()).rejects.toThrow('down migrations are not supported')
  })
})
