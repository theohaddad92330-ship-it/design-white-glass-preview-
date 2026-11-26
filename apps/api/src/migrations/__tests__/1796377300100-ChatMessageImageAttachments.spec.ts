import type { QueryRunner } from 'typeorm'
import { ChatMessageImageAttachments1796377300100 } from '../1796377300100-ChatMessageImageAttachments'

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
  await new ChatMessageImageAttachments1796377300100().up(runner)
  return queries.map(normalize)
}

async function downQueries(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new ChatMessageImageAttachments1796377300100().down(runner)
  return queries.map(normalize)
}

// #2876 (#2433.4) — la colonne qui fait survivre l'image d'un message ENVOYÉ
// à un rechargement du fil, et la rend lisible par un autre membre de
// l'espace (contrairement à l'URL `blob:` locale d'avant ce lot).
describe('ChatMessageImageAttachments1796377300100', () => {
  it('ajoute image_attachments (jsonb, nullable) sur chat_messages, de façon idempotente', async () => {
    const queries = await upQueries()
    expect(queries).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS image_attachments jsonb'),
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
        expect.stringContaining('ALTER TABLE chat_messages DROP COLUMN IF EXISTS image_attachments'),
      ]),
    )
    for (const query of queries) expect(query.startsWith('DELETE ')).toBe(false)
  })
})
