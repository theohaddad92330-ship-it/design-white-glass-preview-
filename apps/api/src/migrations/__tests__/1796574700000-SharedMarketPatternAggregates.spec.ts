import type { QueryRunner } from 'typeorm'
import { FRENCH_REGIONS, MARKET_PATTERN_SKILL_DOMAINS, SHARED_BASE_MIN_WORKSPACES } from '@bellum/contracts'
import { SharedMarketPatternAggregates1796574700000 } from '../1796574700000-SharedMarketPatternAggregates'

async function run(): Promise<string> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  await new SharedMarketPatternAggregates1796574700000().up(runner)
  return queries.join('\n')
}

describe('SharedMarketPatternAggregates1796574700000 (#4286.15.c)', () => {
  it('un agrégat sous trois espaces est REFUSÉ par la base elle-même (k-anonymat)', async () => {
    expect(await run()).toContain(
      `CONSTRAINT shared_market_pattern_aggregates_k_check CHECK (contributing_workspaces >= ${SHARED_BASE_MIN_WORKSPACES})`,
    )
  })

  it('chaque catégorie est un vocabulaire FERMÉ — domaine de métier, taille, région, secteur NAF', async () => {
    const sql = await run()
    for (const domain of MARKET_PATTERN_SKILL_DOMAINS) expect(sql).toMatch(new RegExp(`topic IN \\([^)]*'${domain}'`))
    for (const region of FRENCH_REGIONS) expect(sql).toMatch(new RegExp(`region_key IN \\('all'[^)]*'${region}'`))
    expect(sql).toContain("CHECK (size_band IN ('all', 'tpe', 'pme', 'eti', 'ge'))")
    expect(sql).toContain("CHECK (sector_key ~ '^[a-z][a-z0-9_]{0,47}$' AND sector_key ~ '^(all|naf_[0-9]{2})$')")
  })

  it('sait dire NON — aucune colonne d’espace, de client, de nom, de coût, de prix, de TJM, de texte libre', async () => {
    const create = (await run()).split('ALTER TABLE')[0] ?? ''
    expect(create).not.toMatch(
      /\b(workspace_id|user_id|account_id|company|name|label|notes?|cost|price|tjm|rate|amount|jsonb)\b/i,
    )
  })

  it('RLS activée, seul le service lit et écrit', async () => {
    expect(await run()).toContain('ALTER TABLE shared_market_pattern_aggregates ENABLE ROW LEVEL SECURITY')
  })
})
