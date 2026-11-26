import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import type { ApprovalRequestEntity } from '../../database/entities/approval-request.entity'
import type { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import type { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { createMockRepository } from '../../database/test-utils'
import type { ActionRouterService } from '../action-router/action-router.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { CreditReservationService } from './credit-reservation.service'
import { WorkflowRunnerService } from './workflow-runner.service'

/**
 * #2864 — DÉLÉGUER une demande d'approbation à un collègue du MÊME espace.
 * #2856 — REPORTER une demande d'approbation (une écriture CRM/ERP en attente).
 *
 * Les deux gestes touchent le CIRCUIT de la demande, jamais son contenu : le
 * résumé figé, le niveau requis et l'expiration ne bougent pas, et la demande
 * reste `pending` — elle passe toujours par la porte.
 */

const REQUESTER = { userId: 'u1', email: 'rep@esn.fr' }
const COLLEAGUE = '22222222-2222-2222-2222-222222222222'
const OUTSIDER = '99999999-9999-9999-9999-999999999999'

function build(options: { role?: 'owner' | 'sales'; members?: Record<string, 'sales' | 'admin' | 'viewer'> } = {}) {
  const runs = createMockRepository<WorkflowRunEntity>()
  const approvals = createMockRepository<ApprovalRequestEntity>()
  const workspaces = createMockRepository<WorkspaceEntity>()
  approvals.update.mockResolvedValue({ affected: 1 })
  workspaces.findOne.mockResolvedValue({})
  const members = options.members ?? { [COLLEAGUE]: 'sales' }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: options.role ?? 'sales' }),
    // L'appartenance se lit sur l'espace DE LA DEMANDE : un membre d'un autre
    // espace rend `null` ici, exactement comme en base.
    getMembership: jest.fn(async (userId: string, workspaceId: string) =>
      workspaceId === 'ws-1' && members[userId]
        ? { user_id: userId, workspace_id: 'ws-1', role: members[userId] }
        : null,
    ),
  } as unknown as WorkspaceContextService
  const service = new WorkflowRunnerService(
    runs as never,
    approvals as never,
    workspaces as never,
    {} as ActionRouterService,
    {} as CreditReservationService,
    workspaceContext,
  )
  return { service, approvals, runs, workspaceContext }
}

function pending(over: Partial<ApprovalRequestEntity> = {}): ApprovalRequestEntity {
  return {
    id: 'ap-1',
    workspace_id: 'ws-1',
    run_id: 'run-1',
    required_level: 'n2_user_approval',
    state: 'pending',
    requested_by: REQUESTER.userId,
    assigned_to: null,
    snoozed_until: null,
    expires_at: new Date(Date.now() + 3 * 24 * 3600_000),
    ...over,
  } as ApprovalRequestEntity
}

