import type { UserDailyBriefEntity } from '../../database/entities/user-daily-brief.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { DailyBriefMarkerService } from './daily-brief-marker.service'

/**
 * LE SIGNAL « PREMIÈRE OUVERTURE DU JOUR » (#1936, lot 7A).
 *
 * Ce que ces tests défendent : un seul appel SQL atomique décide, sans course
 * possible entre deux appareils, si c'est la première fois qu'on ouvre Laura
 * aujourd'hui — et une panne de lecture/écriture ne bloque JAMAIS l'appelant,
 * elle rend `false`.
 */
describe('DailyBriefMarkerService', () => {
  let repo: MockRepository<UserDailyBriefEntity>
  let service: DailyBriefMarkerService

  beforeEach(() => {
    repo = createMockRepository<UserDailyBriefEntity>()
    service = new DailyBriefMarkerService(repo as never)
  })

  it('rend `true` à la toute première ouverture — la ligne n’existait pas', async () => {
    // Sans conflit : l'INSERT part normalement, RETURNING rend la ligne.
    repo.manager.query.mockResolvedValue([{ user_id: 'u1' }])

    const result = await service.consumeFirstOpenToday('u1', 'Europe/Paris', new Date('2026-09-12T07:00:00.000Z'))

    expect(result).toBe(true)
    const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('INSERT INTO user_daily_brief')
    expect(sql).toContain('ON CONFLICT')
    expect(sql).toContain('RETURNING')
    expect(params).toEqual(['u1', '2026-09-12'])
  })

  it('rend `false` au deuxième appel le même jour — sait dire NON', async () => {
    // Le conflit se déclenche, mais la clause WHERE du DO UPDATE est fausse
    // (la date n'a pas changé) : RETURNING ne rend AUCUNE ligne.
    repo.manager.query.mockResolvedValue([])

    const result = await service.consumeFirstOpenToday('u1', 'Europe/Paris', new Date('2026-09-12T18:00:00.000Z'))

    expect(result).toBe(false)
  })

  it('un second appareil le même jour ne consomme pas une seconde fois', async () => {
    repo.manager.query.mockResolvedValueOnce([{ user_id: 'u1' }]).mockResolvedValueOnce([])

    const first = await service.consumeFirstOpenToday('u1', 'Europe/Paris', new Date('2026-09-12T07:00:00.000Z'))
    const second = await service.consumeFirstOpenToday('u1', 'Europe/Paris', new Date('2026-09-12T07:05:00.000Z'))

    expect(first).toBe(true)
    expect(second).toBe(false)
  })

  it('franchit minuit dans le fuseau REÇU, pas celui du serveur', async () => {
    repo.manager.query.mockResolvedValue([{ user_id: 'u1' }])

    // 23:30 UTC le 11/09 est déjà le 12/09 à Auckland (UTC+12/+13) : la
    // date-clé calculée doit suivre le fuseau du CLIENT, pas Paris.
    await service.consumeFirstOpenToday('u1', 'Pacific/Auckland', new Date('2026-09-11T23:30:00.000Z'))

    const [, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
    expect(params).toEqual(['u1', '2026-09-12'])
  })

  it('deux utilisateurs différents sont deux lignes indépendantes — même appel, même instant', async () => {
    repo.manager.query.mockResolvedValue([{ user_id: 'irrelevant' }])

    await service.consumeFirstOpenToday('user-a', 'Europe/Paris', new Date('2026-09-12T07:00:00.000Z'))
    await service.consumeFirstOpenToday('user-b', 'Europe/Paris', new Date('2026-09-12T07:00:00.000Z'))

    const [, paramsA] = repo.manager.query.mock.calls[0] as [string, unknown[]]
    const [, paramsB] = repo.manager.query.mock.calls[1] as [string, unknown[]]
    expect(paramsA[0]).toBe('user-a')
    expect(paramsB[0]).toBe('user-b')
  })

  it('un fuseau invalide retombe sur le fuseau par défaut plutôt que d’échouer', async () => {
    repo.manager.query.mockResolvedValue([{ user_id: 'u1' }])

    await service.consumeFirstOpenToday('u1', 'Not/AZone', new Date('2026-09-12T07:00:00.000Z'))

    const [, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
    // Europe/Paris (défaut) à 07:00 UTC le 12/09 est encore le 12/09.
    expect(params).toEqual(['u1', '2026-09-12'])
  })

  it('un fuseau absent retombe sur le fuseau par défaut', async () => {
    repo.manager.query.mockResolvedValue([{ user_id: 'u1' }])

    await service.consumeFirstOpenToday('u1', undefined, new Date('2026-09-12T07:00:00.000Z'))

    const [, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
    expect(params).toEqual(['u1', '2026-09-12'])
  })

  it('une panne de lecture/écriture rend `false` — le brief ne bloque jamais', async () => {
    repo.manager.query.mockRejectedValue(new Error('connection refused'))

    const result = await service.consumeFirstOpenToday('u1', 'Europe/Paris', new Date('2026-09-12T07:00:00.000Z'))

    expect(result).toBe(false)
  })
})
