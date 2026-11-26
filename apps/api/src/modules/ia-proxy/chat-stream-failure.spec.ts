import { EventEmitter } from 'node:events'
import { Logger } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { Response } from 'express'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
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
 * #3493 — « Désolé, une erreur est survenue côté assistant » sur ~1 tour sur 3 en
 * prod. Cette phrase est CELLE DE L'API (`STREAM_FAILURE_REPLY`) : elle sortait de
 * deux chemins, dont un qui jetait une BONNE réponse quand un habillage postérieur
 * levait. Chaque chemin est ici rejoué.
 */

const USER = { userId: '9d359267-0000-4000-8000-000000000001', email: 'rep@esn.fr' } as CurrentUserPayload

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

function doneFrames(res: FakeRes): Array<{ success: boolean; data: { reply?: string } }> {
  return res.writes.map(chunk => JSON.parse(chunk.replace(/^data: /, ''))).filter(event => event.type === 'done')
}

function build(stream: () => AsyncGenerator<ChatStreamEvent>) {
  const ia = { chatStream: jest.fn().mockImplementation(stream) }
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
  )
  return { controller, chatMessages }
}

const DTO = { message: 'Donne-moi ton avis… plusieurs choses me gênent', conversationId: 'conv-1' } as ChatDto

describe('POST /ia/chat — une panne ne jette pas une bonne réponse (#3493)', () => {
  it('un habillage qui lève rend la réponse nue, pas « erreur côté assistant »', async () => {
    // Le contexte ne lève qu'à sa PREMIÈRE lecture (l'habillage) ; la réponse nue se relit ensuite.
    let reads = 0
    const context = {
      get boom(): number {
        if (reads++ === 0) throw new Error('habillage cassé')
        return 1
      },
    }
    const { controller } = build(async function* () {
      yield { type: 'done', success: true, data: { reply: 'Voici mon avis.', context } } as unknown as ChatStreamEvent
    })
    const res = fakeRes()
    await controller.chat(USER, DTO, res)
    const frames = doneFrames(res)
    expect(frames).toHaveLength(1)
    expect(frames[0]?.success).toBe(true)
    expect(frames[0]?.data.reply).toBe('Voici mon avis.')
  })

  it('un flux coupé en cours rend UN done honnête (phrase d’échec)', async () => {
    const { controller } = build(async function* () {
      yield { type: 'delta', text: 'Voici' } as ChatStreamEvent
      throw new Error('idle timeout')
    })
    const res = fakeRes()
    await controller.chat(USER, DTO, res)
    const frames = doneFrames(res)
    expect(frames).toHaveLength(1)
    expect(frames[0]?.success).toBe(false)
    expect(frames[0]?.data.reply).toContain('erreur est survenue côté assistant')
  })

  it('#3506.1 — le journal nomme le TYPE de l’erreur, jamais le corps du message', async () => {
    const spy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    try {
      const { controller } = build(async function* () {
        yield { type: 'delta', text: 'Voici' } as ChatStreamEvent
        throw new TypeError('idle timeout')
      })
      await controller.chat(USER, DTO, fakeRes())
      const logged = spy.mock.calls
        .map(call => String(call[0]))
        .find(line => line.startsWith('Flux de chat interrompu'))
      expect(logged).toBeDefined()
      expect(logged).toContain('TypeError')
      expect(logged).not.toContain(DTO.message)
    } finally {
      spy.mockRestore()
    }
  })

  it('un flux qui casse APRÈS le done ne l’écrase pas par une erreur', async () => {
    const { controller } = build(async function* () {
      yield { type: 'done', success: true, data: { reply: 'Réponse complète.' } } as ChatStreamEvent
      throw new Error('connexion fermée après coup')
    })
    const res = fakeRes()
    await controller.chat(USER, DTO, res)
    const frames = doneFrames(res)
    expect(frames).toHaveLength(1)
    expect(frames[0]?.data.reply).toBe('Réponse complète.')
  })

  it('un flux fini sans done rend l’échec nommé (le silence n’est pas un succès)', async () => {
    const { controller } = build(async function* () {
      yield { type: 'delta', text: 'Voici' } as ChatStreamEvent
    })
    const res = fakeRes()
    await controller.chat(USER, DTO, res)
    expect(doneFrames(res)[0]?.success).toBe(false)
  })

  /**
   * #4540 — le journal NOMME la cause, par un marqueur distinct (jamais noyé dans un échec générique) ;
   * le navigateur reçoit un marqueur lisible par machine pour proposer de relancer la MÊME question ;
   * et la régularisation du plafond reçoit l'instant de départ du tour (garde #2650.2).
   */
  describe('#4540 — la cause est nommée, le tour échoué est régularisé', () => {
    const markers = (spy: jest.SpyInstance) => spy.mock.calls.map(call => String(call[0]))

    it('un flux coupé : marqueur chat_stream_failed:stream_interrupted + marqueur côté navigateur', async () => {
      const spy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
      try {
        const { controller } = build(async function* () {
          yield* []
          throw new Error('connexion refusée')
        })
        const res = fakeRes()
        await controller.chat(USER, DTO, res)
        expect(markers(spy).some(line => line.includes('chat_stream_failed:stream_interrupted'))).toBe(true)
        expect(doneFrames(res)[0]?.data).toMatchObject({ failure: 'assistant_stream' })
      } finally {
        spy.mockRestore()
      }
    })

    it('SAIT DIRE NON : un flux fini sans done n’est plus silencieux — marqueur chat_stream_failed:no_terminal_event', async () => {
      const spy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
      try {
        const { controller } = build(async function* () {
          yield { type: 'delta', text: 'Voici' } as ChatStreamEvent
        })
        const res = fakeRes()
        await controller.chat(USER, DTO, res)
        expect(markers(spy).some(line => line.includes('chat_stream_failed:no_terminal_event'))).toBe(true)
        expect(doneFrames(res)[0]?.data).toMatchObject({ failure: 'assistant_stream' })
      } finally {
        spy.mockRestore()
      }
    })

    it('la régularisation du plafond reçoit l’instant de départ du tour', async () => {
      const { controller, chatMessages } = build(async function* () {
        yield* []
        throw new Error('connexion refusée')
      })
      await controller.chat(USER, DTO, fakeRes())
      expect(chatMessages.releaseQuotaForUnrenderedTurn).toHaveBeenCalledWith(
        expect.objectContaining({ turnStartedAt: expect.any(Date) }),
      )
    })

    it('TÉMOIN — une bonne réponse ne porte aucun marqueur d’échec', async () => {
      const { controller } = build(async function* () {
        yield { type: 'done', success: true, data: { reply: 'Voici.' } } as ChatStreamEvent
      })
      const res = fakeRes()
      await controller.chat(USER, DTO, res)
      expect(doneFrames(res)[0]?.data).not.toHaveProperty('failure')
    })
  })
})