describe('déléguer une demande (#2864)', () => {
  it('REFUSE un collègue d’un autre espace — rien ne s’écrit', async () => {
    const h = build()
    h.approvals.findOne.mockResolvedValue(pending())
    await expect(
      h.service.assignApprovalRequest({ approvalId: 'ap-1', principal: REQUESTER, assigneeId: OUTSIDER }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(h.workspaceContext.getMembership).toHaveBeenCalledWith(OUTSIDER, 'ws-1')
    expect(h.approvals.update).not.toHaveBeenCalled()
  })

  it('confie la demande à un membre de l’espace, sur une réclamation `pending` scopée à l’espace', async () => {
    const h = build()
    h.approvals.findOne.mockResolvedValue(pending())
    await h.service.assignApprovalRequest({ approvalId: 'ap-1', principal: REQUESTER, assigneeId: COLLEAGUE })
    expect(h.approvals.findOne).toHaveBeenCalledWith({ where: { id: 'ap-1', workspace_id: 'ws-1' } })
    expect(h.approvals.update).toHaveBeenCalledWith(
      { id: 'ap-1', workspace_id: 'ws-1', state: 'pending' },
      { assigned_to: COLLEAGUE },
    )
  })

  it('une demande d’un autre espace reste introuvable', async () => {
    const h = build()
    h.approvals.findOne.mockResolvedValue(null)
    await expect(
      h.service.assignApprovalRequest({ approvalId: 'ap-x', principal: REQUESTER, assigneeId: COLLEAGUE }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('un tiers de l’espace ne s’attribue pas la demande d’un autre', async () => {
    const h = build({ members: { u3: 'sales' } })
    h.approvals.findOne.mockResolvedValue(pending())
    await expect(
      h.service.assignApprovalRequest({
        approvalId: 'ap-1',
        principal: { userId: 'u3', email: 'x@esn.fr' },
        assigneeId: 'u3',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('retirer la délégation (`null`) ne consulte aucun membre', async () => {
    const h = build()
    h.approvals.findOne.mockResolvedValue(pending({ assigned_to: COLLEAGUE }))
    await h.service.assignApprovalRequest({ approvalId: 'ap-1', principal: REQUESTER, assigneeId: null })
    expect(h.workspaceContext.getMembership).not.toHaveBeenCalled()
    expect(h.approvals.update).toHaveBeenCalledWith(
      { id: 'ap-1', workspace_id: 'ws-1', state: 'pending' },
      { assigned_to: null },
    )
  })

  it('une demande déjà tranchée ne se délègue plus', async () => {
    const h = build()
    h.approvals.findOne.mockResolvedValue(pending({ state: 'approved' }))
    await expect(
      h.service.assignApprovalRequest({ approvalId: 'ap-1', principal: REQUESTER, assigneeId: COLLEAGUE }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('le collègue désigné peut ensuite trancher un clic simple', async () => {
    const h = build()
    h.approvals.findOne.mockResolvedValue(pending({ assigned_to: COLLEAGUE }))
    h.runs.findOne.mockResolvedValue({ id: 'run-1', workspace_id: 'ws-1', intents: {}, correlation_id: 'c' })
    h.runs.update.mockResolvedValue({ affected: 1 })
    const reservations = { settle: jest.fn().mockResolvedValue(undefined) }
    ;(h.service as unknown as { reservations: typeof reservations }).reservations = reservations
    await h.service.decideApprovalRequest({
      approvalId: 'ap-1',
      principal: { userId: COLLEAGUE, email: 'c@esn.fr' },
      decision: 'reject',
    })
    expect(h.approvals.update).toHaveBeenCalledWith(
      { id: 'ap-1', workspace_id: 'ws-1', state: 'pending' },
      expect.objectContaining({ state: 'rejected', decided_by: COLLEAGUE }),
    )
  })
})

describe('reporter une demande (#2856)', () => {
  it('reporte jusqu’à une date future, sans toucher à l’état ni au contenu', async () => {
    const h = build()
    h.approvals.findOne.mockResolvedValue(pending())
    const until = new Date(Date.now() + 24 * 3600_000)
    await h.service.snoozeApprovalRequest({ approvalId: 'ap-1', principal: REQUESTER, until })
    expect(h.approvals.update).toHaveBeenCalledWith(
      { id: 'ap-1', workspace_id: 'ws-1', state: 'pending' },
      { snoozed_until: until },
    )
  })

  it('refuse une date passée', async () => {
    const h = build()
    h.approvals.findOne.mockResolvedValue(pending())
    await expect(
      h.service.snoozeApprovalRequest({ approvalId: 'ap-1', principal: REQUESTER, until: new Date(Date.now() - 1000) }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(h.approvals.update).not.toHaveBeenCalled()
  })

  it('refuse un report au-delà de l’expiration — la demande périrait endormie', async () => {
    const h = build()
    const approval = pending()
    h.approvals.findOne.mockResolvedValue(approval)
    await expect(
      h.service.snoozeApprovalRequest({
        approvalId: 'ap-1',
        principal: REQUESTER,
        until: new Date(approval.expires_at.getTime() + 1000),
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('`null` réveille la demande', async () => {
    const h = build()
    h.approvals.findOne.mockResolvedValue(pending({ snoozed_until: new Date(Date.now() + 3600_000) }))
    await h.service.snoozeApprovalRequest({ approvalId: 'ap-1', principal: REQUESTER, until: null })
    expect(h.approvals.update).toHaveBeenCalledWith(
      { id: 'ap-1', workspace_id: 'ws-1', state: 'pending' },
      { snoozed_until: null },
    )
  })

  it('un tiers de l’espace ne reporte pas la demande d’un autre', async () => {
    const h = build()
    h.approvals.findOne.mockResolvedValue(pending())
    await expect(
      h.service.snoozeApprovalRequest({
        approvalId: 'ap-1',
        principal: { userId: 'u3', email: 'x@esn.fr' },
        until: new Date(Date.now() + 3600_000),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })
})
