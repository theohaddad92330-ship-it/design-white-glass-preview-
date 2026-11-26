import { ForbiddenException } from '@nestjs/common'
import { WorkspacePermissionGuard } from './workspace-permission.guard'

/**
 * Le guard consulte les permissions accordées EN PROPRE, pas seulement le rôle.
 *
 * Sans ça, la seule façon de confier la connexion du CRM à un commercial était
 * de le passer `admin` — huit droits pour en régler un. Le contrat sait déjà
 * répondre (`can()`) ; ce test vérifie que le CHEMIN SERVEUR le demande, parce
 * qu'un droit calculé correctement mais jamais consulté ne sert à rien.
 *
 * Deux propriétés comptent autant que l'accord lui-même :
 *  - la lecture est FERMÉE en cas d'échec — une base indisponible ne doit pas
 *    accorder un droit, sinon une panne devient une élévation de privilège ;
 *  - une exception n'enlève jamais rien : le rôle reste acquis quoi qu'il
 *    arrive.
 */
describe('WorkspacePermissionGuard — permissions accordées en propre', () => {
  const context = (userId: string | undefined) =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user: userId ? { userId } : undefined }) }),
    }) as never

  const build = (role: string, extra: string[], permission: string | undefined) => {
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1', role }),
      extraPermissionsOf: jest.fn().mockResolvedValue(extra),
    }
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(permission) }
    return { guard: new WorkspacePermissionGuard(reflector as never, workspaceContext as never), workspaceContext }
  }

  it('laisse passer un droit accordé en propre que le rôle n’a pas', async () => {
    const { guard } = build('sales', ['integrations:manage'], 'integrations:manage')

    await expect(guard.canActivate(context('u-1'))).resolves.toBe(true)
  })

  it('refuse toujours ce qui n’est ni dans le rôle ni accordé', async () => {
    const { guard } = build('sales', ['integrations:manage'], 'billing:manage')

    await expect(guard.canActivate(context('u-1'))).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('n’enlève rien : un droit du rôle passe même avec une liste d’exceptions étrangère', async () => {
    const { guard } = build('sales', ['finance:read'], 'analysis:run')

    await expect(guard.canActivate(context('u-1'))).resolves.toBe(true)
  })

  it('reste un no-op quand la route ne déclare aucune permission', async () => {
    const { guard, workspaceContext } = build('viewer', [], undefined)

    await expect(guard.canActivate(context('u-1'))).resolves.toBe(true)
    expect(workspaceContext.resolveActiveWorkspace).not.toHaveBeenCalled()
  })

  it('refuse sans identité, même si la permission est accordée partout', async () => {
    const { guard } = build('owner', ['billing:manage'], 'billing:manage')

    await expect(guard.canActivate(context(undefined))).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('refuse un `viewer` sur une écriture tant qu’on ne lui a rien accordé', async () => {
    const { guard } = build('viewer', [], 'records:write')

    await expect(guard.canActivate(context('u-1'))).rejects.toBeInstanceOf(ForbiddenException)
  })
})
