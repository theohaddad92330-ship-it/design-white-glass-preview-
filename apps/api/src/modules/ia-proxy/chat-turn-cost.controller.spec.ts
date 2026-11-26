import type { ConfigService } from '@nestjs/config'
import type { Response } from 'express'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { correlationStorage } from '../../correlation-id/correlation-id.store'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import type { ChatStreamEvent, IaClient } from '../ia/ia.client'
import type { ToolRegistryService } from '../tool-registry/tool-registry.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { ChatContext, ChatContextService } from './chat-context.service'
import type { ChatMessagesService } from './chat-messages.service'
import type { ChatThreadDocumentsService } from './chat-thread-documents.service'
import type { DiscoverPortfolioService } from './discover-portfolio.service'
import type { ChatDto } from './dto/ia-proxy.dto'
import { IaProxyController } from './ia-proxy.controller'

/**
 * #2448.8 / #2882.11 (épopée #2882) — « Vérifié estime coût et durée avant le
 * run » : le tour qui vient de finir devient une mesure pour le PROCHAIN, et
 * `GET ia/chat/mode-estimate` la restitue par palier.
 */

const user = { userId: 'u-1' } as CurrentUserPayload
const RECEIVED_AT = 1_000_000

function fakeRes() {
  const writes: string[] = []
  const res = {
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn((chunk: string) => {
      writes.push(chunk)
      return true
    }),
    end: jest.fn(),
  } as unknown as Response
  return { res, writes }
}

function build(opts: { data?: Record<string, unknown>; withEstimate?: boolean } = {}) {
  const ia = {
    chatStream: jest.fn().mockImplementation(async function* (): AsyncGenerator<ChatStreamEvent> {
      yield { type: 'done', success: true, data: opts.data ?? { reply: 'Bien reçu.' } }
    }),
  }
  const chatMessages = {
    releaseQuotaForUnrenderedTurn: jest.fn().mockResolvedValue(true),
    create: jest.fn().mockResolvedValue({ id: 'm-new' }),
    listThread: jest.fn().mockResolvedValue([]),
    markPrecisionRequest: jest.fn(),
  }
  const ctx: ChatContext = {
    accountData: null,
    contactsSummary: null,
    planSummary: null,
    accountsSummary: null,
    profileData: {},
    pinnedFacts: [],
    pinnedFactIds: [],
    userPreferences: {},
    conversationSummary: null,
    crmConnected: false,
    crmProvider: null,
    crmPresence: null,
    accountFeedback: null,
    toolsSummary: null,
    firstName: null,
    timezone: null,
  }
  const chatContext = {
    build: jest.fn().mockResolvedValue(ctx),
    recordConversationTurn: jest.fn().mockResolvedValue(undefined),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'member' }),
    extraPermissionsOf: jest.fn().mockResolvedValue([]),
    isDemoWorkspace: jest.fn().mockResolvedValue(false),
  }
  const chatTurnCosts = { record: jest.fn().mockResolvedValue(undefined), estimate: jest.fn() }
  const controller = new IaProxyController(
    ia as unknown as IaClient,
    chatMessages as unknown as ChatMessagesService,
    workspaceContext as unknown as WorkspaceContextService,
    {} as unknown as EsnProfileReader,
    chatContext as unknown as ChatContextService,
    {} as unknown as DiscoverPortfolioService,
    { get: () => 0 } as unknown as ConfigService,
    { list: jest.fn().mockResolvedValue([]) } as unknown as ToolRegistryService,
    { readableThread: jest.fn(async () => null), deleteForThread: jest.fn() } as unknown as ChatThreadDocumentsService,
    undefined, // providerCosts
    undefined, // marketMemory
    undefined, // accountsService
    undefined, // threadTitles
    undefined, // brands
    undefined, // cards
    undefined, // consultants
    undefined, // openNeeds
    undefined, // planFeatures
    undefined, // replyMemoryUses
    undefined, // replyFeedback
    undefined, // unroutedIntents
    undefined, // storage
    undefined, // missions
    undefined, // threadExport
    undefined, // contacts
    undefined, // projects
    undefined, // businessUnits
    undefined, // discoverMarketMemory
    undefined, // notifications
    undefined, // conversations
    undefined, // lauraJobs
    undefined, // lauraMode
    undefined, // triggers
    undefined, // messageStyle
    opts.withEstimate === false ? undefined : (chatTurnCosts as never),
  )
  return { controller, chatTurnCosts }
}

