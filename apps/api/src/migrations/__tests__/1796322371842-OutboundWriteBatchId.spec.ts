import type { QueryRunner } from 'typeorm'
import { OutboundWriteBatchId1796322371842 } from '../1796322371842-OutboundWriteBatchId'

/** Capture every SQL statement the migration issues (no live DB needed). */
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

/**
 * #2854 (#2201.9) — la colonne de regroupement, ADDITIVE et NULLABLE.
 *
 * Une demande déposée seule (toutes les lignes déjà en base) n'a jamais fait
 * partie d'un lot : `NOT NULL` forcerait une valeur inventée sur tout
 * l'historique. `NULLABLE` dit honnêtement « pas de lot » plutôt que d'en
 * deviner un.
 */
describe('OutboundWriteBatchId1796322371842', () => {
  it('ajoute `batch_id`, NULLABLE — aucune valeur inventée sur l’historique', async () => {
    const { runner, queries } = createRunner()
    await new OutboundWriteBatchId1796322371842().up(runner)
    const flat = queries.map(normalize)
    const addColumn = flat.find(q => q.includes('ADD COLUMN IF NOT EXISTS batch_id'))
    expect(addColumn).toBe('ALTER TABLE outbound_write_requests ADD COLUMN IF NOT EXISTS batch_id uuid;')
    expect(addColumn).not.toContain('NOT NULL')
  })

  it('pose un index partiel — ne pèse que sur les demandes qui appartiennent réellement à un lot', async () => {
    const { runner, queries } = createRunner()
    await new OutboundWriteBatchId1796322371842().up(runner)
    const flat = queries.map(normalize)
    expect(flat.some(q => q.includes('CREATE INDEX') && q.includes('WHERE batch_id IS NOT NULL'))).toBe(true)
  })

  it('`down` retire l’index puis la colonne — réversible', async () => {
    const { runner, queries } = createRunner()
    await new OutboundWriteBatchId1796322371842().down(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain('DROP INDEX IF EXISTS outbound_write_requests_batch_id_idx;')
    expect(flat).toContain('ALTER TABLE outbound_write_requests DROP COLUMN IF EXISTS batch_id;')
  })
})
