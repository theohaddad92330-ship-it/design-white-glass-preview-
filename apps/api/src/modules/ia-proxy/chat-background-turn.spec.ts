import { EventEmitter } from 'node:events'
import type { ConfigService } from '@nestjs/config'
import type { Response } from 'express'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { ChatTurnRegistry } from '../chat-turns/chat-turn-registry'
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
 * #4967 (lot L6) — LA RECHERCHE DE LAURA VIT CÔTÉ SERVEUR.
 *
 * Un tour lancé « en arrière-plan » (`background: true`, l'écran `/chat`) ne meurt plus quand le
 * navigateur s'en va : il va au bout, et c'est le SERVEUR qui écrit la réponse dans le fil (le
 * navigateur parti ne l'écrira plus). Seul « Arrêter » (le registre) l'abolit. Sans le drapeau
 * (la bulle, un client d'avant), D8 tient : la fermeture annule.
 */

const WS = '7a0c2f10-0000-4000-8000-000000000002'
const USER = { userId: '9d359267-0000-4000-8000-000000000001', email: 'rep@esn.fr' } as CurrentUserPayload
const TURN = '33333333-3333-4333-8333-333333333333'

type FakeRes = Response & EventEmitter

function fakeRes(): FakeRes {
  const emitter = new EventEmitter() as FakeRes
  Object.assign(emitter, {
    writableEnded: false,
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn(() => true),
    end: jest.fn(() => {
      ;(emitter as unknown as { writableEnded: boolean }).writableEnded = true
    }),
  })
  return emitter
}

function world() {
  let release: () => void = () => undefined
  const gate = new Promise<void>(resolve => (release = resolve))
  const seen: { aborted: boolean } = { aborted: false }
  const chatStream = jest.fn().mockImplementation(async function* (
    _input: unknown,
    opts: { signal?: AbortSignal },
  ): AsyncGenerator<ChatStreamEvent> {
    yield { type: 'delta', text: 'Je cherche' }
    await gate
    seen.aborted = Boolean(opts.signal?.aborted)
    if (opts.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
    yield { type: 'done', success: true, data: { reply: 'Trois décideurs trouvés.', turn_id: TURN } }
  })
  const messages = {
    create: jest.fn().mockResolvedValue({ id: 'm-1' }),
    releaseQuotaForUnrenderedTurn: jest.fn().mockResolvedValue(undefined),
    markPrecisionRequest: jest.fn().mockResolvedValue(undefined),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WS, role: 'owner' })),
    extraPermissionsOf: jest.fn().mockResolvedValue([]),
    isDemoWorkspace: jest.fn(async () => false),
  }
  const controller = new IaProxyController(
    { chatStream } as unknown as IaClient,
    messages as unknown as ChatMessagesService,
    workspaceContext as unknown as WorkspaceContextService,
    {} as EsnProfileReader,
    {
      build: jest.fn().mockResolvedValue({}),
      recordConversationTurn: jest.fn().mockResolvedValue(undefined),
    } as unknown as ChatContextService,
    {} as DiscoverPortfolioService,
    { get: () => 0 } as unknown as ConfigService,
    { list: jest.fn().mockResolvedValue([]) } as unknown as ToolRegistryService,
    {
      readableThread: jest.fn(async (target: { conversationId: string | null }) => target.conversationId ?? undefined),
    } as unknown as ChatThreadDocumentsService,
  )
  const registry = new ChatTurnRegistry()
  ;(controller as unknown as Record<string, unknown>).turnRegistry = registry
  const run = (dto: Partial<ChatDto>) => {
    const res = fakeRes()
    const done = controller.chat(
      USER,
      { message: 'Trouve les décideurs', conversationId: 'conv-1', turnId: TURN, ...dto } as ChatDto,
      res,
    )
    return { res, done }
  }
  /** Laisse le tour atteindre l'attente du flux (tout ce qui précède est asynchrone). */
  const settle = async () => {
    for (let i = 0; i < 20; i += 1) await new Promise(resolve => setImmediate(resolve))
  }
  return { run, release: () => release(), seen, messages, registry, settle }
}

const assistantWrites = (messages: { create: jest.Mock }) =>
  messages.create.mock.calls.filter(([args]) => (args as { role: string }).role === 'assistant')

describe('#4967 — la recherche de Laura survit au départ du navigateur', () => {
  it('le navigateur s’en va : le tour N’EST PAS annulé et le SERVEUR écrit la réponse dans le fil', async () => {
    const w = world()
    const { res, done } = w.run({ background: true })
    await w.settle()
    expect(w.registry.running(USER.userId, 'conv-1')).toHaveLength(1)
    res.emit('close')
    w.release()
    await done
    expect(w.seen.aborted).toBe(false)
    expect(assistantWrites(w.messages)).toHaveLength(1)
    expect(assistantWrites(w.messages)[0]![0]).toMatchObject({
      userId: USER.userId,
      workspaceId: WS,
      conversationId: 'conv-1',
      role: 'assistant',
      content: 'Trois décideurs trouvés.',
      turnId: TURN,
    })
    // Écrite AVANT de quitter le registre : l'écran qui relit voit la réponse dès qu'il n'est plus « en cours ».
    expect(w.registry.running(USER.userId, 'conv-1')).toEqual([])
  })

  it('le navigateur reste : c’est lui qui écrit la réponse (jamais deux fois)', async () => {
    const w = world()
    const { done } = w.run({ background: true })
    await w.settle()
    w.release()
    await done
    expect(assistantWrites(w.messages)).toHaveLength(0)
    expect(w.registry.running(USER.userId)).toEqual([])
  })

  it('« Arrêter » (le registre) abolit le tour même navigateur parti — rien n’est écrit', async () => {
    const w = world()
    const { res, done } = w.run({ background: true })
    await w.settle()
    res.emit('close')
    expect(w.registry.stop(USER.userId, TURN)).toBe(true)
    w.release()
    await done
    expect(w.seen.aborted).toBe(true)
    expect(assistantWrites(w.messages)).toHaveLength(0)
    expect(w.registry.running(USER.userId)).toEqual([])
  })

  it('D8 tient sans le drapeau : la fermeture annule le tour, rien n’est écrit', async () => {
    const w = world()
    const { res, done } = w.run({})
    await w.settle()
    res.emit('close')
    w.release()
    await done
    expect(w.seen.aborted).toBe(true)
    expect(assistantWrites(w.messages)).toHaveLength(0)
  })
})
