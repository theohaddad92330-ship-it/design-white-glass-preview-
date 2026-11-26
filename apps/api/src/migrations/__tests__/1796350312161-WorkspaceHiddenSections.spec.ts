import type { QueryRunner } from 'typeorm'
import { WorkspaceHiddenSections1796350312161 } from '../1796350312161-WorkspaceHiddenSections'

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

// #2957 (#2179.2/.35) — sections de navigation masquables par un admin d'espace.
describe('WorkspaceHiddenSections1796350312161', () => {
  it('adds hidden_sections (text[], NOT NULL, default {})', async () => {
    const { runner, queries } = createRunner()
    await new WorkspaceHiddenSections1796350312161().up(runner)
    const flat = queries.map(normalize)
    const add = flat.find(q => q.includes('ADD COLUMN IF NOT EXISTS hidden_sections'))
    expect(add).toBeDefined()
    expect(add).toContain('text[]')
    expect(add).toContain('NOT NULL')
    expect(add).toContain("DEFAULT '{}'")
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new WorkspaceHiddenSections1796350312161().down()).rejects.toThrow('down migrations are not supported')
  })
})
