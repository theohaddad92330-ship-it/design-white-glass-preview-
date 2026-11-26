import { EventEmitter } from 'node:events'
import type { PendingChatAction } from '@bellum/contracts'
import type { ConfigService } from '@nestjs/config'
import type { Response } from 'express'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { ApprovalRequestEntity } from '../../database/entities/approval-request.entity'
import type { CreditReservationEntity } from '../../database/entities/credit-reservation.entity'
import type { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import type { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { CopilotCardService } from '../action-os/copilot-card.service'
import { CreditReservationService } from '../action-os/credit-reservation.service'
import { inMemoryRepository } from '../action-os/testing/in-memory-repository'
import { WorkflowRunnerService } from '../action-os/workflow-runner.service'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import type { ChatStreamEvent, IaClient } from '../ia/ia.client'
import type { ToolRegistryService } from '../tool-registry/tool-registry.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { ChatContextService } from './chat-context.service'
import type { ChatMessagesService } from './chat-messages.service'
import type { ChatThreadDocumentsService } from './chat-thread-documents.service'
import type { DiscoverPortfolioService } from './discover-portfolio.service'
import type { ChatDto } from './dto/ia-proxy.dto'
import { IaProxyController } from './ia-proxy.controller'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ARRÊT OBLIGATOIRE FACTURATION — le tour de conversation, simulé contre le VRAI
 * service de cartes (I5, I7, D8)
 * ─────────────────────────────────────────────────────────────────────────────
 * #1943 L3. Le contrôleur de chat ne débite rien lui-même ; ce qu'il PEUT faire
 * coûter, c'est ce que les cartes qu'il persiste réservent. Trois points
 * d'observation par scénario — avant, pendant, après — sur la table des
 * réservations et le nombre de dispatch :
 *
 *  - I7 — un message de Laura qui propose des cartes : 0 réservation, 0 débit ;
 *  - D8 / I7 — Arrêter : 0 carte, 0 réservation, 0 dispatch, même si le service
 *    IA rend son `done` après l'annulation ;
 *  - I5 — le même tour rejoué : aucune carte de plus.
 *
 * Aucun débit n'est possible sur ces chemins (aucun service de facturation n'est
 * branché ici) : la preuve porte sur les RÉSERVATIONS — la seule écriture de
 * crédit qu'Action OS sache faire — et sur l'absence de dispatch.
 */

const WS = '7a0c2f10-0000-4000-8000-000000000002'
const USER = { userId: '9d359267-0000-4000-8000-000000000001', email: 'rep@esn.fr' } as CurrentUserPayload
const CONTACT = '11111111-1111-4111-8111-111111111111'
const TURN = '33333333-3333-4333-8333-333333333333'

const PENDING: PendingChatAction[] = [
  { action: 'enrich_contact', contact_id: CONTACT, contact_name: 'Claire Dubois', organization_name: 'ACME' },
  { action: 'prepare_mail_draft', to: 'claire@acme.example', subject: 'Suite', body: 'Bonjour Claire,' },
]

type FakeRes = Response & EventEmitter & { closeAfterFirstWrite: boolean }

function fakeRes(closeAfterFirstWrite: boolean): FakeRes {
  const emitter = new EventEmitter() as FakeRes
  let first = true
  Object.assign(emitter, {
    writableEnded: false,
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn(() => {
      if (closeAfterFirstWrite && first) {
        first = false
        emitter.emit('close')
      }
      return true
    }),
    end: jest.fn(() => {
      ;(emitter as unknown as { writableEnded: boolean }).writableEnded = true
    }),
  })
  return emitter
}

/** Le service IA : un fragment, puis — annulé ou non — le `done` avec deux propositions. */
function iaStream() {
  return jest.fn().mockImplementation(async function* (
    _input: unknown,
    opts: { signal?: AbortSignal },
  ): AsyncGenerator<ChatStreamEvent> {
    yield { type: 'delta', text: 'Je prépare' }
    yield {
      type: 'done',
      success: true,
      data: {
        reply: 'Deux actions.',
        context: { pending_actions: PENDING, aborted_seen: Boolean(opts.signal?.aborted) },
      },
    }
  })
}

function world() {
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
  workspaces.rows.push({ id: WS } as unknown as WorkspaceEntity)
  const reservationRows = inMemoryRepository<CreditReservationEntity>()
  const reservations = new CreditReservationService(reservationRows as never)
  const contacts = inMemoryRepository<{ id: string; workspace_id: string }>()
  contacts.rows.push({ id: CONTACT, workspace_id: WS })
  const dispatch = jest.fn()
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WS, role: 'owner' })),
    extraPermissionsOf: jest.fn().mockResolvedValue([]),
    isDemoWorkspace: jest.fn(async () => false),
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
    inMemoryRepository() as never,
    contacts as never,
  )
  const controller = new IaProxyController(
    { chatStream: iaStream() } as unknown as IaClient,
    {} as ChatMessagesService,
    workspaceContext as unknown as WorkspaceContextService,
    {} as EsnProfileReader,
    {
      build: jest.fn().mockResolvedValue({}),
      recordConversationTurn: jest.fn().mockResolvedValue(undefined),
    } as unknown as ChatContextService,
    {} as DiscoverPortfolioService,
    { get: () => 0 } as unknown as ConfigService,
    { list: jest.fn().mockResolvedValue([]) } as unknown as ToolRegistryService,
    // #1954 — obligatoire, en 9e position. Transparent : le fil demandé est le fil
    // lu, cette simulation prouve l'arrêt du tour et ses cartes, pas le fil.
    {
      readableThread: jest.fn(async (target: { conversationId: string | null }) => target.conversationId ?? undefined),
    } as unknown as ChatThreadDocumentsService,
    undefined,
    undefined,
    undefined,
    // Le titre des fils (#1911.1) puis la marque de l'espace (#1960.20),
    // paramètres précédents en position — absents ici.
    undefined,
    undefined,
    cards,
  )
  const chat = (closeAfterFirstWrite: boolean) =>
    controller.chat(
      USER,
      { message: 'Relance Claire', conversationId: 'conv-1', turnId: TURN } as ChatDto,
      fakeRes(closeAfterFirstWrite),
    )
  return { chat, runs, reservationRows, dispatch }
}

describe('Simulation — le tour de conversation et ses cartes (I5, I7, D8)', () => {
  it('I7 — un tour qui propose deux cartes : avant 0, après 2 cartes, 0 réservation, 0 dispatch', async () => {
    const w = world()
    expect([w.runs.rows.length, w.reservationRows.rows.length]).toEqual([0, 0])
    await w.chat(false)
    expect(w.runs.rows).toHaveLength(2)
    expect(w.reservationRows.rows).toHaveLength(0)
    expect(w.dispatch).not.toHaveBeenCalled()
  })

  it('D8 — ARRÊTER pendant le tour : même avec un `done` arrivé après, 0 carte, 0 réservation, 0 dispatch', async () => {
    const w = world()
    await w.chat(true)
    expect(w.runs.rows).toHaveLength(0)
    expect(w.reservationRows.rows).toHaveLength(0)
    expect(w.dispatch).not.toHaveBeenCalled()
  })

  it('I5 — le MÊME tour rejoué (même `turnId`) : aucune carte de plus, toujours 0 réservation', async () => {
    const w = world()
    await w.chat(false)
    await w.chat(false)
    expect(w.runs.rows).toHaveLength(2)
    expect(w.reservationRows.rows).toHaveLength(0)
  })
})
