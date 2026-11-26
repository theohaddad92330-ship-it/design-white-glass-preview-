import type { QueryRunner } from 'typeorm'
import { ConversationSummaryPerMember1790700047318 } from '../1790700047318-ConversationSummaryPerMember'

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

describe('ConversationSummaryPerMember1790700047318', () => {
  it("ajoute l'estampille d'archivage, nullable (une ligne vivante n'en porte pas)", async () => {
    const { runner, queries } = createRunner()
    await new ConversationSummaryPerMember1790700047318().up(runner)

    expect(queries.map(normalize)).toContain(
      'ALTER TABLE conversation_summaries ADD COLUMN IF NOT EXISTS superseded_at timestamptz',
    )
  })

  it('recompose la portée : au plus un résumé VIVANT par (personne, espace, fil)', async () => {
    const { runner, queries } = createRunner()
    await new ConversationSummaryPerMember1790700047318().up(runner)
    const index = queries.map(normalize).find(sql => sql.includes('conversation_summaries_owner_uidx'))

    expect(index).toContain('CREATE UNIQUE INDEX IF NOT EXISTS conversation_summaries_owner_uidx')
    expect(index).toContain('ON conversation_summaries (user_id, workspace_id, conversation_id)')
    // Partiel : une ligne archivée ne contraint plus rien, sinon la première
    // écriture d'un auteur entrerait en collision avec sa propre archive.
    expect(index).toContain('WHERE superseded_at IS NULL')
  })

  it("retire l'ancien index d'espace — APRÈS avoir posé le nouveau", async () => {
    const { runner, queries } = createRunner()
    await new ConversationSummaryPerMember1790700047318().up(runner)
    const sql = queries.map(normalize)
    const created = sql.findIndex(query =>
      query.includes('CREATE UNIQUE INDEX IF NOT EXISTS conversation_summaries_owner_uidx'),
    )
    const dropped = sql.findIndex(query => query.includes('DROP INDEX IF EXISTS conversation_summaries_scope_uidx'))

    expect(created).toBeGreaterThanOrEqual(0)
    expect(dropped).toBeGreaterThan(created)
  })

  it('archive les lignes existantes sans les effacer ni les réécrire', async () => {
    const { runner, queries } = createRunner()
    await new ConversationSummaryPerMember1790700047318().up(runner)
    const sql = queries.map(normalize)
    const stamp = sql.find(query => query.startsWith('UPDATE conversation_summaries'))

    // Toutes les lignes, pas seulement celles qu'on croirait mélangées : rien ne
    // dit qui a écrit quoi, et « non mesuré » n'est pas « zéro collègue ».
    expect(stamp).toBe('UPDATE conversation_summaries SET superseded_at = now() WHERE superseded_at IS NULL')
    // On archive, on ne supprime pas : le texte reste, seule la lecture cesse.
    expect(sql.some(query => query.startsWith('DELETE FROM conversation_summaries'))).toBe(false)
    expect(sql.some(query => query.includes('TRUNCATE'))).toBe(false)
    expect(sql.some(query => query.includes('SET summary'))).toBe(false)
  })

  it("l'estampille est posée AVANT que le nouvel index ne naisse", async () => {
    const { runner, queries } = createRunner()
    await new ConversationSummaryPerMember1790700047318().up(runner)
    const sql = queries.map(normalize)
    const stamped = sql.findIndex(query => query.startsWith('UPDATE conversation_summaries'))
    const created = sql.findIndex(query => query.includes('conversation_summaries_owner_uidx'))

    expect(stamped).toBeGreaterThanOrEqual(0)
    expect(created).toBeGreaterThan(stamped)
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new ConversationSummaryPerMember1790700047318().down()).rejects.toThrow(
      'down migrations are not supported',
    )
  })
})
