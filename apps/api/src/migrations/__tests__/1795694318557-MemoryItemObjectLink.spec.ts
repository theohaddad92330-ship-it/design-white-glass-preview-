import type { QueryRunner } from 'typeorm'
import { memoryItemObjectTypeSchema } from '@bellum/contracts'
import { MemoryItemObjectLink1795694318557 } from '../1795694318557-MemoryItemObjectLink'

/**
 * #2260.7 — LA CONTRAINTE S'ÉLARGIT AVANT LE CODE QUI ÉCRIT (GA-11 / GA-12).
 *
 * Cette suite ne branche aucune base : elle capture les instructions émises et
 * lit ce qu'elles DISENT. Les quatre colonnes (`contact_id`, `need_id`,
 * `consultant_id`, `mission_id`) sont additives et nullables ; la contrainte
 * empêche qu'un élément en porte DEUX à la fois — un objet visé, jamais quatre.
 */
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

async function run(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new MemoryItemObjectLink1795694318557().up(runner)
  return queries.map(normalize)
}

describe('MemoryItemObjectLink1795694318557', () => {
  it('lit quelque chose — la migration émet des instructions', async () => {
    expect((await run()).length).toBeGreaterThan(0)
  })

  it('ajoute les QUATRE colonnes de désignation — une par type du contrat, additives et idempotentes', async () => {
    const sql = await run()
    const columns = sql.find(q => q.includes('ADD COLUMN IF NOT EXISTS contact_id'))
    expect(columns).toBeDefined()
    expect([...memoryItemObjectTypeSchema.options]).toEqual(['contact', 'need', 'consultant', 'mission'])
    for (const col of ['contact_id', 'need_id', 'consultant_id', 'mission_id']) {
      expect(columns).toContain(`ADD COLUMN IF NOT EXISTS ${col} uuid`)
    }
    // Aucune valeur par défaut, aucun NOT NULL : l'existant ne change pas de sens.
    expect(columns).not.toContain('NOT NULL')
  })

  it('un élément vise AU PLUS UN objet — jamais deux colonnes renseignées à la fois', async () => {
    const sql = await run()
    const add = sql.find(q => q.includes('ADD CONSTRAINT memory_pinned_facts_object_single_check'))
    expect(add).toBeDefined()
    for (const col of ['contact_id', 'need_id', 'consultant_id', 'mission_id']) {
      expect(add).toContain(`${col} IS NOT NULL`)
    }
  })

  it('supprime l’ancienne contrainte AVANT de poser la neuve (sinon `ADD` échoue et le déploiement est abandonné)', async () => {
    const sql = await run()
    const drop = sql.findIndex(q => q.includes('DROP CONSTRAINT IF EXISTS memory_pinned_facts_object_single_check'))
    const add = sql.findIndex(q => q.includes('ADD CONSTRAINT memory_pinned_facts_object_single_check'))
    expect(drop).toBeGreaterThanOrEqual(0)
    expect(add).toBeGreaterThan(drop)
  })

  it('quatre index PARTIELS, légers : seules les lignes qui visent CE type en portent une entrée', async () => {
    const sql = await run()
    for (const [col, idx] of [
      ['contact_id', 'memory_pinned_facts_contact_idx'],
      ['need_id', 'memory_pinned_facts_need_idx'],
      ['consultant_id', 'memory_pinned_facts_consultant_idx'],
      ['mission_id', 'memory_pinned_facts_mission_idx'],
    ]) {
      const created = sql.find(q => q.includes(`CREATE INDEX IF NOT EXISTS ${idx}`))
      expect(created).toBeDefined()
      expect(created).toContain(`WHERE ${col} IS NOT NULL`)
    }
  })

  it('ne réécrit AUCUNE ligne existante — aucun backfill, aucun lien changé en silence', async () => {
    const sql = await run()
    expect(sql.some(q => /^UPDATE memory_pinned_facts/i.test(q))).toBe(false)
  })

  it('`down` n’est pas supporté (convention du dépôt)', async () => {
    await expect(new MemoryItemObjectLink1795694318557().down()).rejects.toThrow()
  })
})
