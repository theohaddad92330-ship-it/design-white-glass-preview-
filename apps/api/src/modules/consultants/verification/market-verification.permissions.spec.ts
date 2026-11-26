import 'reflect-metadata'
import { ForbiddenException, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { WorkspaceRole } from '@bellum/contracts'
import { WORKSPACE_READ_KEY } from '../../../common/decorator/workspace-read.decorator'
import { WorkspacePermissionGuard } from '../../workspace/workspace-permission.guard'
import type { WorkspaceContextService } from '../../workspace/workspace-context.service'
import { MarketVerificationController } from './market-verification.controller'

/**
 * #2288.2 (décision Louis, 18/09/2026) — LE VIEWER LIT LES ÉTATS, IL NE PAIE
 * JAMAIS.
 *
 * La garde passe par le VRAI `WorkspacePermissionGuard`, avec la métadonnée
 * réellement posée sur chaque méthode du contrôleur : un décorateur retiré ou
 * remplacé demain fait tomber ce fichier, pas seulement un test de forme.
 * « Passe » = la requête atteint le contrôleur (200) ; « refuse » =
 * `ForbiddenException` (403).
 */
function guardFor(role: WorkspaceRole): WorkspacePermissionGuard {
  const workspaceContext = {
    resolveActiveWorkspace: async () => ({ role, workspaceId: 'w1' }),
    extraPermissionsOf: async () => [],
  } as unknown as WorkspaceContextService
  return new WorkspacePermissionGuard(new Reflector(), workspaceContext)
}

function contextFor(method: 'plan' | 'record' | 'states'): ExecutionContext {
  const handler = (MarketVerificationController.prototype as unknown as Record<string, () => unknown>)[method]
  return {
    getHandler: () => handler,
    getClass: () => MarketVerificationController,
    switchToHttp: () => ({ getRequest: () => ({ user: { userId: 'u1' } }) }),
  } as unknown as ExecutionContext
}

describe('MarketVerificationController — qui lit, qui paie', () => {
  it('un VIEWER lit les états (200)', async () => {
    await expect(guardFor('viewer').canActivate(contextFor('states'))).resolves.toBe(true)
  })

  it('un VIEWER ne demande pas de devis (403)', async () => {
    await expect(guardFor('viewer').canActivate(contextFor('plan'))).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('un VIEWER n’inscrit pas de reçu (403)', async () => {
    await expect(guardFor('viewer').canActivate(contextFor('record'))).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('un commercial demande le devis et inscrit le reçu — le geste payant reste ouvert à qui lance', async () => {
    await expect(guardFor('sales').canActivate(contextFor('plan'))).resolves.toBe(true)
    await expect(guardFor('sales').canActivate(contextFor('record'))).resolves.toBe(true)
  })

  it('GA-05 — la lecture DÉCLARE qu’elle est une lecture d’espace, elle n’est pas nue', () => {
    const handler = (MarketVerificationController.prototype as unknown as Record<string, object>).states
    expect(Reflect.getMetadata(WORKSPACE_READ_KEY, handler as object)).toBe(true)
  })
})
