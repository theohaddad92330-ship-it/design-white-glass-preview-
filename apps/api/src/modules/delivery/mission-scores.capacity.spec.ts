import type { Repository } from 'typeorm'
import type { MissionEntity } from '../../database/entities/mission.entity'
import { MissionScoresService } from './mission-scores.service'

/**
 * GARDE PERF (29/09/2026, mesuré en prod : `GET /delivery/finance/capacity`
 * appelé TROIS fois à l'ouverture de /briefing — un appel par mois, voulu :
 * la capacité est MENSUELLE, la multiplier par trois inventerait des
 * affectations).
 *
 * Chaque appel paie déjà la garde et la résolution de l'espace ; la lecture
 * SQL (3 sous-requêtes dont un NOT EXISTS corrélé) est retenue 60 s par
 * espace × mois. Un échec n'est jamais retenu : « rien de mesurable » servi
 * une minute de trop se lirait « tout le monde est staffé ».
 */
function build(query: jest.Mock) {
  const missions = { manager: { query } } as unknown as Repository<MissionEntity>
  return new MissionScoresService(missions)
}
const ROW = [{ people: '4', committed: '2', on_bench: '1' }]

describe('MissionScoresService.capacity — budget de requêtes', () => {
  it('les trois mois de /briefing : trois lectures, pas une de plus, même relus', async () => {
    const query = jest.fn().mockResolvedValue(ROW)
    const service = build(query)
    const months = ['2026-09', '2026-10', '2026-11']
    await Promise.all(months.map(month => service.capacity('ws1', month)))
    await Promise.all(months.map(month => service.capacity('ws1', month)))
    expect(query).toHaveBeenCalledTimes(3)
  })

  it('un autre espace relit (la clé porte l’espace)', async () => {
    const query = jest.fn().mockResolvedValue(ROW)
    const service = build(query)
    await service.capacity('ws1', '2026-09')
    await service.capacity('ws2', '2026-09')
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('un échec de lecture n’est JAMAIS retenu et se dit non mesurable', async () => {
    const query = jest.fn().mockRejectedValueOnce(new Error('pg down')).mockResolvedValueOnce(ROW)
    const service = build(query)
    const failed = await service.capacity('ws1', '2026-09')
    expect(failed.periodMonth).toBe('2026-09-01')
    await service.capacity('ws1', '2026-09')
    expect(query).toHaveBeenCalledTimes(2)
  })
})

describe('MissionScoresService.capacity — une charge non renseignée n’est pas 0 jour engagé (#2791 vu en passant)', () => {
  it('committed absent → ni réservé ni disponible : null, jamais « 0 j »', async () => {
    const query = jest.fn().mockResolvedValue([{ people: '4', committed: null, on_bench: '0' }])
    const result = await build(query).capacity('ws1', '2026-09')
    expect(result.committedDays).toBeNull()
    expect(result.availableDays).toBeNull()
  })

  it('la lecture SQL ne replie PAS l’absence de charge sur 0 (pas de COALESCE(SUM(…), 0))', async () => {
    const query = jest.fn().mockResolvedValue(ROW)
    await build(query).capacity('ws1', '2026-09')
    const sql = String(query.mock.calls[0]?.[0])
    expect(sql).not.toMatch(/COALESCE\(SUM\(/)
    expect(sql).toMatch(/COUNT\(asg\.load_percent\)\s*=\s*0/)
  })
})
