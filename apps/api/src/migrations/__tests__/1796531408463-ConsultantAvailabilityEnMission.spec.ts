import type { QueryRunner } from 'typeorm'
import { ConsultantAvailabilityEnMission1796531408463 } from '../1796531408463-ConsultantAvailabilityEnMission'

async function run(direction: 'up' | 'down'): Promise<string> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  await new ConsultantAvailabilityEnMission1796531408463()[direction](runner)
  return queries.join('\n').replace(/\s+/g, ' ')
}

describe('ConsultantAvailabilityEnMission1796531408463', () => {
  it('élargit la contrainte à `en_mission` en gardant les cinq valeurs d’origine (GA-11/12)', async () => {
    const sql = await run('up')
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS consultants_availability_check')
    expect(sql).toContain(
      "CHECK (availability IN ('immediate', 'sous_1_mois', 'sous_3_mois', 'indisponible', 'inconnu', 'en_mission'))",
    )
  })

  it('down ramène `en_mission` à `indisponible` avant de resserrer la contrainte', async () => {
    const sql = await run('down')
    expect(sql.indexOf("SET availability = 'indisponible' WHERE availability = 'en_mission'")).toBeGreaterThan(-1)
    expect(sql.indexOf('UPDATE consultants')).toBeLessThan(sql.indexOf('ADD CONSTRAINT'))
    expect(sql).not.toContain("'en_mission'))")
  })
})
