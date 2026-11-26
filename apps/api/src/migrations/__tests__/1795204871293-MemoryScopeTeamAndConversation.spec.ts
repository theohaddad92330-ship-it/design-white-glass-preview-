import type { QueryRunner } from 'typeorm'
import { memoryItemScopes } from '@bellum/contracts'
import { MemoryScopeTeamAndConversation1795204871293 } from '../1795204871293-MemoryScopeTeamAndConversation'

/**
 * #1918.2 / #1918.5 — LA CONTRAINTE S'ÉLARGIT AVANT LE CODE QUI ÉCRIT (GA-11 / GA-12).
 *
 * Cette suite ne branche aucune base : elle capture les instructions émises et
 * lit ce qu'elles DISENT. Ce qu'elle protège tient en une phrase — si le code
 * apprend `business_unit` ou `conversation` avant que
 * `memory_pinned_facts_scope_check` ne les connaisse, la production rejette
 * l'insertion et le défaut n'apparaît qu'en ligne.
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
  await new MemoryScopeTeamAndConversation1795204871293().up(runner)
  return queries.map(normalize)
}

describe('MemoryScopeTeamAndConversation1795204871293', () => {
  it('lit quelque chose — la migration émet des instructions', async () => {
    expect((await run()).length).toBeGreaterThan(0)
  })

  it('élargit `memory_pinned_facts_scope_check` aux QUATRE portées, sans en perdre une', async () => {
    const sql = await run()
    const added = sql.find(q => q.includes('ADD CONSTRAINT memory_pinned_facts_scope_check'))
    expect(added).toBeDefined()
    // Les deux anciennes sont TOUJOURS là : une contrainte ne rétrécit jamais (GA-11).
    for (const scope of memoryItemScopes) {
      expect(added).toContain(`'${scope}'`)
    }
    expect([...memoryItemScopes]).toEqual(['user', 'workspace', 'business_unit', 'conversation'])
  })

  it('supprime l’ancienne contrainte AVANT de poser la neuve (sinon `ADD` échoue et le déploiement est abandonné)', async () => {
    const sql = await run()
    const drop = sql.findIndex(q => q.includes('DROP CONSTRAINT IF EXISTS memory_pinned_facts_scope_check'))
    const add = sql.findIndex(q => q.includes('ADD CONSTRAINT memory_pinned_facts_scope_check'))
    expect(drop).toBeGreaterThanOrEqual(0)
    expect(add).toBeGreaterThan(drop)
  })

  it('ajoute les deux colonnes de DÉSIGNATION, additives et idempotentes', async () => {
    const sql = await run()
    const columns = sql.find(q => q.includes('ADD COLUMN IF NOT EXISTS conversation_id'))
    expect(columns).toBeDefined()
    expect(columns).toContain('ADD COLUMN IF NOT EXISTS business_unit_id uuid')
    // Aucune valeur par défaut, aucun NOT NULL : l'existant ne change pas de sens.
    expect(columns).not.toContain('NOT NULL')
  })

  it('une portée qui DÉSIGNE quelqu’un exige sa désignation — en base, pas seulement au DTO', async () => {
    const sql = await run()
    expect(sql.filter(q => q.includes('memory_pinned_facts_conversation_scope_requires_id_check')).length).toBe(2)
    const conversation = sql.find(q =>
      q.includes('ADD CONSTRAINT memory_pinned_facts_conversation_scope_requires_id_check'),
    )
    expect(conversation).toContain("scope <> 'conversation' OR conversation_id IS NOT NULL")
    const businessUnit = sql.find(q =>
      q.includes('ADD CONSTRAINT memory_pinned_facts_business_unit_scope_requires_id_check'),
    )
    expect(businessUnit).toContain("scope <> 'business_unit' OR business_unit_id IS NOT NULL")
  })

  it('ne réécrit AUCUNE ligne existante — aucun backfill, aucune visibilité changée en silence', async () => {
    const sql = await run()
    expect(sql.some(q => /^UPDATE memory_pinned_facts/i.test(q))).toBe(false)
  })
})
