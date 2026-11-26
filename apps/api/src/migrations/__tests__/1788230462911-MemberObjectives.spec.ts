import type { QueryRunner } from 'typeorm'
import { MemberObjectives1788230462911 } from '../1788230462911-MemberObjectives'

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

describe('MemberObjectives1788230462911', () => {
  it('creates the member_objectives table with three nullable targets', async () => {
    const { runner, queries } = createRunner()
    await new MemberObjectives1788230462911().up(runner)
    const create = queries.map(normalize).find(q => q.includes('CREATE TABLE IF NOT EXISTS member_objectives'))
    expect(create).toBeDefined()
    expect(create).toContain('user_id uuid NOT NULL')
    expect(create).toContain('workspace_id uuid NOT NULL')
    expect(create).toContain('period_month date NOT NULL')
    expect(create).toContain('target_meetings integer')
    expect(create).toContain('target_accounts integer')
    expect(create).toContain('target_revenue numeric')
  })

  it('enforces one objective per (user, workspace, month) for the upsert', async () => {
    const { runner, queries } = createRunner()
    await new MemberObjectives1788230462911().up(runner)
    const uniq = queries.map(normalize).find(q => q.includes('member_objectives_user_ws_month_uniq'))
    expect(uniq).toBeDefined()
    expect(uniq).toContain('UNIQUE INDEX')
    expect(uniq).toContain('ON member_objectives (user_id, workspace_id, period_month)')
  })

  it('enables RLS: member manages their own, manager reads the workspace', async () => {
    const { runner, queries } = createRunner()
    await new MemberObjectives1788230462911().up(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain('ALTER TABLE member_objectives ENABLE ROW LEVEL SECURITY')
    const ownPolicy = flat.find(q => q.includes('Members manage their own objective'))
    expect(ownPolicy).toBeDefined()
    expect(ownPolicy).toContain('auth.uid() = user_id')
    const readPolicy = flat.find(q => q.includes('Members can read their workspace objectives'))
    expect(readPolicy).toBeDefined()
    expect(readPolicy).toContain('SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()')
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new MemberObjectives1788230462911().down()).rejects.toThrow('down migrations are not supported')
  })
})
