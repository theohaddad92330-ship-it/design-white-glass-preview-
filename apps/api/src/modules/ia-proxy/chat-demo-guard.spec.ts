import { EventEmitter } from 'node:events'
import { BadRequestException } from '@nestjs/common'
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
import type { ChatDto } from './dto/ia-proxy.dto'
import { IaProxyController } from './ia-proxy.controller'

/**
 * #1942.2 / #1942.12 — LA SALLE DE DÉMONSTRATION N'APPELLE AUCUN MODÈLE, MÊME
 * PAR `POST /ia/chat`.
 *
 * Sept endroits de ce contrôleur tenaient déjà la promesse (`discover/registry`,
 * `discover/signals`, le plafond quotidien, le titre des fils, la trace des
 * demandes non routées, `chat/voice/status` et `chat/voice/transcribe`) ; le
 * TOUR de conversation, lui, ne la tenait pas.
 * La bulle flottante de Laura est montée GLOBALEMENT (`routes/__root.tsx`),
 * donc elle est ouverte dans la salle publique : chaque message y déclenchait
 * un appel de modèle facturé sur un espace que personne ne surveille — l'écran
 * `/chat`, lui, basculait bien sur son moteur préparé.
 *
 * La garde est SERVEUR parce que le navigateur se contourne : le chemin client
 * (`LauraDock`) évite l'appel, celui-ci le REFUSE.
 *
 * Ce que cette suite sait dire :
 *  · NON — en démonstration, aucun appel au service IA, et le refus part en
 *    statut HTTP ordinaire (aucun en-tête SSE posé) ;
 *  · et pas plus — hors démonstration, le tour part exactement comme avant.
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

function build(options: { demo: boolean }) {
  const ia = {
    chatStream: jest.fn().mockImplementation(async function* (): AsyncGenerator<ChatStreamEvent> {
      yield { type: 'done', success: true, data: { reply: 'Voilà ce que je vois.' } }
    }),
  }
  const chatMessages = {
    listThread: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'm-1' }),
    turnIdsOf: jest.fn().mockResolvedValue(new Map()),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
    extraPermissionsOf: jest.fn().mockResolvedValue([]),
    isDemoWorkspace: jest.fn().mockResolvedValue(options.demo),
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
  )
  return { controller, ia, chatContext, workspaceContext }
}

const DTO = { message: 'Où en est mon portefeuille ?', conversationId: 'bubble-1' } as ChatDto

describe('POST /ia/chat — la salle de démonstration', () => {
  it('REFUSE le tour sans appeler le service IA, et avant tout en-tête de flux', async () => {
    const { controller, ia, chatContext } = build({ demo: true })
    const res = fakeRes()

    await expect(controller.chat(USER, DTO, res)).rejects.toBeInstanceOf(BadRequestException)

    // La promesse qui compte : aucun appel de modèle facturé.
    expect(ia.chatStream).not.toHaveBeenCalled()
    // Refusé AVANT le contexte serveur : rien n'a été assemblé pour rien.
    expect(chatContext.build).not.toHaveBeenCalled()
    // Et avant les en-têtes SSE — sinon le refus ne pourrait plus être un
    // statut HTTP, il devrait voyager dans le flux (voir « LOT STREAM » dans le
    // contrôleur). Aucun octet n'est écrit non plus.
    expect(res.setHeader).not.toHaveBeenCalled()
    expect(res.writes).toEqual([])
  })

  it('la phrase du refus dit que les réponses sont préparées, sans nommer de fournisseur', async () => {
    const { controller } = build({ demo: true })
    const error = await controller.chat(USER, DTO, fakeRes()).catch((caught: unknown) => caught)
    const message = (error as BadRequestException).message
    expect(message).toContain('démonstration')
    expect(message).toMatch(/préparé/i)
  })

  it('hors démonstration, rien ne change : le tour part et son `done` arrive', async () => {
    const { controller, ia, chatContext } = build({ demo: false })
    const res = fakeRes()

    await controller.chat(USER, DTO, res)

    expect(ia.chatStream).toHaveBeenCalledTimes(1)
    expect(chatContext.build).toHaveBeenCalledTimes(1)
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream')
    const done = res.writes
      .map(chunk => JSON.parse(chunk.replace(/^data: /, '')) as { type?: string; data?: { reply?: string } })
      .find(event => event.type === 'done')
    expect(done?.data?.reply).toBe('Voilà ce que je vois.')
  })
})
