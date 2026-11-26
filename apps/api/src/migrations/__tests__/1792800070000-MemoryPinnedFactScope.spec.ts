import type { QueryRunner } from 'typeorm'
import { MemoryPinnedFactScope1792800070000 } from '../1792800070000-MemoryPinnedFactScope'

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

/**
 * #1918.1 — la portée « moi uniquement » d'un élément de mémoire.
 *
 * Ce que la migration DOIT garantir, et que ces tests tiennent :
 *  · ADDITIVE — une colonne de plus, rien de retiré, rien de réécrit ;
 *  · AUCUNE visibilité changée en silence — l'existant retombe sur `workspace`,
 *    exactement ce que chaque ligne était avant (tout épinglage était lu par
 *    tout l'espace, `memory.service.ts` avant ce lot) ;
 *  · la contrainte SQL connaît les DEUX valeurs avant que le code n'en écrive
 *    une (GA-11 / GA-12).
 */
describe('MemoryPinnedFactScope1792800070000', () => {
  it('ajoute `scope` de façon idempotente, avec `workspace` pour TOUTE ligne existante', async () => {
    const { runner, queries } = createRunner()
    await new MemoryPinnedFactScope1792800070000().up(runner)
    const sql = queries.map(normalize)

    expect(sql).toContain(
      "ALTER TABLE memory_pinned_facts ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'workspace'",
    )
  })

  it('contraint la portée aux deux valeurs du contrat, sous garde de ré-exécution', async () => {
    const { runner, queries } = createRunner()
    await new MemoryPinnedFactScope1792800070000().up(runner)
    const check = queries.map(normalize).find(q => q.includes('memory_pinned_facts_scope_check'))

    expect(check).toContain("CHECK (scope IN ('user', 'workspace'))")
    expect(check).toContain('IF NOT EXISTS ( SELECT 1 FROM pg_constraint')
  })

  it('n’ajoute AUCUNE colonne de propriétaire : `user_id` l’est déjà (NOT NULL, estampillé du jeton)', async () => {
    const { runner, queries } = createRunner()
    await new MemoryPinnedFactScope1792800070000().up(runner)
    const sql = queries.map(normalize)

    // Deux colonnes pour dire « à qui est cette ligne » divergeraient au
    // premier chemin d'écriture qui n'en remplit qu'une.
    expect(sql.some(q => /ADD COLUMN IF NOT EXISTS (owner|owner_id|owner_user_id)\b/.test(q))).toBe(false)
  })

  it('ne réécrit, ne supprime et ne rétrécit RIEN', async () => {
    const { runner, queries } = createRunner()
    await new MemoryPinnedFactScope1792800070000().up(runner)
    const sql = queries.map(normalize)

    expect(sql.some(q => q.startsWith('UPDATE memory_pinned_facts'))).toBe(false)
    expect(sql.some(q => q.includes('DELETE FROM'))).toBe(false)
    expect(sql.some(q => q.includes('DROP '))).toBe(false)
  })

  it('down() n’est pas supporté (convention du dépôt — additive, vers l’avant seulement)', async () => {
    await expect(new MemoryPinnedFactScope1792800070000().down()).rejects.toThrow('down migrations are not supported')
  })
})
