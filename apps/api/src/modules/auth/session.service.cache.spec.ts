import { SessionService } from './session.service'
import type { SupabaseAuthGateway } from './supabase-auth.gateway'

/**
 * perf P3 (29/09/2026) — `GET /auth/session` rappelait Supabase admin
 * `getUserById` à CHAQUE chargement de page. C'est une lecture de profil (id,
 * e-mail, rôles des métadonnées), pas un contrôle de sécurité : le JwtGuard
 * authentifie déjà la requête. Cache mémoire court, clé userId, purgé à la
 * déconnexion. Les gardes d'autorisation (`backoffice-role.guard`) continuent
 * d'appeler `getSession` SANS cache : un rôle retiré s'applique tout de suite.
 */
function build() {
  const getUserById = jest.fn().mockResolvedValue({
    data: { user: { id: 'u1', email: 'a@b.fr', created_at: 'x', app_metadata: { roles: ['customer'] } } },
    error: null,
  })
  const gateway = { client: { auth: { admin: { getUserById } } } } as unknown as SupabaseAuthGateway
  return { service: new SessionService(gateway, {} as never, {} as never), getUserById }
}

describe('SessionService.getSessionCached', () => {
  afterEach(() => jest.useRealTimers())

  it('deux lectures rapprochées = UN appel Supabase', async () => {
    const { service, getUserById } = build()
    await service.getSessionCached('u1')
    await service.getSessionCached('u1')
    expect(getUserById).toHaveBeenCalledTimes(1)
  })

  it('la clé porte le userId : un autre utilisateur ne lit pas le cache du premier', async () => {
    const { service, getUserById } = build()
    await service.getSessionCached('u1')
    await service.getSessionCached('u2')
    expect(getUserById).toHaveBeenCalledTimes(2)
  })

  it('expire après 30 s au plus', async () => {
    jest.useFakeTimers()
    const { service, getUserById } = build()
    await service.getSessionCached('u1')
    jest.advanceTimersByTime(31_000)
    await service.getSessionCached('u1')
    expect(getUserById).toHaveBeenCalledTimes(2)
  })

  it('invalidateSession (déconnexion) purge la clé', async () => {
    const { service, getUserById } = build()
    await service.getSessionCached('u1')
    service.invalidateSession('u1')
    await service.getSessionCached('u1')
    expect(getUserById).toHaveBeenCalledTimes(2)
  })

  it('un échec n’est jamais mis en cache', async () => {
    const { service, getUserById } = build()
    getUserById.mockResolvedValueOnce({ data: { user: null }, error: { message: 'boom' } })
    const first = await service.getSessionCached('u1')
    expect(first.type).toBe('failure')
    await service.getSessionCached('u1')
    expect(getUserById).toHaveBeenCalledTimes(2)
  })

  it('getSession (autorisation) ne passe JAMAIS par le cache', async () => {
    const { service, getUserById } = build()
    await service.getSession('u1')
    await service.getSession('u1')
    expect(getUserById).toHaveBeenCalledTimes(2)
  })
})
