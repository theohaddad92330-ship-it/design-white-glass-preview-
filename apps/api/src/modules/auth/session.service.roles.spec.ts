import { ForbiddenException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import type { User } from '@supabase/supabase-js'
import { BACKOFFICE_ROLE, BackofficeRoleGuard } from './backoffice-role.guard'
import { SessionService } from './session.service'
import type { SupabaseAuthGateway } from './supabase-auth.gateway'

/**
 * fix/roles-app-metadata — LA SOURCE DE VÉRITÉ DES RÔLES EST `app_metadata`.
 *
 * `user_metadata` est modifiable par l'utilisateur lui-même (PUT /auth/v1/user
 * avec son propre jeton et la clé anon) : y lire un rôle laissait n'importe quel
 * client s'attribuer `backoffice`. `app_metadata` n'est écrit que par la clé de
 * service. Ces tests prouvent que la faille est fermée, de la lecture du compte
 * jusqu'au garde.
 */
function userWith(meta: { user?: Record<string, unknown>; app?: Record<string, unknown> }): User {
  return {
    id: 'u-1',
    email: 'op@bellum-ai.com',
    created_at: '2026-10-05T00:00:00Z',
    email_confirmed_at: null,
    aud: 'authenticated',
    user_metadata: meta.user ?? {},
    app_metadata: meta.app ?? {},
  } as unknown as User
}

function serviceReturning(user: User) {
  const getUserById = jest.fn().mockResolvedValue({ data: { user }, error: null })
  const gateway = { client: { auth: { admin: { getUserById } } } } as unknown as SupabaseAuthGateway
  return new SessionService(gateway, {} as never, {} as never)
}

function contextFor(userId: string): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ user: { userId } }) }) } as unknown as ExecutionContext
}

describe('SessionService.mapToSessionUser — rôles lus dans app_metadata', () => {
  const service = serviceReturning(userWith({}))

  it('IGNORE un rôle posé dans user_metadata (modifiable par l’utilisateur) → customer', () => {
    const mapped = service.mapToSessionUser(userWith({ user: { roles: [BACKOFFICE_ROLE] } }))
    expect(mapped.roles).toEqual(['customer'])
  })

  it('lit le rôle posé dans app_metadata (écrit seulement par la clé de service)', () => {
    const mapped = service.mapToSessionUser(userWith({ app: { roles: ['customer', BACKOFFICE_ROLE] } }))
    expect(mapped.roles).toEqual(['customer', BACKOFFICE_ROLE])
  })

  it('app_metadata gagne : user_metadata ne peut pas AJOUTER un rôle', () => {
    const mapped = service.mapToSessionUser(
      userWith({ app: { roles: ['customer'] }, user: { roles: [BACKOFFICE_ROLE] } }),
    )
    expect(mapped.roles).toEqual(['customer'])
  })

  it('défaut customer sans rôle valide (absent, vide, mal typé)', () => {
    expect(service.mapToSessionUser(userWith({})).roles).toEqual(['customer'])
    expect(service.mapToSessionUser(userWith({ app: { roles: [] } })).roles).toEqual(['customer'])
    expect(service.mapToSessionUser(userWith({ app: { roles: 'backoffice' } })).roles).toEqual(['customer'])
    expect(service.mapToSessionUser(userWith({ app: { roles: [1, BACKOFFICE_ROLE] } })).roles).toEqual(['customer'])
  })
})

describe('BackofficeRoleGuard — de bout en bout sur la lecture du compte', () => {
  it('refuse un utilisateur qui s’est attribué backoffice dans user_metadata', async () => {
    const guard = new BackofficeRoleGuard(serviceReturning(userWith({ user: { roles: [BACKOFFICE_ROLE] } })))
    await expect(guard.canActivate(contextFor('u-1'))).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('accepte un opérateur dont le rôle est dans app_metadata', async () => {
    const guard = new BackofficeRoleGuard(serviceReturning(userWith({ app: { roles: [BACKOFFICE_ROLE] } })))
    await expect(guard.canActivate(contextFor('u-1'))).resolves.toBe(true)
  })
})
