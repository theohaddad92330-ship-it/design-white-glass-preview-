import { OrionAnomaliesService } from './orion-anomalies.service'
import type { DataforgeAnomalyEntity } from '../../database/entities/dataforge-anomaly.entity'

describe('OrionAnomaliesService', () => {
  function build(rows: Partial<DataforgeAnomalyEntity>[], byServ: { severite: string; n: number }[] = []) {
    const anomalies = {
      find: jest.fn().mockResolvedValue(rows),
      count: jest.fn().mockResolvedValue(rows.length),
      query: jest.fn().mockResolvedValue(byServ),
    }
    const service = new OrionAnomaliesService(anomalies as never)
    return { service, anomalies }
  }

  it('trie CRITIQUE avant MAJEUR avant MINEUR, puis par identifiant', async () => {
    const { service } = build([
      { anomalieId: 'AN-010', code: 'B', severite: 'MAJEUR' },
      { anomalieId: 'AN-001', code: 'A', severite: 'CRITIQUE' },
      { anomalieId: 'AN-020', code: 'C', severite: 'MINEUR' },
      { anomalieId: 'AN-002', code: 'D', severite: 'CRITIQUE' },
    ])
    const list = await service.list()
    expect(list.map(item => item.anomalieId)).toEqual(['AN-001', 'AN-002', 'AN-010', 'AN-020'])
  })

  it('coverage() compte les lignes et la répartition par sévérité', async () => {
    const { service, anomalies } = build(
      [{ anomalieId: 'AN-001' }],
      [
        { severite: 'CRITIQUE', n: 6 },
        { severite: 'MAJEUR', n: 13 },
        { severite: 'MINEUR', n: 1 },
      ],
    )
    const coverage = await service.coverage()
    expect(coverage.anomalies).toBe(1)
    expect(coverage.bySeverite).toEqual({ CRITIQUE: 6, MAJEUR: 13, MINEUR: 1 })
    expect(anomalies.query).toHaveBeenCalled()
  })
})
