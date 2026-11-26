import type { QueryRunner } from 'typeorm'
import { CHAT_BRANCH_KINDS } from '@bellum/contracts'
import { ChatMessageBranchProvenance1795100482913 } from '../1795100482913-ChatMessageBranchProvenance'

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
  await new ChatMessageBranchProvenance1795100482913().up(runner)
  return queries.map(normalize)
}

async function downQueries(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new ChatMessageBranchProvenance1795100482913().down(runner)
  return queries.map(normalize)
}

/**
 * #1953.11 / #1953.22 — la provenance d'une branche survit au rechargement.
 *
 * Ce que la migration DOIT garantir :
 *  · ADDITIVE — trois colonnes NULL sur une table existante, aucune ligne touchée ;
 *  · `NULL` est l'état de tout l'existant : un échange qui n'est la réédition
 *    de rien n'a rien à porter — ce n'est pas un trou ;
 *  · « on archive, on ne supprime pas » : la réponse dont on repart est
 *    DÉSIGNÉE, jamais effacée — `ON DELETE SET NULL` perd le lien, jamais le
 *    message ;
 *  · la contrainte SQL connaît les trois natures de branche AVANT le code qui
 *    les écrit (GA-11 / GA-12), et elle est NOMMÉE (GA-177).
 */
describe('ChatMessageBranchProvenance1795100482913', () => {
  it('LIT quelque chose — la migration émet bien des requêtes', async () => {
    expect((await upQueries()).length).toBeGreaterThan(0)
  })

  it('ajoute les trois colonnes de façon idempotente, toutes NULL', async () => {
    const queries = await upQueries()
    expect(queries).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS superseded_at timestamptz'),
        expect.stringContaining('ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS branch_kind text'),
      ]),
    )
  })

  it('désigne la réponse dont on repart sans jamais l’effacer (ON DELETE SET NULL)', async () => {
    const statement = (await upQueries()).find(query => query.includes('branch_of_message_id'))
    expect(statement).toBeDefined()
    expect(statement).toContain('branch_of_message_id uuid REFERENCES chat_messages(id) ON DELETE SET NULL')
  })

  it('la contrainte est NOMMÉE et couvre les trois natures de branche', async () => {
    const check = (await upQueries()).find(query => query.includes('chat_messages_branch_kind_check CHECK'))
    expect(check).toBeDefined()
    for (const kind of CHAT_BRANCH_KINDS) expect(check).toContain(`'${kind}'`)
    // `NULL` reste permis : c'est l'état de tout l'existant et de toute réponse
    // qui n'est la réédition de rien.
    expect(check).toContain('branch_kind IS NULL OR')
  })

  it('n’attrape pas ce qu’elle ne vise pas — aucune ligne existante n’est réécrite', async () => {
    for (const query of await upQueries()) {
      expect(query.startsWith('UPDATE ')).toBe(false)
      expect(query.startsWith('DELETE ')).toBe(false)
    }
  })

  it('le retour retire les colonnes, et rien d’autre', async () => {
    const queries = await downQueries()
    expect(queries).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ALTER TABLE chat_messages DROP COLUMN IF EXISTS branch_of_message_id'),
        expect.stringContaining('ALTER TABLE chat_messages DROP COLUMN IF EXISTS branch_kind'),
        expect.stringContaining('ALTER TABLE chat_messages DROP COLUMN IF EXISTS superseded_at'),
      ]),
    )
    for (const query of queries) expect(query.startsWith('DELETE ')).toBe(false)
  })
})
