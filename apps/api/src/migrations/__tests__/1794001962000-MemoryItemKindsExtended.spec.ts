import type { QueryRunner } from 'typeorm'
import { MemoryItemKindsExtended1794001962000 } from '../1794001962000-MemoryItemKindsExtended'

// #2260.17 — cette migration a été SUPPLANTÉE par `1795540000000` (nature
// `goal` ajoutée) : la liste ci-dessous fige les SEPT natures que CETTE
// migration déclarait à SA date, elle ne relit plus le contrat courant
// (`memoryItemKinds`) — sinon chaque nature future ferait rougir cette
// migration passée, alors qu'elle n'a jamais eu tort.
const KINDS_AT_THIS_MIGRATION = [
  'fact',
  'preference',
  'correction',
  'workspace_rule',
  'sourced_observation',
  'hypothesis',
  'temporary_context',
]

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
  await new MemoryItemKindsExtended1794001962000().up(runner)
  return queries.map(normalize)
}

/**
 * #1962.2/.5/.7/.9/.10 — LA CONTRAINTE S'ÉLARGIT AVANT LE CODE QUI ÉCRIT (GA-11 / GA-12).
 *
 * `memory_pinned_facts_kind_check` n'acceptait que trois natures. Les quatre
 * ajoutées par le contrat seraient rejetées par Postgres — un épinglage qui
 * échoue au dernier mètre, après le clic. Cette migration ne fait QUE élargir :
 * aucune valeur ne disparaît, aucune ligne n'est réécrite.
 */
describe('MemoryItemKindsExtended1794001962000', () => {
  it('élargit la contrainte aux SEPT natures qu’elle connaissait à sa date', async () => {
    const sql = (await upQueries()).join(' ')
    for (const kind of KINDS_AT_THIS_MIGRATION) expect(sql).toContain(`'${kind}'`)
  })

  it('garde les trois natures d’origine : une valeur d’enum ne se perd jamais (GA-08)', async () => {
    const sql = (await upQueries()).join(' ')
    expect(sql).toContain(
      "CHECK (kind IN ('fact', 'preference', 'correction', 'workspace_rule', 'sourced_observation', 'hypothesis', 'temporary_context'))",
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
    await expect(new MemoryItemKindsExtended1794001962000().down()).rejects.toThrow('down migrations are not supported')
  })
})
