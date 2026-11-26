import { ForbiddenException } from '@nestjs/common'
import type { ActionIntent, PendingChatAction } from '@bellum/contracts'
import type { ApprovalRequestEntity } from '../../database/entities/approval-request.entity'
import type { CreditReservationEntity } from '../../database/entities/credit-reservation.entity'
import type { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import type { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { CopilotCardService } from './copilot-card.service'
import { CreditReservationService } from './credit-reservation.service'
import { inMemoryRepository } from './testing/in-memory-repository'
import { WorkflowRunnerService } from './workflow-runner.service'

/**
 * #1943.4 — une carte validée par un manager S'EXÉCUTE AU NOM DE L'AUTEUR
 * (décision de Louis du 13/09) ; le manager est tracé comme validateur.
 *
 * Avant : `decideApprovalRequest` exécutait avec le principal du DÉCIDEUR. Le
 * contrôle de propriété du routeur (`findOwnedForAction(contactId, userId)`)
 * portait donc sur le manager, le débit partait sur son compte, et l'écriture
 * dans un outil connecté se faisait en son nom — pour une action qu'il n'a pas
 * préparée.
 */

const WS = '7a0c2f10-0000-4000-8000-000000000002'
const OTHER_WS = '7a0c2f10-0000-4000-8000-000000000099'
const AUTHOR = '9d359267-0000-4000-8000-000000000001'
const MANAGER = '9d359267-0000-4000-8000-000000000005'
const CONTACT = '11111111-1111-4111-8111-111111111111'
const TURN = '33333333-3333-4333-8333-333333333333'
const author = { userId: AUTHOR, email: 'rep@esn.fr' }
const manager = { userId: MANAGER, email: 'lead@esn.fr' }

const ENRICH: PendingChatAction = {
  action: 'enrich_contact',
  contact_id: CONTACT,
  contact_name: 'Claire Dubois',
  organization_name: 'ACME',
}

type AuthorStatus = 'active' | 'removed' | 'elsewhere' | 'viewer'

function harness(authorStatus: { value: AuthorStatus } = { value: 'active' }) {
  const runs = inMemoryRepository<WorkflowRunEntity>({
    unique: {
      name: 'workflow_runs_idempotency_idx',
      clash: (rows, candidate) =>
        rows.some(
          row => row.workspace_id === candidate.workspace_id && row.idempotency_key === candidate.idempotency_key,
        ),
    },
  })
  const approvals = inMemoryRepository<ApprovalRequestEntity>()
  const workspaces = inMemoryRepository<WorkspaceEntity>()
  // Seuil de dépense à 1 : une carte payante attend un responsable (`n3`).
  workspaces.rows.push({ id: WS, approval_spend_threshold: 1 } as unknown as WorkspaceEntity)
  const reservationRows = inMemoryRepository<CreditReservationEntity>()
  const reservations = new CreditReservationService(reservationRows as never)
  const accounts = inMemoryRepository<{ id: string; workspace_id: string }>()
  const contacts = inMemoryRepository<{ id: string; workspace_id: string }>()
  contacts.rows.push({ id: CONTACT, workspace_id: WS })

  const dispatch = jest.fn(async (intent: ActionIntent, _principal: { userId: string; email: string }) => ({
    type: intent.type,
    status: 'done',
    externalRef: 'job-1',
    creditsDebited: 1,
  }))
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(async (userId: string) => {
      if (userId === MANAGER) return { workspaceId: WS, role: 'admin' }
      switch (authorStatus.value) {
        case 'removed':
          throw new ForbiddenException('Aucun espace de travail associé à cet utilisateur')
        case 'elsewhere':
          return { workspaceId: OTHER_WS, role: 'sales' }
        case 'viewer':
          return { workspaceId: WS, role: 'viewer' }
        default:
          return { workspaceId: WS, role: 'sales' }
      }
    }),
    isDemoWorkspace: jest.fn(async () => false),
    // D1 — lus quand le rôle de l'auteur ne suffit pas (même règle que la garde HTTP).
    extraPermissionsOf: jest.fn(async () => []),
  }
  const runner = new WorkflowRunnerService(
    runs as never,
    approvals as never,
    workspaces as never,
    { dispatch, observe: jest.fn() } as never,
    reservations,
    workspaceContext as never,
  )
  const cards = new CopilotCardService(
    runs as never,
    approvals as never,
    runner,
    reservations,
    accounts as never,
    contacts as never,
  )

  /** L'auteur prépare puis clique : la dépense monte la carte à `n3`, une demande s'ouvre. */
  const awaitingManager = async () => {
    const proposed = await cards.propose({
      principal: author,
      conversationId: 'conv-1',
      turnId: TURN,
      proposalIndex: 0,
      action: ENRICH,
    })
    const runId = proposed?.run.id as string
    expect((await cards.confirm(runId, author)).state).toBe('awaiting_review')
    const pending = approvals.rows.find(row => row.state === 'pending') as ApprovalRequestEntity
    return { runId, approvalId: pending.id }
  }
  return { cards, runner, runs, approvals, reservationRows, dispatch, awaitingManager, authorStatus }
}

describe('#1943.4 — la carte validée par un manager s’exécute au nom de son AUTEUR', () => {
  it('le dispatch porte l’AUTEUR (origine `user`), l’approbation porte le MANAGER comme validateur', async () => {
    const { runner, cards, approvals, dispatch, awaitingManager } = harness()
    const { runId, approvalId } = await awaitingManager()

    await runner.decideApprovalRequest({ approvalId, principal: manager, decision: 'approve' })

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0]?.[1]).toMatchObject({ userId: AUTHOR, origin: 'user' })
    expect(approvals.rows.find(row => row.id === approvalId)).toMatchObject({
      state: 'approved',
      decided_by: MANAGER,
      requested_by: AUTHOR,
    })
    expect((await cards.view(runId, author)).state).toBe('executed')
  })

  it('sait dire NON — le manager n’apparaît dans AUCUN dispatch, ni dans la réservation de crédits', async () => {
    const { runner, dispatch, reservationRows, awaitingManager } = harness()
    const { approvalId } = await awaitingManager()

    await runner.decideApprovalRequest({ approvalId, principal: manager, decision: 'approve' })

    expect(dispatch.mock.calls.map(call => (call[1] as { userId: string }).userId)).not.toContain(MANAGER)
    expect(reservationRows.rows.map(row => row.user_id)).not.toContain(MANAGER)
  })

  it.each([
    ['retiré de l’espace', 'removed'],
    ['actif dans un AUTRE espace (rien ne part dans le mauvais)', 'elsewhere'],
    ['sans le droit de l’effet', 'viewer'],
  ] as const)('un auteur %s : la carte NE s’exécute PAS, état clair « rien n’est parti »', async (_label, status) => {
    const state = { value: 'active' as AuthorStatus }
    const { runner, cards, dispatch, reservationRows, awaitingManager } = harness(state)
    const { runId, approvalId } = await awaitingManager()
    state.value = status

    const run = await runner.decideApprovalRequest({ approvalId, principal: manager, decision: 'approve' })

    expect(dispatch).not.toHaveBeenCalled()
    expect(run.status).toBe('blocked')
    expect(reservationRows.rows.filter(row => row.state === 'reserved')).toHaveLength(0)
    const view = await cards.view(runId, manager)
    expect(view.state).toBe('blocked')
    expect(view.result?.outcome).toMatch(/auteur/i)
  })

  it('témoin — l’auteur qui tranche lui-même une demande `n2` exécute toujours en son propre nom', async () => {
    const { runner, runs, approvals, dispatch } = harness()
    const run = await runs.save(
      runs.create({
        workspace_id: WS,
        user_id: AUTHOR,
        definition_key: 'card_enrich_contact',
        definition_version: 1,
        trigger: 'copilot_proposal',
        status: 'awaiting_approval',
        correlation_id: 'card_x_0',
        idempotency_key: 'card:x:0',
        steps: [],
        estimated_credits: 1,
        spent_credits: 0,
        started_at: null,
        finished_at: null,
        intents: { effect: { type: 'enrich_contact', contactId: CONTACT, mode: 'queued' } },
      } as Partial<WorkflowRunEntity> as WorkflowRunEntity),
    )
    const approval = await approvals.save(
      approvals.create({
        workspace_id: WS,
        run_id: run.id,
        required_level: 'n2_user_approval',
        state: 'pending',
        requested_by: AUTHOR,
        expires_at: new Date(Date.now() + 60_000),
      } as Partial<ApprovalRequestEntity> as ApprovalRequestEntity),
    )

    await runner.decideApprovalRequest({ approvalId: approval.id, principal: author, decision: 'approve' })

    expect(dispatch.mock.calls[0]?.[1]).toMatchObject({ userId: AUTHOR, email: 'rep@esn.fr' })
  })
})
