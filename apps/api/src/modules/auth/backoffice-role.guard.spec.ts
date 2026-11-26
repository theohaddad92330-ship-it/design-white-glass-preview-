import { ForbiddenException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import { failure, success } from '@bellum/utils'
import { BACKOFFICE_ROLE, BackofficeRoleGuard } from './backoffice-role.guard'
import type { SessionService } from './session.service'

/** Un contexte d'exécution minimal — seul `req.user` compte pour ce garde. */
function contextFor(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext
}

function guardWith(roles: string[] | null) {
  const getSession = jest
    .fn()
    .mockResolvedValue(
      roles === null
        ? failure({ code: 'user_not_found', message: 'Utilisateur introuvable' })
        : success({ user: { id: 'u-1', email: 'op@bellum-ai.com', roles } }),
    )
  const guard = new BackofficeRoleGuard({ getSession } as unknown as SessionService)
  return { guard, getSession }
}

describe('BackofficeRoleGuard', () => {
  it('laisse passer le porteur du rôle backoffice', async () => {
    const { guard } = guardWith([BACKOFFICE_ROLE])
    await expect(guard.canActivate(contextFor({ userId: 'u-1' }))).resolves.toBe(true)
  })

  it('laisse passer quand le rôle accompagne d’autres rôles', async () => {
    // Un opérateur est aussi un client : il garde sa coquille et son espace.
    const { guard } = guardWith(['customer', BACKOFFICE_ROLE])
    await expect(guard.canActivate(contextFor({ userId: 'u-1' }))).resolves.toBe(true)
  })

  it('refuse un utilisateur connecté SANS le rôle — même en appelant la route directement', async () => {
    // C'est la moitié qui compte : le garde de navigation est côté écran, donc
    // contournable. Celui-ci ne l'est pas.
    const { guard } = guardWith(['customer'])
    await expect(guard.canActivate(contextFor({ userId: 'u-2' }))).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('refuse quand la requête ne porte aucune identité', async () => {
    const { guard, getSession } = guardWith(['customer'])
    await expect(guard.canActivate(contextFor(undefined))).rejects.toBeInstanceOf(ForbiddenException)
    // Rien à demander à Supabase : sans `userId` il n'y a rien à lire.
    expect(getSession).not.toHaveBeenCalled()
  })

  it('refuse quand le compte est introuvable, sans supposer un rôle', async () => {
    const { guard } = guardWith(null)
    await expect(guard.canActivate(contextFor({ userId: 'u-3' }))).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('lit le rôle sur le compte SERVEUR, pas sur les claims du jeton', async () => {
    // Un jeton Supabase transporte sa propre copie de `app_metadata`, figée à
    // la signature : un rôle retiré il y a cinq minutes y vivrait encore une
    // heure. `getSession` relit le compte via la clé de service — c'est la seule
    // lecture qui dise l'état d'aujourd'hui.
    const { guard, getSession } = guardWith([BACKOFFICE_ROLE])
    await guard.canActivate(contextFor({ userId: 'u-1', roles: ['backoffice'] }))
    expect(getSession).toHaveBeenCalledWith('u-1')
  })
})
