import { EventEmitter } from 'node:events'
import { Logger } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { Response } from 'express'
import { can, workspacePermissionValues } from '@bellum/contracts'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { CopilotCardService } from '../action-os/copilot-card.service'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import type { ChatStreamEvent, IaClient } from '../ia/ia.client'
import type { ToolRegistryService } from '../tool-registry/tool-registry.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { ChatContextService } from './chat-context.service'
import type { ChatMessagesService } from './chat-messages.service'
import type { ChatThreadDocumentsService } from './chat-thread-documents.service'
import type { DiscoverPortfolioService } from './discover-portfolio.service'
import type { ChatDto, CreateChatMessageDto, ListChatMessagesDto } from './dto/ia-proxy.dto'
import { IaProxyController } from './ia-proxy.controller'

/**
 * #1943 L3 — le pont entre la conversation et les cartes d'Action OS.
 *
 * Trois promesses, chacune tenue ici par un test qui sait dire NON :
 *  1. le `done` porte le TOUR et ses CARTES — et garde `pending_actions` tel
 *     quel, pour les onglets ouverts avant le déploiement (qui ne lisent que lui) ;
 *  2. recharger un fil rend ses cartes avec leur état (D1) ;
 *  3. D8 — Arrêter : la fermeture du navigateur annule l'appel au service IA, et
 *     rien n'est proposé après.
 */

const USER = { userId: '9d359267-0000-4000-8000-000000000001', email: 'rep@esn.fr' } as CurrentUserPayload
const TURN = '33333333-3333-4333-8333-333333333333'
// #1941.5/.8 — les droits d'un `owner` (le rôle par défaut de `build()`
// ci-dessous), DÉRIVÉS de la matrice RBAC — jamais recopiés à la main.
const OWNER_PERMISSIONS = workspacePermissionValues.filter(permission => can('owner', [], permission))
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const PENDING = [
  { action: 'prepare_mail_draft', to: 'claire@acme.example', subject: 'Suite', body: 'Bonjour Claire,' },
  { action: 'schedule_reminder', contact_id: '11111111-1111-4111-8111-111111111111', at: '2026-09-14T09:00:00Z' },
]

type FakeRes = Response & EventEmitter & { writes: string[]; closed: () => void }

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
    closed: () => emitter.emit('close'),
  })
  return emitter
}

function doneOf(res: FakeRes): { success: boolean; data: Record<string, unknown> } | undefined {
  const frame = res.writes.map(chunk => JSON.parse(chunk.replace(/^data: /, ''))).find(event => event.type === 'done')
  return frame
}

function streamOf(...events: ChatStreamEvent[]) {
  return jest.fn().mockImplementation(async function* (): AsyncGenerator<ChatStreamEvent> {
    for (const event of events) yield event
  })
}

const CARD_VIEW = {
  id: 'run-1',
  state: 'prepared',
  proposalIndex: 0,
  primary: true,
  turnId: TURN,
  allowedGestures: ['confirm', 'reject', 'snooze', 'modify'],
}

