import { ForbiddenException } from '@nestjs/common'
import type { WorkspaceRole } from '@bellum/contracts'
import { WorkspaceRulesService } from './workspace-rules.service'
import type { WorkspaceContextService } from './workspace-context.service'
import type { ProfileEntity } from '../../database/entities/profile.entity'
import type { WorkspaceRulesEntity } from '../../database/entities/workspace-rules.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * #2081.14 — changer une règle d'espace : l'administrateur SEUL, et la trace
 * de qui l'a changée et quand. Chaque test sait dire NON.
 */
const WS = 'ws-1'
const ADMIN = 'user-admin'
const SALES_OPS = 'user-ops'

describe('#2081.14 — WorkspaceRulesService', () => {
  let rules: MockRepository<WorkspaceRulesEntity>
  let profiles: MockRepository<ProfileEntity>
  let roleOf: Record<string, WorkspaceRole>
  let context: {
    resolveActiveWorkspace: jest.Mock
    assertRole: jest.Mock
  }
  let service: WorkspaceRulesService

  beforeEach(() => {
    rules = createMockRepository<WorkspaceRulesEntity>()
    profiles = createMockRepository<ProfileEntity>()
    roleOf = { [ADMIN]: 'admin', [SALES_OPS]: 'sales_ops' }
    context = {
      resolveActiveWorkspace: jest.fn(async (userId: string) => ({ workspaceId: WS, role: roleOf[userId] })),
      // Le VRAI comportement d'`assertRole` : refuser hors de la liste.
      assertRole: jest.fn(async (userId: string, _ws: string, allowed: readonly WorkspaceRole[]) => {
        const role = roleOf[userId]
        if (!role || !allowed.includes(role)) throw new ForbiddenException('Rôle insuffisant pour cette action')
        return { workspace_id: WS, user_id: userId, role }
      }),
    }
    service = new WorkspaceRulesService(
      context as unknown as WorkspaceContextService,
      rules as never,
      profiles as never,
    )
  })

  describe('lecture', () => {
    it('aucune ligne : les défauts, jamais changés, et un membre non admin ne peut pas éditer', async () => {
      const view = await service.view(SALES_OPS)

      expect(view.businessUnitAccountsVisibility).toEqual({
        value: 'shared',
        changedByUserId: null,
        changedByName: null,
        changedAt: null,
      })
      expect(view.exportPolicy.value).toBe('everyone')
      expect(view.canEdit).toBe(false)
      expect(rules.findOne).toHaveBeenCalledWith({ where: { workspace_id: WS } })
    })

    it('rend la trace : qui l’a changée, et quand', async () => {
      const at = new Date('2026-09-19T08:30:00.000Z')
      rules.findOne.mockResolvedValue({
        workspace_id: WS,
        business_unit_accounts_visibility: 'shared',
        business_unit_accounts_visibility_changed_by: null,
        business_unit_accounts_visibility_changed_at: null,
        export_policy: 'admins',
        export_policy_changed_by: ADMIN,
        export_policy_changed_at: at,
      } as WorkspaceRulesEntity)
      profiles.find.mockResolvedValue([
        { user_id: ADMIN, first_name: 'Claire', last_name: 'Martin', email: 'c@x.fr' },
      ] as never)

      const view = await service.view(ADMIN)

      expect(view.exportPolicy).toEqual({
        value: 'admins',
        changedByUserId: ADMIN,
        changedByName: 'Claire Martin',
        changedAt: at.toISOString(),
      })
      expect(view.canEdit).toBe(true)
    })
  })

  describe('la sortie de données, pour l’appelant', () => {
    // #2081.14 — l'écran MASQUE le bouton d'un CSV construit dans le navigateur
    // sur cette seule réponse : la décision vient de l'API, jamais recalculée.
    it('« administrateurs » : refusée à un responsable d’agence, rendue à l’administrateur ; sans règle : ouverte', async () => {
      rules.findOne.mockResolvedValue({
        workspace_id: WS,
        business_unit_accounts_visibility: 'shared',
        export_policy: 'admins',
      } as WorkspaceRulesEntity)
      expect((await service.view(SALES_OPS)).dataExitAllowed).toBe(false)
      expect((await service.view(ADMIN)).dataExitAllowed).toBe(true)

      rules.findOne.mockResolvedValue(null)
      expect((await service.view(SALES_OPS)).dataExitAllowed).toBe(true)
    })
  })

  describe('changement', () => {
    it('NON : un non-administrateur — même porteur de `team:manage` — reçoit 403, et rien n’est écrit', async () => {
      await expect(service.update(SALES_OPS, { exportPolicy: 'admins' })).rejects.toBeInstanceOf(ForbiddenException)
      expect(context.assertRole).toHaveBeenCalledWith(SALES_OPS, WS, ['owner', 'admin'])
      expect(rules.upsert).not.toHaveBeenCalled()
    })

    it('l’administrateur change une règle : valeur, qui, quand — et seulement celle-là', async () => {
      await service.update(ADMIN, { exportPolicy: 'admins' })

      expect(rules.upsert).toHaveBeenCalledTimes(1)
      const [written, options] = rules.upsert.mock.calls[0] as [Record<string, unknown>, unknown]
      expect(options).toEqual({ conflictPaths: ['workspace_id'] })
      expect(written).toMatchObject({ workspace_id: WS, export_policy: 'admins', export_policy_changed_by: ADMIN })
      expect(written.export_policy_changed_at).toBeInstanceOf(Date)
      expect(written).not.toHaveProperty('business_unit_accounts_visibility')
      expect(written).not.toHaveProperty('business_unit_accounts_visibility_changed_by')
    })

    it('reposer la valeur en vigueur n’écrit rien : la trace garde le vrai auteur', async () => {
      rules.findOne.mockResolvedValue({
        workspace_id: WS,
        business_unit_accounts_visibility: 'private',
        export_policy: 'everyone',
      } as WorkspaceRulesEntity)

      await service.update(ADMIN, { businessUnitAccountsVisibility: 'private' })

      expect(rules.upsert).not.toHaveBeenCalled()
    })
  })
})