const chatDto = { message: 'hi', conversationId: 'general' } as ChatDto

/** `receivedAt` (#2442.4) n'existe que dans une VRAIE requête HTTP — posé ici comme `correlationIdMiddleware` le fait. */
function withHttpContext<T>(fn: () => Promise<T>): Promise<T> {
  return correlationStorage.run({ correlationId: 'c-1', receivedAt: RECEIVED_AT }, fn)
}

describe('POST /ia/chat — la mesure durée/coût par palier, pour le PROCHAIN tour', () => {
  it('écrit une mesure quand le service IA a renvoyé un palier', async () => {
    const { controller, chatTurnCosts } = build({
      data: { reply: 'Ok.', context: { mode_explanation: { tier: 'deep', text: 'approfondi' } } },
    })
    const { res } = fakeRes()

    await withHttpContext(() => controller.chat(user, chatDto, res))

    expect(chatTurnCosts.record).toHaveBeenCalledTimes(1)
    const [tier, durationMs, costUsd] = chatTurnCosts.record.mock.calls[0] as [string, number, number | null]
    expect(tier).toBe('deep')
    expect(durationMs).toBeGreaterThanOrEqual(0)
    expect(costUsd).toBe(0)
  })

  it('NON — aucun palier renvoyé (mode auto non forcé) : rien n’est écrit', async () => {
    const { controller, chatTurnCosts } = build({ data: { reply: 'Ok.' } })
    const { res } = fakeRes()

    await withHttpContext(() => controller.chat(user, chatDto, res))

    expect(chatTurnCosts.record).not.toHaveBeenCalled()
  })

  it('NON — hors d’une vraie requête HTTP (`receivedAt` absent) : rien n’est écrit', async () => {
    const { controller, chatTurnCosts } = build({
      data: { reply: 'Ok.', context: { mode_explanation: { tier: 'deep' } } },
    })
    const { res } = fakeRes()

    await controller.chat(user, chatDto, res)

    expect(chatTurnCosts.record).not.toHaveBeenCalled()
  })

  it('NON — sans le service (`@Optional()`), le chat répond comme avant', async () => {
    const { controller } = build({
      data: { reply: 'Ok.', context: { mode_explanation: { tier: 'fast' } } },
      withEstimate: false,
    })
    const { res, writes } = fakeRes()

    await expect(withHttpContext(() => controller.chat(user, chatDto, res))).resolves.toBeUndefined()
    expect(writes.some(chunk => chunk.includes('"type":"done"'))).toBe(true)
  })
})

describe('GET ia/chat/mode-estimate — l’estimation lue AVANT de lancer un tour', () => {
  it('rend l’estimation du palier demandé', async () => {
    const { controller, chatTurnCosts } = build()
    chatTurnCosts.estimate.mockResolvedValue({
      tier: 'deep',
      durationMs: 8_000,
      sampleSize: 12,
      cost: { measured: true, avgCostUsd: 0.03 },
    })

    const { estimate } = await controller.getChatModeEstimate('deep')

    expect(chatTurnCosts.estimate).toHaveBeenCalledWith('deep')
    expect(estimate).toMatchObject({ tier: 'deep', durationMs: 8_000 })
  })

  it('rend null sur un palier invalide — jamais un chiffre deviné', async () => {
    const { controller, chatTurnCosts } = build()

    const { estimate } = await controller.getChatModeEstimate('ultra')

    expect(estimate).toBeNull()
    expect(chatTurnCosts.estimate).not.toHaveBeenCalled()
  })

  it('rend null sans le service (`@Optional()`)', async () => {
    const { controller } = build({ withEstimate: false })

    const { estimate } = await controller.getChatModeEstimate('deep')

    expect(estimate).toBeNull()
  })
})
