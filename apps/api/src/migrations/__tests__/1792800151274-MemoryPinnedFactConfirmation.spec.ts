import type { QueryRunner } from 'typeorm'
import { MemoryPinnedFactConfirmation1792800151274 } from '../1792800151274-MemoryPinnedFactConfirmation'

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
  await new MemoryPinnedFactConfirmation1792800151274().up(runner)
  return queries.map(normalize)
}

/**
 * Q1 (décision de Louis du 13/09) — UNE NOTE DE LAURA CONFIRMÉE PAR UNE PERSONNE.
 *
 * Ce que la migration DOIT garantir :
 *  · ADDITIVE — deux colonnes nullables, rien de retiré, aucune donnée réécrite
 *    (aucune note existante ne devient « confirmée » en silence) ;
 *  · l'ORIGINE n'est pas touchée : une note reste « retenue d'une réponse de
 *    Laura » — la confirmation s'ajoute, elle ne réécrit pas la provenance ;
 *  · l'effacement d'un compte retire le NOM du confirmateur, pas la confirmation.
 */
describe('MemoryPinnedFactConfirmation1792800151274', () => {
  it('ajoute la date de confirmation, nullable, de façon idempotente', async () => {
    expect(await upQueries()).toContain(
      'ALTER TABLE memory_pinned_facts ADD COLUMN IF NOT EXISTS confirmed_at timestamptz NULL',
    )
  })

  it('ajoute le confirmateur, nullable, dont l’effacement du compte retire le lien sans retirer la confirmation', async () => {
    expect(await upQueries()).toContain(
      'ALTER TABLE memory_pinned_facts ADD COLUMN IF NOT EXISTS confirmed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL',
    )
  })

  it('ne réécrit AUCUNE ligne, ne touche pas à l’origine, ne supprime et ne rétrécit rien', async () => {
    const sql = await upQueries()
    expect(sql.some(q => q.startsWith('UPDATE '))).toBe(false)
    expect(sql.some(q => /origin/.test(q))).toBe(false)
    expect(sql.some(q => q.includes('DELETE FROM') || q.includes('DROP ') || q.includes('NOT NULL'))).toBe(false)
  })

  it('down() n’est pas supporté (convention du dépôt — additive, vers l’avant seulement)', async () => {
    await expect(new MemoryPinnedFactConfirmation1792800151274().down()).rejects.toThrow(
      'down migrations are not supported',
    )
  })
})
