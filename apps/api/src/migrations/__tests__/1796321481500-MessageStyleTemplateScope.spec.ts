import type { QueryRunner } from 'typeorm'
import { memoryItemScopes } from '@bellum/contracts'
import { MessageStyleTemplateScope1796321481500 } from '../1796321481500-MessageStyleTemplateScope'

/**
 * #2369.6 (LOT j1 26/09) — LA CONTRAINTE S'ÉLARGIT AVANT LE CODE QUI ÉCRIT
 * (GA-11 / GA-12), même patron que `1795204871293-MemoryScopeTeamAndConversation`.
 *
 * Cette suite ne branche aucune base : elle capture les instructions émises et
 * lit ce qu'elles DISENT.
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
  await new MessageStyleTemplateScope1796321481500().up(runner)
  return queries.map(normalize)
}

describe('MessageStyleTemplateScope1796321481500', () => {
  it('lit quelque chose — la migration émet des instructions', async () => {
    expect((await run()).length).toBeGreaterThan(0)
  })

  it('pose `message_style_templates_scope_check` sur les QUATRE portées de `memory-item.ts` (GA-26)', async () => {
    const sql = await run()
    const added = sql.find(q => q.includes('ADD CONSTRAINT message_style_templates_scope_check'))
    expect(added).toBeDefined()
    for (const scope of memoryItemScopes) {
      expect(added).toContain(`'${scope}'`)
    }
    expect([...memoryItemScopes]).toEqual(['user', 'workspace', 'business_unit', 'conversation'])
  })

  it('supprime l’ancienne contrainte AVANT de poser la neuve', async () => {
    const sql = await run()
    const drop = sql.findIndex(q => q.includes('DROP CONSTRAINT IF EXISTS message_style_templates_scope_check'))
    const add = sql.findIndex(q => q.includes('ADD CONSTRAINT message_style_templates_scope_check'))
    expect(drop).toBeGreaterThanOrEqual(0)
    expect(add).toBeGreaterThan(drop)
  })

  it('ajoute les colonnes de désignation — `scope` avec un DÉFAUT `workspace`, additif et idempotent', async () => {
    const sql = await run()
    const columns = sql.find(q => q.includes('ADD COLUMN IF NOT EXISTS scope'))
    expect(columns).toBeDefined()
    expect(columns).toContain("ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'workspace'")
    expect(columns).toContain('ADD COLUMN IF NOT EXISTS business_unit_id uuid')
    expect(columns).toContain('ADD COLUMN IF NOT EXISTS conversation_id text')
  })

  it('une portée qui DÉSIGNE quelqu’un exige sa désignation — en base, pas seulement au DTO', async () => {
    const sql = await run()
    const conversation = sql.find(q =>
      q.includes('ADD CONSTRAINT message_style_templates_conversation_scope_requires_id_check'),
    )
    expect(conversation).toContain("scope <> 'conversation' OR conversation_id IS NOT NULL")
    const businessUnit = sql.find(q =>
      q.includes('ADD CONSTRAINT message_style_templates_business_unit_scope_requires_id_check'),
    )
    expect(businessUnit).toContain("scope <> 'business_unit' OR business_unit_id IS NOT NULL")
  })

  it('ne réécrit AUCUNE ligne existante — aucun backfill au-delà du défaut de colonne', async () => {
    const sql = await run()
    expect(sql.some(q => /^UPDATE message_style_templates/i.test(q))).toBe(false)
  })

  it('`down` n’est pas supporté — convention du dépôt', async () => {
    await expect(new MessageStyleTemplateScope1796321481500().down()).rejects.toThrow(
      'down migrations are not supported',
    )
  })
})
