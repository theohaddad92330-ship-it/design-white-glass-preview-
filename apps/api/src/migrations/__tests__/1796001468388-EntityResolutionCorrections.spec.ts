import { ENTITY_RESOLUTION_CORRECTION_DECISIONS } from '@bellum/contracts'
import type { QueryRunner } from 'typeorm'
import { EntityResolutionCorrections1796001468388 } from '../1796001468388-EntityResolutionCorrections'

async function sqlOf(direction: 'up' | 'down'): Promise<string> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  await new EntityResolutionCorrections1796001468388()[direction](runner)
  return queries.join('\n')
}

/** #2284.67-.69 — la correction d'identité versionnée, scopée à l'espace. */
describe('EntityResolutionCorrections1796001468388', () => {
  it('la contrainte de décision couvre les décisions du contrat, et elle seules (GA-11 : elle naît AVEC la colonne)', async () => {
    const sql = await sqlOf('up')
    const check = sql.split('CONSTRAINT ').find(part => part.startsWith('entity_resolution_corrections_decision_check'))
    expect(check).toBeDefined()
    for (const decision of ENTITY_RESOLUTION_CORRECTION_DECISIONS) expect(check).toContain(`'${decision}'`)
    expect(check).not.toContain("'ambiguous'")
  })

  it('#2284.69 — scopée à l’espace : workspace_id NOT NULL, jamais un référentiel partagé', async () => {
    const sql = await sqlOf('up')
    expect(sql).toContain('workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE')
  })

  it('#2284.68 — versionnée : une version par (espace, compte), jamais deux fois la même', async () => {
    const sql = await sqlOf('up')
    expect(sql).toContain('version integer NOT NULL')
    expect(sql).toMatch(
      /UNIQUE INDEX IF NOT EXISTS \S+ ON entity_resolution_corrections \(workspace_id, account_id, version\)/,
    )
  })

  it('un SIREN visé a neuf chiffres ou n’existe pas', async () => {
    const sql = await sqlOf('up')
    expect(sql).toContain("target_siren IS NULL OR target_siren ~ '^[0-9]{9}$'")
  })

  it('active la RLS', async () => {
    expect(await sqlOf('up')).toContain('ALTER TABLE entity_resolution_corrections ENABLE ROW LEVEL SECURITY')
  })

  it('down() ne fait tomber que ce que up() a créé', async () => {
    const sql = await sqlOf('down')
    expect(sql).toBe('DROP TABLE IF EXISTS entity_resolution_corrections')
  })
})
