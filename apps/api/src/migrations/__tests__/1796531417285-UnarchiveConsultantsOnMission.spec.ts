import type { QueryRunner } from 'typeorm'
import { UnarchiveConsultantsOnMission1796531417285 } from '../1796531417285-UnarchiveConsultantsOnMission'

/** Capture le SQL émis (pas de base vivante) — même harnais que les autres specs de migration. */
async function runUp(): Promise<string> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  await new UnarchiveConsultantsOnMission1796531417285().up(runner)
  return queries.join('\n').replace(/\s+/g, ' ')
}

describe('UnarchiveConsultantsOnMission1796531417285', () => {
  it('ne désarchive QUE les fiches archivées portant une affectation en cours', async () => {
    const sql = await runUp()
    expect(sql).toContain('UPDATE consultants')
    expect(sql).toContain('archived_at = NULL, archived_reason = NULL')
    expect(sql).toContain('c.archived_at IS NOT NULL')
    expect(sql).toContain("a.status NOT IN ('completed', 'terminated', 'replaced')")
    expect(sql).toContain("m.status NOT IN ('completed', 'cancelled')")
    expect(sql).toContain('a.starts_on <= CURRENT_DATE')
    expect(sql).toContain('a.ends_on IS NULL OR a.ends_on >= CURRENT_DATE')
  })

  it('est idempotente (le filtre exclut les fiches déjà actives) et annonce le nombre rattrapé', async () => {
    const sql = await runUp()
    expect(sql).not.toMatch(/DELETE|DROP|ALTER/i)
    expect(sql).toContain('RAISE NOTICE')
  })

  it('down est un no-op : on ne rejoue pas un archivage que personne n’a voulu', async () => {
    const runner = { query: jest.fn() } as unknown as QueryRunner
    await new UnarchiveConsultantsOnMission1796531417285().down()
    expect((runner.query as jest.Mock).mock.calls).toHaveLength(0)
  })
})
