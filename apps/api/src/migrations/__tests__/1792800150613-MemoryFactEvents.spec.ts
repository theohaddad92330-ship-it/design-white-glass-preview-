import type { QueryRunner } from 'typeorm'
import { MEMORY_ITEM_EVENTS } from '@bellum/contracts'
import { MemoryFactEvents1792800150613 } from '../1792800150613-MemoryFactEvents'

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
  await new MemoryFactEvents1792800150613().up(runner)
  return queries.map(normalize)
}

/**
 * #1916.23 — L'HISTORIQUE d'un élément de mémoire.
 *
 * Ce que la migration DOIT garantir :
 *  · ADDITIVE — une table neuve, aucune colonne existante touchée ;
 *  · un geste OUBLIÉ emporte son histoire : « une ligne oubliée disparaît de la
 *    base, pas seulement de l'écran » (`memoryLedger.never.deletedByUser`) — un
 *    ancien texte survivant dans le journal démentirait la phrase ;
 *  · l'effacement d'un compte ne supprime pas l'histoire d'un élément PARTAGÉ,
 *    il en retire l'AUTEUR ;
 *  · la contrainte SQL connaît les gestes AVANT le code qui les écrit (GA-11/12).
 */
describe('MemoryFactEvents1792800150613', () => {
  it('crée la table de façon idempotente, bornée à un espace (workspace_id NOT NULL)', async () => {
    const sql = await upQueries()
    const create = sql.find(q => q.startsWith('CREATE TABLE IF NOT EXISTS memory_fact_events'))
    expect(create).toBeDefined()
    expect(create).toContain('workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE')
  })

  it('un élément oublié emporte son historique (ON DELETE CASCADE sur le fait)', async () => {
    const create = (await upQueries()).find(q => q.startsWith('CREATE TABLE IF NOT EXISTS memory_fact_events'))
    expect(create).toContain('fact_id uuid NOT NULL REFERENCES memory_pinned_facts(id) ON DELETE CASCADE')
  })

  it('un compte effacé retire l’AUTEUR d’un geste, pas le geste (ON DELETE SET NULL)', async () => {
    const create = (await upQueries()).find(q => q.startsWith('CREATE TABLE IF NOT EXISTS memory_fact_events'))
    expect(create).toContain('actor_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL')
  })

  it('contraint le geste aux valeurs du contrat, sous garde de ré-exécution', async () => {
    const check = (await upQueries()).find(q => q.includes('memory_fact_events_event_check'))
    expect(check).toContain(`CHECK (event IN (${MEMORY_ITEM_EVENTS.map(value => `'${value}'`).join(', ')}))`)
    expect(check).toContain('IF NOT EXISTS ( SELECT 1 FROM pg_constraint')
  })

  it('indexe la lecture réelle : l’histoire d’UN élément, dans l’ordre', async () => {
    const sql = await upQueries()
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS memory_fact_events_fact_idx ON memory_fact_events (fact_id, created_at)',
    )
  })

  it('active la RLS, comme la table des éléments qu’elle raconte', async () => {
    const sql = await upQueries()
    expect(sql).toContain('ALTER TABLE memory_fact_events ENABLE ROW LEVEL SECURITY')
  })

  it('ne réécrit, ne supprime et ne rétrécit RIEN d’existant', async () => {
    const sql = await upQueries()
    expect(sql.some(q => q.startsWith('UPDATE '))).toBe(false)
    expect(sql.some(q => q.includes('DELETE FROM'))).toBe(false)
    expect(sql.some(q => q.includes('DROP '))).toBe(false)
    expect(sql.some(q => q.startsWith('ALTER TABLE memory_pinned_facts'))).toBe(false)
  })

  it('down() n’est pas supporté (convention du dépôt — additive, vers l’avant seulement)', async () => {
    await expect(new MemoryFactEvents1792800150613().down()).rejects.toThrow('down migrations are not supported')
  })
})
