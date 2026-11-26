import type { QueryRunner } from 'typeorm'
import { TeamCommentsMentions1796321387113 } from '../1796321387113-TeamCommentsMentions'

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

// #2914 (#2128.9) — « mentionner un collègue » dans un commentaire. Additive,
// jamais NULL : un commentaire sans mention reste un tableau vide, pas une
// absence à nommer (ce n'est pas une mesure, c'est un choix de rédaction).
describe('TeamCommentsMentions1796321387113', () => {
  it('adds mentioned_user_ids (uuid[], NOT NULL, default empty array)', async () => {
    const { runner, queries } = createRunner()
    await new TeamCommentsMentions1796321387113().up(runner)
    const flat = queries.map(normalize)
    const add = flat.find(q => q.includes('ADD COLUMN IF NOT EXISTS mentioned_user_ids'))
    expect(add).toBeDefined()
    expect(add).toContain("uuid[] NOT NULL DEFAULT '{}'")
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new TeamCommentsMentions1796321387113().down()).rejects.toThrow('down migrations are not supported')
  })
})
