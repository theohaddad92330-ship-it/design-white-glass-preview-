import { LastSeenService, SESSION_GAP_MS } from './last-seen.service'
import { UserLastSeenEntity } from '../../database/entities/user-last-seen.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * Le repère « depuis ma dernière connexion » (§8). La décision produit : c'est un
 * SNAPSHOT posé au sign-in — PAS un heartbeat réécrit à chaque requête, qui
 * collerait le repère à « maintenant » et viderait donc TOUJOURS la fenêtre. Ces
 * tests verrouillent la sessionisation par écart : un rechargement dans la même
 * session ne bouge pas le repère ; seul un retour après une vraie absence ouvre
 * une nouvelle fenêtre.
 */
describe('LastSeenService', () => {
  let repo: MockRepository<UserLastSeenEntity>
  let service: LastSeenService

  beforeEach(() => {
    repo = createMockRepository<UserLastSeenEntity>()
    service = new LastSeenService(repo as never)
  })

  it('première visite : aucun repère (null) et une ligne est créée', async () => {
    repo.findOne.mockResolvedValueOnce(null)
    const now = new Date('2026-07-23T09:00:00.000Z')

    const result = await service.markSeen('user-1', now)

    expect(result).toEqual({ since: null })
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', last_seen_at: now, previous_seen_at: null }),
    )
  })

  it('retour après une absence : le début de la session PRÉCÉDENTE devient le repère', async () => {
    const yesterday = new Date('2026-07-22T18:00:00.000Z')
    repo.findOne.mockResolvedValueOnce({
      user_id: 'user-1',
      last_seen_at: yesterday,
      previous_seen_at: null,
    } as UserLastSeenEntity)
    const now = new Date('2026-07-23T09:00:00.000Z')

    const result = await service.markSeen('user-1', now)

    // La fenêtre « depuis quand » = la dernière fois que l'utilisateur était là.
    expect(result).toEqual({ since: yesterday.toISOString() })
    const saved = repo.save.mock.calls[0][0] as UserLastSeenEntity
    expect(saved.previous_seen_at).toEqual(yesterday)
    expect(saved.last_seen_at).toEqual(now)
  })

  it('rechargement dans la même session : le repère NE bouge PAS (sinon fenêtre toujours vide)', async () => {
    const visitStart = new Date('2026-07-23T09:00:00.000Z')
    const reference = new Date('2026-07-22T18:00:00.000Z')
    repo.findOne.mockResolvedValueOnce({
      user_id: 'user-1',
      last_seen_at: visitStart,
      previous_seen_at: reference,
    } as UserLastSeenEntity)
    // 10 min plus tard, bien en-deçà de l'écart de session.
    const now = new Date(visitStart.getTime() + 10 * 60 * 1000)

    const result = await service.markSeen('user-1', now)

    // Le repère reste la visite précédente…
    expect(result).toEqual({ since: reference.toISOString() })
    const saved = repo.save.mock.calls[0][0] as UserLastSeenEntity
    expect(saved.previous_seen_at).toEqual(reference)
    // …mais la présence est rafraîchie pour garder la session vivante.
    expect(saved.last_seen_at).toEqual(now)
  })

  it('un écart juste au-delà du seuil ouvre bien une nouvelle fenêtre', async () => {
    const lastSeen = new Date('2026-07-23T09:00:00.000Z')
    repo.findOne.mockResolvedValueOnce({
      user_id: 'user-1',
      last_seen_at: lastSeen,
      previous_seen_at: new Date('2026-07-20T09:00:00.000Z'),
    } as UserLastSeenEntity)
    const now = new Date(lastSeen.getTime() + SESSION_GAP_MS + 1)

    const result = await service.markSeen('user-1', now)

    expect(result).toEqual({ since: lastSeen.toISOString() })
  })

  it('best-effort : une erreur de lecture ne jette pas, elle renvoie null', async () => {
    repo.findOne.mockRejectedValueOnce(new Error('db down'))
    await expect(service.markSeen('user-1')).resolves.toEqual({ since: null })
  })
})
