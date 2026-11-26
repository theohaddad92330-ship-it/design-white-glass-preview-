import type { QueryRunner } from 'typeorm'
import { memoryItemKinds } from '@bellum/contracts'
import { MemoryItemKindGoalAdded1795540000000 } from '../1795540000000-MemoryItemKindGoalAdded'

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
  await new MemoryItemKindGoalAdded1795540000000().up(runner)
  return queries.map(normalize)
}

/**
 * #2260.17 — LA CONTRAINTE S'ÉLARGIT AVANT LE CODE QUI ÉCRIT (GA-11 / GA-12).
 *
 * `memory_pinned_facts_kind_check` ne connaissait pas `goal`. Épingler un
 * objectif serait rejeté par Postgres — cette migration ne fait QUE élargir :
 * aucune valeur ne disparaît, aucune ligne n'est réécrite.
 */
describe('MemoryItemKindGoalAdded1795540000000', () => {
  it('élargit la contrainte aux HUIT natures du contrat — la liste se lit dans le contrat, pas ici', async () => {
    const sql = (await upQueries()).join(' ')
    for (const kind of memoryItemKinds) expect(sql).toContain(`'${kind}'`)
  })

  it('garde les sept natures d’origine dans leur ORDRE — une valeur d’enum ne se perd ni ne bouge jamais (GA-08)', async () => {
    const sql = (await upQueries()).join(' ')
    expect(sql).toContain(
      "CHECK (kind IN ('fact', 'preference', 'correction', 'workspace_rule', 'sourced_observation', 'hypothesis', 'temporary_context', 'goal'))",
    )
  })

  it('retire l’ANCIENNE contrainte avant de poser la neuve — sinon les deux s’appliquent et la neuve ne sert à rien', async () => {
    const sql = await upQueries()
    const dropped = sql.findIndex(q => q.includes('DROP CONSTRAINT IF EXISTS memory_pinned_facts_kind_check'))
    const added = sql.findIndex(q => q.includes('ADD CONSTRAINT memory_pinned_facts_kind_check'))
    expect(dropped).toBeGreaterThanOrEqual(0)
    expect(added).toBeGreaterThan(dropped)
  })

  it('ne réécrit AUCUNE ligne et ne retire ni colonne ni table', async () => {
    const sql = await upQueries()
    expect(sql.some(q => q.startsWith('UPDATE '))).toBe(false)
    expect(sql.some(q => q.includes('DELETE FROM') || q.includes('DROP TABLE') || q.includes('DROP COLUMN'))).toBe(
      false,
    )
  })

  it('ne touche NI l’origine NI la portée : une migration, un changement de forme', async () => {
    const sql = (await upQueries()).join(' ')
    expect(sql).not.toContain('origin_check')
    expect(sql).not.toContain('scope_check')
  })

  it('down() n’est pas supporté (convention du dépôt — additive, vers l’avant seulement)', async () => {
    await expect(new MemoryItemKindGoalAdded1795540000000().down()).rejects.toThrow('down migrations are not supported')
  })
})
