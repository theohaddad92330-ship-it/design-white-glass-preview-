import type { ApprovalRequestEntity } from '../../database/entities/approval-request.entity'
import type { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import type { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { createMockRepository } from '../../database/test-utils'
import type { ActionRouterService } from '../action-router/action-router.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { CreditReservationService } from './credit-reservation.service'
import { WorkflowRunnerService } from './workflow-runner.service'

/**
 * #2857 (#2201.31) — « Demander une explication » sur une carte de
 * validation. `explainApprovalRequest` est une LECTURE : elle ne modifie rien,
 * contrairement à `assignApprovalRequest`/`snoozeApprovalRequest`
 * (approval-delegation.spec.ts), qui partagent la même résolution d'espace.
 */

function build() {
  const runs = createMockRepository<WorkflowRunEntity>()
  const approvals = createMockRepository<ApprovalRequestEntity>()
  const workspaces = createMockRepository<WorkspaceEntity>()
  workspaces.findOne.mockResolvedValue({})
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' }),
  } as unknown as WorkspaceContextService
  const service = new WorkflowRunnerService(
    runs as never,
    approvals as never,
    workspaces as never,
    {} as ActionRouterService,
    {} as CreditReservationService,
    workspaceContext,
  )
  return { service, approvals, workspaceContext }
}

function pending(over: Partial<ApprovalRequestEntity> = {}): ApprovalRequestEntity {
  return {
    id: 'ap-1',
    workspace_id: 'ws-1',
    run_id: 'run-1',
    required_level: 'n2_user_approval',
    state: 'pending',
    requested_by: 'u1',
    reason: 'Le contact a répondu positivement hier.',
    summary: 'Créer une tâche CRM de relance chez Acme.',
    assigned_to: null,
    snoozed_until: null,
    decided_by: null,
    decided_at: null,
    expires_at: new Date('2026-10-01T00:00:00.000Z'),
    created_at: new Date('2026-09-25T00:00:00.000Z'),
    ...over,
  } as ApprovalRequestEntity
}

describe('expliquer une carte de validation (#2857)', () => {
  it('rend les faits déjà stockés de la demande, bornée à son espace', async () => {
    const h = build()
    h.approvals.findOne.mockResolvedValue(pending())
    const explanation = await h.service.explainApprovalRequest({ approvalId: 'ap-1', userId: 'u1' })
    expect(h.workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('u1')
    expect(h.approvals.findOne).toHaveBeenCalledWith({ where: { id: 'ap-1', workspace_id: 'ws-1' } })
    expect(explanation).toMatchObject({
      id: 'ap-1',
      summary: 'Créer une tâche CRM de relance chez Acme.',
      reason: 'Le contact a répondu positivement hier.',
    })
  })

  it('rend `null` pour une demande introuvable ou hors de l’espace — jamais une donnée inventée', async () => {
    const h = build()
    h.approvals.findOne.mockResolvedValue(null)
    const explanation = await h.service.explainApprovalRequest({ approvalId: 'ap-404', userId: 'u1' })
    expect(explanation).toBeNull()
  })
})
