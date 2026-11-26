import { EventEmitter } from 'node:events'
import type { ConfigService } from '@nestjs/config'
import type { Response } from 'express'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { LauraJobService } from '../action-os/laura-job.service'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import type { ChatStreamEvent, IaClient } from '../ia/ia.client'
import type { ToolRegistryService } from '../tool-registry/tool-registry.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { ChatContextService } from './chat-context.service'
import type { ChatMessagesService } from './chat-messages.service'
import type { ChatThreadDocumentsService } from './chat-thread-documents.service'
import type { DiscoverPortfolioService } from './discover-portfolio.service'
import type { ChatDto, ListChatMessagesDto } from './dto/ia-proxy.dto'
import { IaProxyController } from './ia-proxy.controller'

/**
 * #2276.1 / #2276.2 — la fin d'un tour transforme la fiche de job posée par le
 * service IA (`context.laura_job`, BRUTE) en job persistant, et c'est la VUE du
 * job qui part au navigateur — jamais la fiche brute.
 */

const USER = { userId: '9d359267-0000-4000-8000-000000000001', email: 'rep@esn.fr' } as CurrentUserPayload
const RAW_JOB = { originalRequest: 'Analyse les 20 filiales de Thales', steps: [] }
const JOB_VIEW = { id: 'job-1', state: 'to_confirm' }

type FakeRes = Response & EventEmitter & { writes: string[] }

function fakeRes(): FakeRes {
  const emitter = new EventEmitter() as FakeRes
  const writes: string[] = []
  Object.assign(emitter, {
    writes,
    writableEnded: false,
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn((chunk: string) => {
      writes.push(chunk)
      return true
    }),
    end: jest.fn(() => {
      ;(emitter as unknown as { writableEnded: boolean }).writableEnded = true
    }),
  })
  return emitter
}

function doneContext(res: FakeRes): Record<string, unknown> | undefined {
  const frame = res.writes.map(chunk => JSON.parse(chunk.replace(/^data: /, ''))).find(event => event.type === 'done')
  return frame?.data?.context
}

function build(options: { withJobs?: boolean; outcome?: string; job?: unknown; success?: boolean } = {}) {
  const ia = {
    chatStream: jest.fn().mockImplementation(async function* (): AsyncGenerator<ChatStreamEvent> {
      yield {
        type: 'done',
        success: options.success ?? true,
        data: { reply: 'Voici le plan du job.', context: { laura_job: RAW_JOB } },
      } as ChatStreamEvent
    }),
  }
  const chatMessages = {
    releaseQuotaForUnrenderedTurn: jest.fn().mockResolvedValue(true),
    listThread: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'm-1' }),
    turnIdsOf: jest.fn().mockResolvedValue(new Map()),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
    extraPermissionsOf: jest.fn().mockResolvedValue([]),
    isDemoWorkspace: jest.fn().mockResolvedValue(false),
  }
  const chatContext = {
    build: jest.fn().mockResolvedValue({}),
    recordConversationTurn: jest.fn().mockResolvedValue(undefined),
  }
  const lauraJobs = {
    proposeFromTurn: jest.fn().mockResolvedValue({
      outcome: options.outcome ?? 'persisted',
      job: options.job === undefined ? JOB_VIEW : options.job,
    }),
    listForThread: jest.fn().mockResolvedValue([]),
  }
  const controller = new IaProxyController(
    ia as unknown as IaClient,
    chatMessages as unknown as ChatMessagesService,
    workspaceContext as unknown as WorkspaceContextService,
    { resolveProfileData: jest.fn() } as unknown as EsnProfileReader,
    chatContext as unknown as ChatContextService,
    {} as DiscoverPortfolioService,
    { get: () => 0 } as unknown as ConfigService,
    { list: jest.fn().mockResolvedValue([]) } as unknown as ToolRegistryService,
    {
      readableThread: jest.fn(async (target: { conversationId: string | null }) => target.conversationId ?? undefined),
    } as unknown as ChatThreadDocumentsService,
    // Les 21 optionnels entre le 9e paramètre et le job (#2276, EN FIN) — absents ici.
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    options.withJobs === false ? undefined : (lauraJobs as unknown as LauraJobService),
  )
  return { controller, lauraJobs, chatMessages }
}

