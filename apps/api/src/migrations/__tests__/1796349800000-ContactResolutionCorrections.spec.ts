import { CONTACT_RESOLUTION_CORRECTION_DECISIONS } from '@bellum/contracts'
import type { QueryRunner } from 'typeorm'
import { ContactResolutionCorrections1796349800000 } from '../1796349800000-ContactResolutionCorrections'

async function sqlOf(direction: 'up' | 'down'): Promise<string> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  await new ContactResolutionCorrections1796349800000()[direction](runner)
  return queries.join('\n')
}

/** #2159.35 — la correction de rapprochement de contact, versionnée, scopée à l'espace. */
describe('ContactResolutionCorrections1796349800000', () => {
  it('la contrainte de décision couvre les décisions du contrat, et elles seules (GA-11 : elle naît AVEC la colonne)', async () => {
    const sql = await sqlOf('up')
    const check = sql
      .split('CONSTRAINT ')
      .find(part => part.startsWith('contact_resolution_corrections_decision_check'))
    expect(check).toBeDefined()
    for (const decision of CONTACT_RESOLUTION_CORRECTION_DECISIONS) expect(check).toContain(`'${decision}'`)
    expect(check).not.toContain("'ambiguous'")
  })

  it('scopée à l’espace : workspace_id NOT NULL, jamais un référentiel partagé', async () => {
    const sql = await sqlOf('up')
    expect(sql).toContain('workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE')
  })

  it('rattachée à un contact réel : contact_id NOT NULL, ON DELETE CASCADE', async () => {
    const sql = await sqlOf('up')
    expect(sql).toContain('contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE')
  })

  it('versionnée : une version par (espace, contact), jamais deux fois la même', async () => {
    const sql = await sqlOf('up')
    expect(sql).toContain('version integer NOT NULL')
    expect(sql).toMatch(
      /UNIQUE INDEX IF NOT EXISTS \S+ ON contact_resolution_corrections \(workspace_id, contact_id, version\)/,
    )
  })

  it('une clé de rapprochement vide n’est pas une clé', async () => {
    const sql = await sqlOf('up')
    expect(sql).toContain("dedup_key <> ''")
  })

  it('un index sert la lecture par espace de l’import, avant qu’elle ne dégrade en scan complet', async () => {
    const sql = await sqlOf('up')
    expect(sql).toMatch(/INDEX IF NOT EXISTS \S+ ON contact_resolution_corrections \(workspace_id, contact_id\)/)
  })

  it('active la RLS', async () => {
    expect(await sqlOf('up')).toContain('ALTER TABLE contact_resolution_corrections ENABLE ROW LEVEL SECURITY')
  })

  it('down() ne fait tomber que ce que up() a créé', async () => {
    const sql = await sqlOf('down')
    expect(sql).toBe('DROP TABLE IF EXISTS contact_resolution_corrections')
  })
})
