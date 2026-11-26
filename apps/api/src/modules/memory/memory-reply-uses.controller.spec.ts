import { ServiceUnavailableException } from '@nestjs/common'
import type { MemoryConsultations, MemoryLedger, ReplyMemoryUses } from '@bellum/contracts'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WORKSPACE_READ_KEY } from '../../common/decorator/workspace-read.decorator'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { MemoryController } from './memory.controller'
import type { MemoryReplyUsesService } from './memory-reply-uses.service'
import type { MemoryService } from './memory.service'

/**
 * #1916.18 / #1916.24 — les deux lectures de la trace, et « Tout oublier ».
 *
 *  · sous une réponse : `GET /memory/reply-uses/:messageId`, lue à l'ouverture
 *    du panneau, bornée à l'espace et au lecteur ;
 *  · dans Réglages › Mémoire : « consulté dans N réponses » sur chaque élément ;
 *  · « Tout oublier » emporte les traces de la personne — et le dit s'il n'y
 *    parvient pas.
 */

const user = { userId: 'u-1' } as CurrentUserPayload

const ledger: MemoryLedger = {
  entries: [
    {
      id: 'f-1',
      layer: 'facts',
      text: 'Budget voté',
      recordedAt: '2026-09-10T09:00:00.000Z',
      accountId: null,
      detail: null,
      expiresAt: null,
      scope: 'workspace',
    },
    {
      id: 'tone',
      layer: 'preferences',
      text: 'direct',
      recordedAt: '2026-09-10T09:00:00.000Z',
      accountId: null,
      detail: 'tone',
      expiresAt: null,
    },
  ],
  unreadableLayers: [],
}

function build(opts: { withTrace?: boolean } = {}) {
  const order: string[] = []
  const memory = {
    readLedger: jest.fn().mockResolvedValue(ledger),
    forgetAll: jest.fn().mockImplementation(async () => {
      order.push('forgetAll')
      return { forgotten: 4, failedLayers: [] }
    }),
  }
  const consultation: MemoryConsultations = {
    replies: 2,
    lastAt: '2026-09-12T10:00:00.000Z',
    lastConversation: { accountId: null, conversationId: 'general' },
  }
  const read: ReplyMemoryUses = { consulted: [], privateCount: 1, removedCount: 0 }
  const replyUses = {
    readForMessage: jest.fn().mockResolvedValue(read),
    consultationsFor: jest.fn().mockResolvedValue(new Map([['f-1', consultation]])),
    forgetForUser: jest.fn().mockImplementation(async () => {
      order.push('forgetTraces')
    }),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'member' }),
  }
  const controller = new MemoryController(
    memory as unknown as MemoryService,
    workspaceContext as unknown as WorkspaceContextService,
    opts.withTrace === false ? undefined : (replyUses as unknown as MemoryReplyUsesService),
  )
  return { controller, memory, replyUses, order, consultation, read }
}

describe('GET /memory/reply-uses/:messageId — sous une réponse', () => {
  it('lit la trace du message, bornée à l’espace ACTIF et au lecteur du jeton', async () => {
    const { controller, replyUses, read } = build()
    expect(await controller.readReplyUses(user, 'm-1')).toEqual(read)
    expect(replyUses.readForMessage).toHaveBeenCalledWith({ messageId: 'm-1', workspaceId: 'ws-1', viewerId: 'u-1' })
  })

  it('est une lecture d’espace déclarée (`@WorkspaceRead`)', () => {
    expect(Reflect.getMetadata(WORKSPACE_READ_KEY, MemoryController.prototype.readReplyUses)).toBe(true)
  })

  it('sans le service, un 503 — jamais une liste vide qui dirait « aucun élément »', async () => {
    const { controller } = build({ withTrace: false })
    await expect(controller.readReplyUses(user, 'm-1')).rejects.toBeInstanceOf(ServiceUnavailableException)
  })
})

describe('GET /memory/ledger — « consulté dans N réponses » sur chaque élément', () => {
  it('ajoute les consultations aux lignes de faits seulement, pour le lecteur du jeton', async () => {
    const { controller, replyUses, consultation } = build()
    const read = await controller.readLedger(user)
    expect(replyUses.consultationsFor).toHaveBeenCalledWith({ workspaceId: 'ws-1', viewerId: 'u-1', factIds: ['f-1'] })
    expect(read.entries[0]).toMatchObject({ id: 'f-1', consultations: consultation })
    expect(read.entries[1]).not.toHaveProperty('consultations')
  })

  it('une lecture de trace ratée n’est pas « jamais consulté » : le champ reste ABSENT', async () => {
    const { controller, replyUses } = build()
    replyUses.consultationsFor.mockRejectedValueOnce(new Error('db down'))
    const read = await controller.readLedger(user)
    expect(read.entries).toEqual(ledger.entries)
    expect(read.entries[0]).not.toHaveProperty('consultations')
  })
})

describe('DELETE /memory/ledger — « Tout oublier » emporte les traces', () => {
  it('supprime les traces de la personne AVANT les couches, et rend le compte rendu', async () => {
    const { controller, replyUses, order } = build()
    expect(await controller.forgetAll(user)).toEqual({ forgotten: 4, failedLayers: [] })
    expect(replyUses.forgetForUser).toHaveBeenCalledWith({ userId: 'u-1', workspaceId: 'ws-1' })
    expect(order).toEqual(['forgetTraces', 'forgetAll'])
  })

  it('NON — des traces non supprimées ne se taisent pas : la couche des conversations est NOMMÉE en échec', async () => {
    const { controller, replyUses, memory } = build()
    replyUses.forgetForUser.mockRejectedValueOnce(new Error('db down'))
    const result = await controller.forgetAll(user)
    expect(memory.forgetAll).toHaveBeenCalled()
    expect(result.failedLayers).toContain('conversations')
  })
})
