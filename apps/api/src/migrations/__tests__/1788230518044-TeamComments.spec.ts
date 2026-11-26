import type { QueryRunner } from 'typeorm'
import { TeamComments1788230518044 } from '../1788230518044-TeamComments'

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

describe('TeamComments1788230518044', () => {
  it('creates the team_comments table, account link nullable on delete', async () => {
    const { runner, queries } = createRunner()
    await new TeamComments1788230518044().up(runner)
    const create = queries.map(normalize).find(q => q.includes('CREATE TABLE IF NOT EXISTS team_comments'))
    expect(create).toBeDefined()
    expect(create).toContain('workspace_id uuid NOT NULL')
    expect(create).toContain('author_user_id uuid NOT NULL')
    expect(create).toContain('body text NOT NULL')
    expect(create).toContain('account_id uuid REFERENCES accounts(id) ON DELETE SET NULL')
  })

  it('indexes the feed newest-first per workspace', async () => {
    const { runner, queries } = createRunner()
    await new TeamComments1788230518044().up(runner)
    const idx = queries.map(normalize).find(q => q.includes('team_comments_workspace_created_idx'))
    expect(idx).toBeDefined()
    expect(idx).toContain('ON team_comments (workspace_id, created_at DESC)')
  })

  it('enables workspace-scoped RLS (read + post) and author-owned delete', async () => {
    const { runner, queries } = createRunner()
    await new TeamComments1788230518044().up(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain('ALTER TABLE team_comments ENABLE ROW LEVEL SECURITY')
    const read = flat.find(q => q.includes('Members can read their workspace comments'))
    expect(read).toBeDefined()
    expect(read).toContain('SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()')
    const post = flat.find(q => q.includes('Members can post in their workspace'))
    expect(post).toBeDefined()
    expect(post).toContain('auth.uid() = author_user_id')
    const del = flat.find(q => q.includes('Authors can delete their own comment'))
    expect(del).toBeDefined()
    expect(del).toContain('FOR DELETE')
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new TeamComments1788230518044().down()).rejects.toThrow('down migrations are not supported')
  })
})