function build(options: { chatStream?: jest.Mock; withCards?: boolean } = {}) {
  const ia = {
    chatStream:
      options.chatStream ??
      streamOf({
        type: 'done',
        success: true,
        data: { reply: 'Je te propose deux actions.', context: { pending_actions: PENDING } },
      }),
  }
  const chatMessages = {
    // #1953.19 — un tour qui n'a rien rendu régularise sa demande (tranché Louis 16/09).
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
  const cards = {
    proposeTurn: jest.fn().mockResolvedValue({
      cards: [CARD_VIEW],
      counts: { received: 2, droppedOverCap: 0, invalid: 0, navigation: 0, persisted: 1, reused: 0, superseded: 0 },
    }),
    listForThread: jest.fn().mockResolvedValue([CARD_VIEW]),
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
    // #1954 — obligatoire, en 9e position. Transparent : le fil demandé est le fil
    // lu, cette suite prouve les cartes du tour, pas la lisibilité du fil.
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
    options.withCards === false ? undefined : (cards as unknown as CopilotCardService),
  )
  return { controller, ia, chatMessages, chatContext, cards }
}

describe('POST /ia/chat — le `done` porte le tour et ses cartes', () => {
  afterEach(() => jest.restoreAllMocks())

  it('propose les cartes du tour AVANT le `done`, qui garde `pending_actions` et ajoute `turn_id` + `cards`', async () => {
    const { controller, cards } = build()
    const res = fakeRes()
    await controller.chat(USER, { message: 'Relance Claire', conversationId: 'conv-1' } as ChatDto, res)

    const done = doneOf(res)
    expect(done?.data['turn_id']).toMatch(UUID_RE)
    const context = done?.data['context'] as Record<string, unknown>
    // Les onglets ouverts avant le déploiement ne lisent QUE ceci : inchangé.
    expect(context['pending_actions']).toEqual(PENDING)
    expect(context['cards']).toEqual([CARD_VIEW])
    expect(cards.proposeTurn).toHaveBeenCalledWith({
      principal: { userId: USER.userId, email: USER.email, origin: 'user' },
      conversationId: 'conv-1',
      turnId: done?.data['turn_id'],
      proposals: PENDING,
    })
  })

  it('I5 — le tour fourni par le navigateur est repris tel quel : rejouer le même tour réutilise la même clé', async () => {
    const { controller, cards } = build()
    const res = fakeRes()
    await controller.chat(USER, { message: 'Relance Claire', conversationId: 'conv-1', turnId: TURN } as ChatDto, res)
    expect(doneOf(res)?.data['turn_id']).toBe(TURN)
    expect(cards.proposeTurn.mock.calls[0][0]).toMatchObject({ turnId: TURN })
  })

  it('compatibilité : sans le module de cartes, le `done` ne porte AUCUNE carte (et rien d’autre du module cartes)', async () => {
    const { controller } = build({ withCards: false })
    const res = fakeRes()
    await controller.chat(USER, { message: 'Relance Claire', conversationId: 'conv-1' } as ChatDto, res)
    expect(doneOf(res)).toEqual({
      type: 'done',
      success: true,
      data: {
        reply: 'Je te propose deux actions.',
        // #1941.5/.8 — `permissions` est ajouté par TOUT tour réussi qui porte
        // un `context`, indépendamment du module cartes : la même liste que
        // `context.permissions — les droits EFFECTIFS…` de `ia-proxy.controller.spec.ts`.
        context: { pending_actions: PENDING, permissions: OWNER_PERMISSIONS },
      },
    })
  })

  it('une réponse en ÉCHEC ne propose aucune carte', async () => {
    const chatStream = streamOf({ type: 'done', success: false, data: { reply: 'Désolé.' } })
    const { controller, cards } = build({ chatStream })
    await controller.chat(USER, { message: 'x', conversationId: 'conv-1' } as ChatDto, fakeRes())
    expect(cards.proposeTurn).not.toHaveBeenCalled()
  })

  it('une panne des cartes ne fait pas tomber le tour : le `done` part, sans `cards`, et l’erreur est journalisée', async () => {
    const { controller, cards } = build()
    cards.proposeTurn.mockRejectedValue(new Error('base indisponible'))
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    const res = fakeRes()
    await controller.chat(USER, { message: 'x', conversationId: 'conv-1' } as ChatDto, res)
    const context = doneOf(res)?.data['context'] as Record<string, unknown>
    expect(context['pending_actions']).toEqual(PENDING)
    expect(context).not.toHaveProperty('cards')
    expect(error).toHaveBeenCalled()
  })

  it('le journal dit COMBIEN de propositions ont été écartées, jamais QUOI', async () => {
    const { controller, cards } = build()
    cards.proposeTurn.mockResolvedValue({
      cards: [],
      counts: { received: 4, droppedOverCap: 1, invalid: 2, navigation: 0, persisted: 1, reused: 0, superseded: 0 },
    })
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    await controller.chat(USER, { message: 'x', conversationId: 'conv-1' } as ChatDto, fakeRes())
    const logged = JSON.stringify(warn.mock.calls)
    expect(logged).toMatch(/invalid/)
    expect(logged).toMatch(/droppedOverCap/)
    expect(logged).not.toContain('claire@acme.example')
    expect(logged).not.toContain('Bonjour Claire')
  })
})

describe('D8 — Arrêter : l’annulation du navigateur se propage au service IA', () => {
  afterEach(() => jest.restoreAllMocks())

  function abortableStream(options: { yieldDoneAfterAbort?: boolean } = {}) {
    const seen: { signal?: AbortSignal } = {}
    const chatStream = jest.fn().mockImplementation(async function* (
      _input: unknown,
      opts: { signal?: AbortSignal },
    ): AsyncGenerator<ChatStreamEvent> {
      seen.signal = opts.signal
      yield { type: 'delta', text: 'Je regarde' }
      await new Promise<void>((resolve, reject) => {
        const settle = () =>
          options.yieldDoneAfterAbort ? resolve() : reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        // Comme le vrai flux réseau : un signal DÉJÀ annulé rejette tout de suite
        // (l'évènement `abort` ne se rejoue pas pour un écouteur posé après coup).
        if (opts.signal?.aborted) {
          settle()
          return
        }
        opts.signal?.addEventListener('abort', settle)
      })
      yield { type: 'done', success: true, data: { reply: 'trop tard', context: { pending_actions: PENDING } } }
    })
    return { chatStream, seen }
  }

  it('fermer l’onglet ANNULE la requête vers le service IA — et aucune carte n’est proposée', async () => {
    const { chatStream, seen } = abortableStream()
    const { controller, cards, chatContext } = build({ chatStream })
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const res = fakeRes()
    ;(res.write as jest.Mock).mockImplementationOnce((chunk: string) => {
      res.writes.push(chunk)
      res.closed() // le navigateur s'en va juste après le premier fragment
      return true
    })

    await controller.chat(USER, { message: 'x', conversationId: 'conv-1' } as ChatDto, res)

    expect(seen.signal?.aborted).toBe(true)
    expect(cards.proposeTurn).not.toHaveBeenCalled()
    expect(chatContext.recordConversationTurn).not.toHaveBeenCalled()
    expect(res.end).toHaveBeenCalled()
  })

  it('un `done` qui arrive APRÈS l’annulation n’ouvre aucune carte', async () => {
    const { chatStream } = abortableStream({ yieldDoneAfterAbort: true })
    const { controller, cards } = build({ chatStream })
    const res = fakeRes()
    ;(res.write as jest.Mock).mockImplementationOnce((chunk: string) => {
      res.writes.push(chunk)
      res.closed()
      return true
    })
    await controller.chat(USER, { message: 'x', conversationId: 'conv-1' } as ChatDto, res)
    expect(cards.proposeTurn).not.toHaveBeenCalled()
  })

  it('n’attrape pas ce qu’il ne vise pas : la fermeture NORMALE de la réponse n’annule rien après coup', async () => {
    const seen: { signal?: AbortSignal } = {}
    const chatStream = jest.fn().mockImplementation(async function* (
      _input: unknown,
      opts: { signal?: AbortSignal },
    ): AsyncGenerator<ChatStreamEvent> {
      seen.signal = opts.signal
      yield { type: 'done', success: true, data: { reply: 'ok', context: { pending_actions: PENDING } } }
    })
    const { controller, cards } = build({ chatStream })
    const res = fakeRes()
    await controller.chat(USER, { message: 'x', conversationId: 'conv-1' } as ChatDto, res)
    res.closed() // Node émet « close » après la fin normale d'une réponse
    expect(seen.signal?.aborted).toBe(false)
    expect(cards.proposeTurn).toHaveBeenCalledTimes(1)
  })
})

describe('GET /ia/chat/messages — recharger un fil rend ses cartes (D1)', () => {
  it('chaque message porte son tour et les cartes de ce tour ; le fil porte TOUTES ses cartes', async () => {
    const { controller, chatMessages, cards } = build()
    chatMessages.listThread.mockResolvedValue([
      { id: 'm-user', role: 'user', content: 'Relance Claire' },
      { id: 'm-bot', role: 'assistant', content: 'Je te propose deux actions.' },
    ])
    chatMessages.turnIdsOf.mockResolvedValue(new Map([['m-bot', TURN]]))

    const result = await controller.listChatMessages(USER, {
      conversationId: 'conv-1',
      limit: 50,
    } as ListChatMessagesDto)

    expect(chatMessages.turnIdsOf).toHaveBeenCalledWith('ws-1', ['m-user', 'm-bot'])
    expect(cards.listForThread).toHaveBeenCalledWith(
      { userId: USER.userId, email: USER.email, origin: 'user' },
      { conversationId: 'conv-1', turnIds: [TURN] },
    )
    expect(result.messages).toEqual([
      { id: 'm-user', role: 'user', content: 'Relance Claire', turn_id: null, cards: [] },
      {
        id: 'm-bot',
        role: 'assistant',
        content: 'Je te propose deux actions.',
        turn_id: TURN,
        cards: [CARD_VIEW],
        // #2429.2 / #2429.4 — l'enveloppe additive : les MÊMES cartes de ce
        // tour, nommées `actions`, jamais une seconde lecture.
        envelope: {
          message: 'Je te propose deux actions.',
          artifacts: [],
          actions: [CARD_VIEW],
          sources: [],
        },
      },
    ])
    expect(result.cards).toEqual([CARD_VIEW])
  })

  it('compatibilité : sans le module de cartes, la lecture est celle d’avant', async () => {
    const { controller, chatMessages } = build({ withCards: false })
    chatMessages.listThread.mockResolvedValue([{ id: 'm-1', role: 'user', content: 'x' }])
    expect(
      await controller.listChatMessages(USER, { conversationId: 'conv-1', limit: 50 } as ListChatMessagesDto),
    ).toEqual({
      messages: [{ id: 'm-1', role: 'user', content: 'x' }],
    })
  })
})

describe('POST /ia/chat/messages — le message garde son tour', () => {
  it('transmet `turnId` à l’écriture (la moitié de la clé d’une carte côté fil)', async () => {
    const { controller, chatMessages } = build()
    await controller.createChatMessage(USER, {
      conversationId: 'conv-1',
      role: 'assistant',
      content: 'Je te propose deux actions.',
      turnId: TURN,
    } as CreateChatMessageDto)
    expect(chatMessages.create).toHaveBeenCalledWith(expect.objectContaining({ turnId: TURN }))
  })
})

describe('#1943.5 — une analyse lancée PENDANT le tour rejoint ce tour', () => {
  it('rattache le suivi créé par le pont, dans la limite des lancements RÉUSSIS que le tour rapporte', async () => {
    const chatStream = streamOf({
      type: 'done',
      success: true,
      data: {
        reply: 'J’ai lancé l’analyse d’ACME.',
        context: {
          actions: [
            { tool: 'start_account_analysis', input: { company: 'ACME' }, status: 'done' },
            { tool: 'start_account_analysis', input: { company: 'OGF' }, status: 'error' },
            { tool: 'compare_accounts', input: {}, status: 'done' },
          ],
        },
      },
    })
    const { controller, cards } = build({ chatStream })
    const adopt = jest.fn().mockResolvedValue(1)
    Object.assign(cards, { adoptAnalysisLaunches: adopt })
    const res = fakeRes()
    const before = Date.now()

    await controller.chat(USER, { message: 'Analyse ACME', conversationId: 'conv-1', turnId: TURN } as ChatDto, res)

    expect(adopt).toHaveBeenCalledTimes(1)
    const call = adopt.mock.calls[0]?.[0] as { since: Date }
    expect(call).toMatchObject({
      principal: { userId: USER.userId, email: USER.email, origin: 'user' },
      conversationId: 'conv-1',
      turnId: TURN,
      launchedInTurn: 1,
    })
    // Le début du TOUR (avant l'appel au service IA), avec la tolérance d'horloge base/API.
    expect(call.since.getTime()).toBeGreaterThanOrEqual(before - 5_000)
    expect(call.since.getTime()).toBeLessThanOrEqual(Date.now())
    expect(cards.proposeTurn).not.toHaveBeenCalled()
    expect(doneOf(res)?.data['turn_id']).toBe(TURN)
  })

  it('n’attrape pas ce qu’il ne vise pas : un tour sans lancement d’analyse ne rattache rien', async () => {
    const { controller, cards } = build()
    const adopt = jest.fn()
    Object.assign(cards, { adoptAnalysisLaunches: adopt })
    await controller.chat(USER, { message: 'x', conversationId: 'conv-1' } as ChatDto, fakeRes())
    expect(adopt).not.toHaveBeenCalled()
  })
})
