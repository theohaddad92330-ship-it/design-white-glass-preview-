import type { QueryRunner } from 'typeorm'
import { LAYERED_PROFILE_LAYERS } from '@bellum/contracts'
import { RunProfileLayerVersions1795490047213 } from '../1795490047213-RunProfileLayerVersions'

/**
 * #2005.11 — LA CONTRAINTE ARRIVE AVANT LE CODE QUI ÉCRIT.
 *
 * Aucune base branchée : la suite capture les instructions émises et lit ce
 * qu'elles DISENT. Ce qu'elle protège : une provenance de run qui porte des
 * versions de couche les porte TOUTES LES TROIS — et l'historique (aucune clé
 * `layerVersions`) reste valide, sinon la validation échoue au déploiement.
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

async function run(direction: 'up' | 'down'): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new RunProfileLayerVersions1795490047213()[direction](runner)
  return queries.map(normalize)
}

describe('RunProfileLayerVersions1795490047213', () => {
  it('lit quelque chose — la migration émet des instructions', async () => {
    expect((await run('up')).length).toBeGreaterThan(0)
  })

  it('exige les TROIS couches du contrat quand la provenance porte des versions', async () => {
    const added = (await run('up')).find(q => q.includes('ADD CONSTRAINT analysis_runs_profile_layer_versions_check'))
    expect(added).toBeDefined()
    expect([...LAYERED_PROFILE_LAYERS]).toEqual(['company', 'businessUnit', 'person'])
    for (const layer of LAYERED_PROFILE_LAYERS) {
      expect(added).toContain(`'${layer}'`)
    }
  })

  it('SAIT DIRE NON — refuse `layerVersions: null` et une version qui n’est pas une chaîne', async () => {
    const added = (await run('up')).find(q => q.includes('ADD CONSTRAINT analysis_runs_profile_layer_versions_check'))
    // Une clé présente doit être un OBJET : `null` explicite n'est pas admis.
    expect(added).toContain("jsonb_typeof(profile_provenance -> 'layerVersions') = 'object'")
    expect(added).not.toContain("jsonb_typeof(profile_provenance -> 'layerVersions') = 'null'")
    expect(added).toContain("IN ('string', 'null')")
  })

  it('l’historique reste valide — une provenance sans clé `layerVersions` passe', async () => {
    const added = (await run('up')).find(q => q.includes('ADD CONSTRAINT analysis_runs_profile_layer_versions_check'))
    expect(added).toContain('profile_provenance IS NULL')
    expect(added).toContain("NOT (profile_provenance ? 'layerVersions')")
  })

  it('pose la contrainte sans verrou long (NOT VALID), puis la valide, et reste rejouable', async () => {
    const sql = await run('up')
    const drop = sql.findIndex(q => q.includes('DROP CONSTRAINT IF EXISTS analysis_runs_profile_layer_versions_check'))
    const add = sql.findIndex(q => q.includes('ADD CONSTRAINT analysis_runs_profile_layer_versions_check'))
    const validate = sql.findIndex(q => q.includes('VALIDATE CONSTRAINT analysis_runs_profile_layer_versions_check'))
    expect(drop).toBeGreaterThanOrEqual(0)
    expect(add).toBeGreaterThan(drop)
    expect(sql[add]).toContain('NOT VALID')
    expect(validate).toBeGreaterThan(add)
  })

  it('down retire la seule contrainte, sans toucher à la colonne', async () => {
    const sql = await run('down')
    expect(sql).toEqual([
      'ALTER TABLE analysis_runs DROP CONSTRAINT IF EXISTS analysis_runs_profile_layer_versions_check',
    ])
  })
})
