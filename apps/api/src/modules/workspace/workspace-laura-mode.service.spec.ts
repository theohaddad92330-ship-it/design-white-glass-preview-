import { ForbiddenException, NotFoundException } from '@nestjs/common'
import type { WorkspaceRole } from '@bellum/contracts'
import { WorkspaceLauraModeService } from './workspace-laura-mode.service'
import type { WorkspaceContextService } from './workspace-context.service'
import type { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * #2451.9 — LE MODE DE CONTEXTE PAR DÉFAUT DE L'ESPACE : le lire (tout
 * membre), le changer (propriétaire ou administrateur seul, même porte que le
 * marché et le fuseau — `workspace-market.service.ts`, `workspace-timezone.service.ts`).
 *
 * ⚠️ Ce n'est PAS une règle d'espace (#2081.14) : pas de `upsert`, la ligne
 * `workspaces` existe toujours — un `UPDATE` direct, comme le fuseau.
 */
const WS = 'ws-1'
const ADMIN = 'user-admin'
const SALES_OPS = 'user-ops'

describe('#2451.9 — WorkspaceLauraModeService', () => {
  let workspaces: MockRepository<WorkspaceEntity>
  let roleOf: Record<string, WorkspaceRole>
  let context: { resolveActiveWorkspace: jest.Mock; assertRole: jest.Mock }
  let service: WorkspaceLauraModeService

  beforeEach(() => {
    workspaces = createMockRepository<WorkspaceEntity>()
    roleOf = { [ADMIN]: 'admin', [SALES_OPS]: 'sales_ops' }
    context = {
      resolveActiveWorkspace: jest.fn(async (userId: string) => ({ workspaceId: WS, role: roleOf[userId] })),
      assertRole: jest.fn(async (userId: string, _ws: string, allowed: readonly WorkspaceRole[]) => {
        const role = roleOf[userId]
        if (!role || !allowed.includes(role)) throw new ForbiddenException('Rôle insuffisant pour cette action')
        return { workspace_id: WS, user_id: userId, role }
      }),
    }
    service = new WorkspaceLauraModeService(context as unknown as WorkspaceContextService, workspaces as never)
  })

  describe('lecture', () => {
    it('espace jamais réglé : « Mon activité » (comportement d’avant ce lot), et un membre non admin ne peut pas éditer', async () => {
      workspaces.findOne.mockResolvedValue({ id: WS, default_context_mode: 'my_activity' } as WorkspaceEntity)

      const view = await service.getDefaultContextMode(SALES_OPS)

      expect(view).toEqual({ defaultContextMode: 'my_activity', canEdit: false })
    })

    it('rend le mode réglé par l’espace, canEdit=true pour un administrateur', async () => {
      workspaces.findOne.mockResolvedValue({ id: WS, default_context_mode: 'neutral' } as WorkspaceEntity)

      const view = await service.getDefaultContextMode(ADMIN)

      expect(view).toEqual({ defaultContextMode: 'neutral', canEdit: true })
    })
  })

  describe('résolution serveur (`resolveForWorkspace`) — lue par le client, jamais par un tour', () => {
    it('espace introuvable : retombe sur « Mon activité », jamais une exception sur le chemin de lecture', async () => {
      workspaces.findOne.mockResolvedValue(null)
      expect(await service.resolveForWorkspace(WS)).toBe('my_activity')
    })

    it('rend la valeur en base', async () => {
      workspaces.findOne.mockResolvedValue({ id: WS, default_context_mode: 'one_off_mission' } as WorkspaceEntity)
      expect(await service.resolveForWorkspace(WS)).toBe('one_off_mission')
    })
  })

  describe('changement', () => {
    it('NON : un non-administrateur — même porteur de `team:manage` — reçoit 403, et rien n’est écrit', async () => {
      await expect(service.setDefaultContextMode(SALES_OPS, 'neutral')).rejects.toBeInstanceOf(ForbiddenException)
      expect(context.assertRole).toHaveBeenCalledWith(SALES_OPS, WS, ['owner', 'admin'])
      expect(workspaces.update).not.toHaveBeenCalled()
    })

    it('l’administrateur change le mode par défaut', async () => {
      workspaces.update.mockResolvedValue({ affected: 1 })

      const view = await service.setDefaultContextMode(ADMIN, 'one_off_mission')

      expect(workspaces.update).toHaveBeenCalledWith({ id: WS }, { default_context_mode: 'one_off_mission' })
      expect(view).toEqual({ defaultContextMode: 'one_off_mission', canEdit: true })
    })

    it('espace introuvable au moment d’écrire : erreur claire, jamais un succès inventé', async () => {
      workspaces.update.mockResolvedValue({ affected: 0 })
      await expect(service.setDefaultContextMode(ADMIN, 'neutral')).rejects.toBeInstanceOf(NotFoundException)
    })
  })
})

describe('WorkspaceLauraModeService.resolveForUser (#2451.1)', () => {
  it("rend le défaut de l'espace ACTIF de l'utilisateur", async () => {
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-9', role: 'member' }),
    }
    const workspaces = { findOne: jest.fn().mockResolvedValue({ id: 'ws-9', default_context_mode: 'one_off_mission' }) }
    const service = new WorkspaceLauraModeService(workspaceContext as never, workspaces as never)
    await expect(service.resolveForUser('u-1')).resolves.toBe('one_off_mission')
    expect(workspaces.findOne).toHaveBeenCalledWith({ where: { id: 'ws-9' } })
  })

  it('un espace illisible retombe sur « Mon activité » (le chemin historique), jamais une exception', async () => {
    const workspaceContext = { resolveActiveWorkspace: jest.fn().mockRejectedValue(new Error('no workspace')) }
    const service = new WorkspaceLauraModeService(workspaceContext as never, { findOne: jest.fn() } as never)
    await expect(service.resolveForUser('u-1')).resolves.toBe('my_activity')
  })
})