describe('POST /ia/chat — la demande complexe devient un job (#2276.1)', () => {
  it('persiste la fiche du tour et rend la VUE du job, pas la fiche brute', async () => {
    const { controller, lauraJobs } = build()
    const res = fakeRes()
    await controller.chat(USER, { message: 'Analyse les 20 filiales', conversationId: 'conv-1' } as ChatDto, res)

    expect(lauraJobs.proposeFromTurn).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-1', raw: RAW_JOB }),
    )
    expect(doneContext(res)?.['laura_job']).toEqual(JOB_VIEW)
  })

  it('une fiche invalide n’atteint jamais le navigateur', async () => {
    const { controller } = build({ outcome: 'invalid', job: null })
    const res = fakeRes()
    await controller.chat(USER, { message: 'x', conversationId: 'conv-1' } as ChatDto, res)
    expect(doneContext(res)).not.toHaveProperty('laura_job')
  })

  it('sans le service, la fiche brute est retirée — jamais relayée', async () => {
    const { controller } = build({ withJobs: false })
    const res = fakeRes()
    await controller.chat(USER, { message: 'x', conversationId: 'conv-1' } as ChatDto, res)
    expect(doneContext(res)).not.toHaveProperty('laura_job')
  })

  it('une réponse en échec n’ouvre aucun job', async () => {
    const { controller, lauraJobs } = build({ success: false })
    await controller.chat(USER, { message: 'x', conversationId: 'conv-1' } as ChatDto, fakeRes())
    expect(lauraJobs.proposeFromTurn).not.toHaveBeenCalled()
  })

  it('une panne du service ne fait pas tomber le tour, et la fiche brute ne part pas', async () => {
    const { controller, lauraJobs } = build()
    lauraJobs.proposeFromTurn.mockRejectedValue(new Error('base indisponible'))
    const res = fakeRes()
    await controller.chat(USER, { message: 'x', conversationId: 'conv-1' } as ChatDto, res)
    expect(doneContext(res)).toBeDefined()
    expect(doneContext(res)).not.toHaveProperty('laura_job')
  })
})

describe('GET /ia/chat/messages — le job revient dans le fil au rechargement (#2276.62)', () => {
  const TURN = '33333333-3333-4333-8333-333333333331'
  const DONE_JOB = { id: 'job-1', state: 'done', turnId: TURN, conversationId: 'conv-1' }
  const messages = [
    { id: 'm-user', role: 'user', content: 'Analyse les 20 filiales' },
    { id: 'm-bot', role: 'assistant', content: 'Voici le plan du job.' },
  ]

  it('la réponse du tour porte la VUE ACTUELLE de son job (état relu, pas celui du tour)', async () => {
    const { controller, lauraJobs, chatMessages } = build()
    chatMessages.listThread.mockResolvedValue(messages)
    chatMessages.turnIdsOf.mockResolvedValue(new Map([['m-bot', TURN]]))
    lauraJobs.listForThread.mockResolvedValue([DONE_JOB])

    const result = await controller.listChatMessages(USER, {
      conversationId: 'conv-1',
      limit: 50,
    } as ListChatMessagesDto)

    expect(lauraJobs.listForThread).toHaveBeenCalledWith(expect.objectContaining({ userId: USER.userId }), {
      conversationId: 'conv-1',
      turnIds: [TURN],
    })
    const bot = result.messages.find(message => message.id === 'm-bot') as Record<string, unknown>
    expect(bot['laura_job']).toEqual(DONE_JOB)
    const user = result.messages.find(message => message.id === 'm-user') as Record<string, unknown>
    expect(user).not.toHaveProperty('laura_job')
  })

  it('NON — un message dont le tour n’a pas de job n’en reçoit aucun', async () => {
    const { controller, lauraJobs, chatMessages } = build()
    chatMessages.listThread.mockResolvedValue(messages)
    chatMessages.turnIdsOf.mockResolvedValue(new Map([['m-bot', '44444444-4444-4444-8444-444444444444']]))
    lauraJobs.listForThread.mockResolvedValue([DONE_JOB])

    const result = await controller.listChatMessages(USER, {
      conversationId: 'conv-1',
      limit: 50,
    } as ListChatMessagesDto)
    expect(result.messages.some(message => 'laura_job' in message)).toBe(false)
  })

  it('une panne de lecture des jobs ne fait pas tomber le fil', async () => {
    const { controller, lauraJobs, chatMessages } = build()
    chatMessages.listThread.mockResolvedValue(messages)
    chatMessages.turnIdsOf.mockResolvedValue(new Map([['m-bot', TURN]]))
    lauraJobs.listForThread.mockRejectedValue(new Error('db down'))

    const result = await controller.listChatMessages(USER, {
      conversationId: 'conv-1',
      limit: 50,
    } as ListChatMessagesDto)
    expect(result.messages).toHaveLength(2)
  })
})
