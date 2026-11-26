import { ForbiddenException, type ExecutionContext } from '@nestjs/common'
import type { Reflector } from '@nestjs/core'
import type { WorkspacePermission, WorkspaceRole } from '@bellum/contracts'
import { WorkspaceContextService } from './workspace-context.service'
import { WorkspacePermissionGuard } from './workspace-permission.guard'
import { DATA_EXIT_KEY } from './data-exit.decorator'
import type { WorkspaceEntity } from '../../database/entities/workspace.entity'
import type { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import type { WorkspaceMemberPermissionEntity } from '../../database/entities/workspace-member-permission.entity'
import type { WorkspaceRulesEntity } from '../../database/entities/workspace-rules.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * #2081.14 — « qui peut exporter » est une RÈGLE D'ESPACE, lue par le serveur à
 * l'endroit qui décide (le guard), jamais seulement cachée côté web. Elle
 * PRIME sur le réglage individuel : un `data:export` accordé en propre ne passe
 * pas une règle qui réserve la sortie de données aux administrateurs.
 *
 * DÉCISION Louis 19/09/2026 (QCM) — la règle ne ferme QUE la SORTIE de données
 * (CSV, téléchargements, exports vers un tableur ou un outil externe), que la
 * route déclare par `@DataExit()`. La permission `data:export` garde aussi
 * l'import, les liens de partage, l'envoi à signature, l'explication de
 * matching et le versement des appels au CRM : ceux-là restent ouverts.
 *
 * Exercé contre le VRAI `WorkspaceContextService` et la VRAIE matrice : ce que
 * ces tests mesurent est la réponse qu'un client recevrait (403 ou passage).
 */
const WS = 'ws-1'
const USER = 'user-1'

describe('#2081.14 — la règle d’espace « qui peut exporter » au guard', () => {
  let workspaces: MockRepository<WorkspaceEntity>
  let members: MockRepository<WorkspaceMemberEntity>
  let grants: MockRepository<WorkspaceMemberPermissionEntity>
  let rules: MockRepository<WorkspaceRulesEntity>
  let context: WorkspaceContextService
  let declared: WorkspacePermission | WorkspacePermission[] | undefined
  let dataExit: boolean | undefined
  let guard: WorkspacePermissionGuard

  const execContext = (): ExecutionContext =>
    ({
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => ({ user: { userId: USER } }) }),
    }) as unknown as ExecutionContext

  const asRole = (role: WorkspaceRole, extra: WorkspacePermission[] = []) => {
    workspaces.findOne.mockResolvedValue(null)
    members.findOne.mockResolvedValue({ workspace_id: WS, user_id: USER, role } as WorkspaceMemberEntity)
    grants.find.mockResolvedValue(extra.map(permission => ({ workspace_id: WS, user_id: USER, permission })) as never)
  }

  const exportReservedToAdmins = () =>
    rules.findOne.mockResolvedValue({
      workspace_id: WS,
      business_unit_accounts_visibility: 'shared',
      export_policy: 'admins',
    } as WorkspaceRulesEntity)

  /** Une route de SORTIE de données : `@RequirePermission('data:export')` + `@DataExit()`. */
  const exportRoute = () => {
    declared = 'data:export'
    dataExit = true
  }

  beforeEach(() => {
    workspaces = createMockRepository<WorkspaceEntity>()
    members = createMockRepository<WorkspaceMemberEntity>()
    grants = createMockRepository<WorkspaceMemberPermissionEntity>()
    rules = createMockRepository<WorkspaceRulesEntity>()
    context = new WorkspaceContextService(
      workspaces as never,
      members as never,
      createMockRepository() as never,
      grants as never,
      rules as never,
    )
    declared = undefined
    dataExit = undefined
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => (key === DATA_EXIT_KEY ? dataExit : declared)),
    } as unknown as Reflector
    guard = new WorkspacePermissionGuard(reflector, context)
  })

  it('NON : un commercial (qui tient `data:export` par son rôle) est refusé sur une sortie, et le refus NOMME la règle', async () => {
    asRole('sales')
    exportReservedToAdmins()
    exportRoute()

    const refusal = guard.canActivate(execContext())
    await expect(refusal).rejects.toBeInstanceOf(ForbiddenException)
    await expect(guard.canActivate(execContext())).rejects.toThrow(/^Réservé par la règle d’espace : /)
    expect(rules.findOne).toHaveBeenCalledWith({ where: { workspace_id: WS } })
  })

  it('le refus porte un CODE machine et la règle, pour que l’écran le traduise sans relire la phrase', async () => {
    asRole('sales')
    exportReservedToAdmins()
    exportRoute()

    const error = await guard.canActivate(execContext()).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect((error as ForbiddenException).getResponse()).toMatchObject({
      statusCode: 403,
      code: 'workspace_rule_refused',
      rule: 'exportPolicy',
    })
  })

  it('NON : la règle l’emporte sur un `data:export` accordé EN PROPRE', async () => {
    asRole('viewer', ['data:export'])
    exportReservedToAdmins()
    exportRoute()

    await expect(guard.canActivate(execContext())).rejects.toThrow(/règle d’espace/)
  })

  it('un administrateur et le propriétaire exportent toujours', async () => {
    exportReservedToAdmins()
    exportRoute()
    for (const role of ['owner', 'admin'] as const) {
      asRole(role)
      await expect(guard.canActivate(execContext())).resolves.toBe(true)
    }
  })

  it('sans règle posée (aucune ligne), rien ne change : le commercial exporte', async () => {
    asRole('sales')
    exportRoute()

    await expect(guard.canActivate(execContext())).resolves.toBe(true)
  })

  // DÉCISION Louis 19/09 — le test qui dit NON DES DEUX CÔTÉS.
  it('décision 19/09 — un membre sous « administrateurs » : export REFUSÉ, import AUTORISÉ', async () => {
    asRole('sales')
    exportReservedToAdmins()

    exportRoute()
    await expect(guard.canActivate(execContext())).rejects.toThrow(/^Réservé par la règle d’espace : /)

    // L'import (comme le partage, la signature, l'explication de matching, le
    // versement des appels au CRM) tient `data:export` SANS être une sortie.
    declared = 'data:export'
    dataExit = undefined
    await expect(guard.canActivate(execContext())).resolves.toBe(true)
  })

  it('une sortie SANS permission déclarée (un CSV lu par tout membre) est tenue par la règle elle aussi', async () => {
    asRole('sales')
    exportReservedToAdmins()
    dataExit = true

    await expect(guard.canActivate(execContext())).rejects.toThrow(/^Réservé par la règle d’espace : /)

    rules.findOne.mockResolvedValue(null)
    await expect(guard.canActivate(execContext())).resolves.toBe(true)
  })

  it('ne lit PAS les règles pour une route qui n’est pas une sortie', async () => {
    asRole('sales')
    exportReservedToAdmins()
    declared = 'data:export'

    await expect(guard.canActivate(execContext())).resolves.toBe(true)
    expect(rules.findOne).not.toHaveBeenCalled()
  })

  it('un rôle SANS la permission de la route garde le refus de rôle, pas celui de la règle', async () => {
    asRole('tech_admin')
    exportReservedToAdmins()
    exportRoute()

    await expect(guard.canActivate(execContext())).rejects.toThrow('Rôle insuffisant pour cette action')
  })

  it("`assertPermission('data:export')` ne lit plus la règle : la permission n’est pas la sortie", async () => {
    asRole('sales')
    exportReservedToAdmins()

    await expect(context.assertPermission(USER, WS, 'data:export')).resolves.toMatchObject({ role: 'sales' })
    expect(rules.findOne).not.toHaveBeenCalled()
  })

  describe('#2879 (#2442.14, lot X17) — chaque sortie autorisée laisse UNE ligne de compteur', () => {
    const ROUTE = '/talents/export/ats'
    const routedContext = (): ExecutionContext =>
      ({
        getHandler: () => () => undefined,
        getClass: () => class {},
        switchToHttp: () => ({ getRequest: () => ({ user: { userId: USER }, route: { path: ROUTE } }) }),
      }) as unknown as ExecutionContext

    it('une sortie qui passe écrit `data_export` : l’espace et la ROUTE seule, aucune personne', async () => {
      asRole('sales')
      exportRoute()
      await expect(guard.canActivate(routedContext())).resolves.toBe(true)
      expect(workspaces.query).toHaveBeenCalledTimes(1)
      const [sql, params] = workspaces.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('INSERT INTO security_events')
      expect(params).toEqual(['data_export', 200, WS, ROUTE])
      expect(JSON.stringify(params)).not.toContain(USER)
    })

    it('une sortie REFUSÉE par la règle d’espace n’écrit rien : rien n’est sorti', async () => {
      asRole('sales')
      exportReservedToAdmins()
      exportRoute()
      await expect(guard.canActivate(routedContext())).rejects.toBeInstanceOf(ForbiddenException)
      expect(workspaces.query).not.toHaveBeenCalled()
    })

    it('une route qui n’est pas une sortie n’écrit rien', async () => {
      asRole('sales')
      declared = 'data:export'
      dataExit = undefined
      await expect(guard.canActivate(routedContext())).resolves.toBe(true)
      expect(workspaces.query).not.toHaveBeenCalled()
    })

    it('un compteur qui ne s’écrit pas ne bloque JAMAIS l’export', async () => {
      asRole('sales')
      exportRoute()
      workspaces.query.mockRejectedValueOnce(new Error('db down'))
      await expect(guard.canActivate(routedContext())).resolves.toBe(true)
    })
  })
})
