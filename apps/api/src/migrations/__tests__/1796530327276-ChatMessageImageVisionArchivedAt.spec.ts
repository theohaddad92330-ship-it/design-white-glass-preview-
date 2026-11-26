import type { QueryRunner } from 'typeorm'
import { ChatMessageImageVisionArchivedAt1796530327276 } from '../1796530327276-ChatMessageImageVisionArchivedAt'

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

async function upQueries(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new ChatMessageImageVisionArchivedAt1796530327276().up(runner)
  return queries.map(normalize)
}

async function downQueries(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new ChatMessageImageVisionArchivedAt1796530327276().down(runner)
  return queries.map(normalize)
}

// #2876 (décision Louis 14/10) — la colonne qui porte « archivé, pas
// supprimé » pour les zones vision d'une image dont la rétention est dépassée.
describe('ChatMessageImageVisionArchivedAt1796530327276', () => {
  it('ajoute image_vision_archived_at (timestamptz, nullable) sur chat_messages, de façon idempotente', async () => {
    const queries = await upQueries()
    expect(queries).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS image_vision_archived_at timestamptz',
        ),
      ]),
    )
  })

  it('n’attrape pas ce qu’elle ne vise pas — aucune ligne existante n’est réécrite', async () => {
    for (const query of await upQueries()) {
      expect(query.startsWith('UPDATE ')).toBe(false)
      expect(query.startsWith('DELETE ')).toBe(false)
    }
  })

  it('le retour retire la colonne, et rien d’autre', async () => {
    const queries = await downQueries()
    expect(queries).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ALTER TABLE chat_messages DROP COLUMN IF EXISTS image_vision_archived_at'),
      ]),
    )
    for (const query of queries) expect(query.startsWith('DELETE ')).toBe(false)
  })
})
