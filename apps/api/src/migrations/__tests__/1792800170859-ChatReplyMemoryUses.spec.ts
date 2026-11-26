import type { QueryRunner } from 'typeorm'
import { MEMORY_SURFACES } from '@bellum/contracts'
import { ChatReplyMemoryUses1792800170859 } from '../1792800170859-ChatReplyMemoryUses'

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
  await new ChatReplyMemoryUses1792800170859().up(runner)
  return queries.map(normalize)
}

async function createStatement(): Promise<string> {
  const create = (await upQueries()).find(q => q.startsWith('CREATE TABLE IF NOT EXISTS chat_reply_memory_uses'))
  expect(create).toBeDefined()
  return create as string
}

/**
 * #1916.18 / #1916.24 — la trace, réponse par réponse, des éléments de mémoire
 * envoyés à Laura.
 *
 * Ce que la migration DOIT garantir :
 *  · ADDITIVE — une table neuve, aucune table existante touchée ;
 *  · des IDENTIFIANTS seulement, jamais une copie du texte d'un élément ;
 *  · une conversation SUPPRIMÉE emporte ses traces ; un compte effacé aussi ;
 *  · un élément supprimé laisse une trace SANS lien (« retiré depuis ») : la
 *    réponse ne prétend pas avoir eu moins d'éléments qu'elle n'en a eu ;
 *  · la contrainte SQL connaît les surfaces AVANT le code qui les écrit.
 */
describe('ChatReplyMemoryUses1792800170859', () => {
  it('vit dans la plage réservée à ce lot', () => {
    const stamp = Number(new ChatReplyMemoryUses1792800170859().name.replace(/\D/g, ''))
    expect(stamp).toBeGreaterThanOrEqual(1792800170000)
    expect(stamp).toBeLessThanOrEqual(1792800179999)
  })

  it('crée la table de façon idempotente, bornée à un espace (workspace_id NOT NULL)', async () => {
    expect(await createStatement()).toContain('workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE')
  })

  it('un compte effacé emporte ses traces (ON DELETE CASCADE sur la personne)', async () => {
    expect(await createStatement()).toContain('user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE')
  })

  it('une conversation supprimée emporte ses traces (ON DELETE CASCADE sur le message)', async () => {
    expect(await createStatement()).toContain('message_id uuid NULL REFERENCES chat_messages(id) ON DELETE CASCADE')
  })

  it('un élément supprimé laisse une trace sans lien (ON DELETE SET NULL), jamais son texte', async () => {
    expect(await createStatement()).toContain('fact_id uuid NULL REFERENCES memory_pinned_facts(id) ON DELETE SET NULL')
  })

  it('ne porte AUCUN contenu : ses colonnes sont des identifiants, une surface et une date', async () => {
    const create = await createStatement()
    const body = create.slice(create.indexOf('(') + 1, create.lastIndexOf(')'))
    const columns = body
      .split(',')
      .map(part => part.trim().split(' ')[0])
      .filter(Boolean)
    expect(columns).toEqual([
      'id',
      'workspace_id',
      'user_id',
      'turn_id',
      'surface',
      'message_id',
      'fact_id',
      'created_at',
    ])
  })

  it('contraint la surface aux valeurs du contrat, sous garde de ré-exécution', async () => {
    const check = (await upQueries()).find(q => q.includes('chat_reply_memory_uses_surface_check'))
    expect(check).toContain(`CHECK (surface IN (${MEMORY_SURFACES.map(value => `'${value}'`).join(', ')}))`)
    expect(check).toContain('IF NOT EXISTS ( SELECT 1 FROM pg_constraint')
  })

  it('indexe les lectures réelles : sous une réponse, par tour, par élément, par personne', async () => {
    const sql = (await upQueries()).join('\n')
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS chat_reply_memory_uses_message_idx ON chat_reply_memory_uses (message_id)',
    )
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS chat_reply_memory_uses_turn_idx ON chat_reply_memory_uses (turn_id)',
    )
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS chat_reply_memory_uses_fact_idx ON chat_reply_memory_uses (fact_id, created_at)',
    )
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS chat_reply_memory_uses_user_idx ON chat_reply_memory_uses (user_id)',
    )
  })

  it('active la RLS (aucun client direct ne lit cette trace)', async () => {
    expect(await upQueries()).toContain('ALTER TABLE chat_reply_memory_uses ENABLE ROW LEVEL SECURITY')
  })

  it('NON — ne touche à aucune table existante (porte « ajout seulement »)', async () => {
    const sql = await upQueries()
    expect(sql.filter(q => /^ALTER TABLE (?!chat_reply_memory_uses\b)/.test(q))).toEqual([])
    expect(sql.filter(q => /\bDROP\b/i.test(q))).toEqual([])
  })
})
