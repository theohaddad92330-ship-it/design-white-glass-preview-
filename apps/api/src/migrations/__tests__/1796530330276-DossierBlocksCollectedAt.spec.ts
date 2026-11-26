import type { QueryRunner } from 'typeorm'
import { DossierBlocksCollectedAt1796530330276 } from '../1796530330276-DossierBlocksCollectedAt'

describe('DossierBlocksCollectedAt1796530330276 (#4078)', () => {
  it('ajoute la date de collecte du segment « blocs du dossier », additive et NULLABLE', async () => {
    const queries: string[] = []
    const runner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql)
        return []
      }),
    } as unknown as QueryRunner
    await new DossierBlocksCollectedAt1796530330276().up(runner)
    const flat = queries.join(' ').replace(/\s+/g, ' ')
    expect(flat).toContain('ALTER TABLE accounts ADD COLUMN IF NOT EXISTS dossier_blocks_collected_at timestamptz NULL')
    // Additive seulement : aucun DROP, aucune réécriture des lignes existantes (NULL = jamais datée).
    expect(flat).not.toMatch(/DROP|UPDATE|DELETE/)
  })
})
