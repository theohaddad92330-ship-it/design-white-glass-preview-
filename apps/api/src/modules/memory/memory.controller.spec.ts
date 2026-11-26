import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { MemoryController } from './memory.controller'
import type { MemoryService } from './memory.service'
import type {
  CorrectConversationSummaryDto,
  ForgetMemoryParamsDto,
  GetConversationSummaryDto,
  ListFactsDto,
  PatchPreferencesDto,
  PinFactDto,
} from './dto/memory.dto'

describe('MemoryController', () => {
  const user = { userId: 'u-1', email: 'u@example.com' } as CurrentUserPayload

  function build() {
    const memory = {
      listFacts: jest.fn().mockResolvedValue([{ id: 'f-1', fact: 'x', accountId: null, createdAt: 'now' }]),
      pinFact: jest.fn().mockResolvedValue({ id: 'f-1', fact: 'x', accountId: null, createdAt: 'now' }),
      unpinFact: jest.fn().mockResolvedValue(undefined),
      setFactScope: jest.fn().mockResolvedValue({ id: 'f-1', fact: 'x', scope: 'workspace', ownedByMe: true }),
      getPreferences: jest.fn().mockResolvedValue({ tone: 'direct' }),
      patchPreferences: jest.fn().mockResolvedValue({ tone: 'chaleureux' }),
      forgetAll: jest.fn().mockResolvedValue({ forgotten: 4, failedLayers: [] }),
      forgetLedgerEntry: jest.fn().mockResolvedValue(undefined),
      getConversationSummaryDetail: jest
        .fn()
        .mockResolvedValue({ summary: 'Le résumé', updatedAt: '2026-09-16T10:00:00.000Z' }),
      correctConversationSummary: jest
        .fn()
        .mockResolvedValue({ summary: 'Le bon résumé', updatedAt: '2026-09-16T11:00:00.000Z' }),
    } as unknown as jest.Mocked<
      Pick<
        MemoryService,
        | 'listFacts'
        | 'pinFact'
        | 'unpinFact'
        | 'setFactScope'
        | 'getPreferences'
        | 'patchPreferences'
        | 'forgetAll'
        | 'forgetLedgerEntry'
        | 'getConversationSummaryDetail'
        | 'correctConversationSummary'
      >
    >
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
    } as unknown as jest.Mocked<Pick<WorkspaceContextService, 'resolveActiveWorkspace'>>
    return {
      memory,
      workspaceContext,
      controller: new MemoryController(
        memory as unknown as MemoryService,
        workspaceContext as unknown as WorkspaceContextService,
      ),
    }
  }

  it('pins a fact scoped to the resolved workspace + JWT user (never a body value)', async () => {
    const { memory, workspaceContext, controller } = build()
    await controller.pinFact(user, { fact: 'DSI décideur', accountId: 'a-1' } as PinFactDto)
    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('u-1')
    expect(memory.pinFact).toHaveBeenCalledWith({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: 'a-1',
      fact: 'DSI décideur',
      // Nature / origine / échéance / portée absentes ⇒ le service applique ses défauts.
      kind: undefined,
      origin: undefined,
      expiresAt: null,
      scope: undefined,
      // #1918.5 / #1918.2 — rien n'est DÉSIGNÉ : le corps n'a ni fil ni
      // périmètre, et l'appelant ne porte aucun périmètre (service absent).
      conversationId: null,
      businessUnitId: null,
      businessUnitIds: [],
      // #2260.7 — rien n'est DÉSIGNÉ : le corps ne porte aucun objet visé.
      object: null,
    })
  })

  it('#1918.1 — forwards the scope from the body, and the owner from the JWT only', async () => {
    const { memory, controller } = build()
    await controller.pinFact(user, {
      fact: 'Objectif perso',
      scope: 'user',
      userId: 'u-autre',
    } as unknown as PinFactDto)
    expect(memory.pinFact).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-1', scope: 'user' }))
  })

  it('#1916.21 — changes the scope of a fact, for the JWT user, in the resolved workspace', async () => {
    const { memory, workspaceContext, controller } = build()
    const result = await controller.setFactScope(user, 'f-1', { scope: 'workspace' })
    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('u-1')
    expect(memory.setFactScope).toHaveBeenCalledWith({
      id: 'f-1',
      workspaceId: 'ws-1',
      userId: 'u-1',
      scope: 'workspace',
    })
    expect(result.fact).toMatchObject({ scope: 'workspace' })
  })

  it('forwards the nature, the origin and the deadline when the body carries them (V2 §20)', async () => {
    const { memory, controller } = build()
    await controller.pinFact(user, {
      fact: 'Ne jamais proposer de régie',
      kind: 'correction',
      origin: 'copilot',
      expiresAt: '2026-12-31T23:00:00.000Z',
    } as PinFactDto)
    expect(memory.pinFact).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'correction',
        origin: 'copilot',
        expiresAt: '2026-12-31T23:00:00.000Z',
      }),
    )
  })

  it('lists facts scoped to the resolved workspace AND to what the JWT user may see (#1918.1)', async () => {
    const { memory, controller } = build()
    const result = await controller.listFacts(user, { accountId: 'a-1' } as ListFactsDto)
    expect(memory.listFacts).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      userId: 'u-1',
      accountId: 'a-1',
      role: 'owner',
      // #1918.2 — sans `BusinessUnitService` (ce contrôleur est construit par
      // position), l'appelant ne porte AUCUN périmètre : aucune mémoire
      // d'équipe ne se lit. Repli FERMÉ, jamais l'espace entier.
      businessUnitIds: [],
    })
    expect(result.facts).toHaveLength(1)
  })

  it('unpins by id scoped to the resolved workspace, the JWT user AND their RESOLVED role (#1918.1, #1918.7)', async () => {
    const { memory, controller } = build()
    await controller.unpinFact(user, 'f-9')
    // Le rôle vient de `resolveActiveWorkspace` (la même résolution que
    // `WorkspacePermissionGuard`), jamais du corps ni de l'URL.
    expect(memory.unpinFact).toHaveBeenCalledWith({ id: 'f-9', workspaceId: 'ws-1', userId: 'u-1', role: 'owner' })
  })

  it('#1918.7 — forgets a ledger line with the RESOLVED role too', async () => {
    const { memory, controller } = build()
    await controller.forgetLedgerEntry(user, { layer: 'facts', id: 'f-9' } as ForgetMemoryParamsDto)
    expect(memory.forgetLedgerEntry).toHaveBeenCalledWith({
      userId: 'u-1',
      workspaceId: 'ws-1',
      layer: 'facts',
      id: 'f-9',
      role: 'owner',
    })
  })

  it('reads preferences for the JWT user', async () => {
    const { memory, controller } = build()
    const result = await controller.getPreferences(user)
    expect(memory.getPreferences).toHaveBeenCalledWith('u-1')
    expect(result.preferences).toEqual({ tone: 'direct' })
  })

  it('patches preferences for the JWT user', async () => {
    const { memory, controller } = build()
    const result = await controller.patchPreferences(user, {
      preferences: { tone: 'chaleureux' },
    } as PatchPreferencesDto)
    expect(memory.patchPreferences).toHaveBeenCalledWith('u-1', { tone: 'chaleureux' })
    expect(result.preferences).toEqual({ tone: 'chaleureux' })
  })

  // #1955.30 — le résumé du fil OUVERT, scopé par le JWT + l'espace résolu,
  // jamais par un `userId`/`workspaceId` du corps ou de la query.
  it('reads the conversation summary scoped to the JWT user + the resolved workspace', async () => {
    const { memory, workspaceContext, controller } = build()
    const result = await controller.readConversationSummary(user, {
      conversationId: 'general',
      accountId: null,
    } as GetConversationSummaryDto)
    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('u-1')
    expect(memory.getConversationSummaryDetail).toHaveBeenCalledWith({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: null,
      conversationId: 'general',
    })
    expect(result.summary).toEqual({ summary: 'Le résumé', updatedAt: '2026-09-16T10:00:00.000Z' })
  })

  it('defaults conversationId/accountId to null when the query omits them (le fil par défaut)', async () => {
    const { memory, controller } = build()
    await controller.readConversationSummary(user, {} as GetConversationSummaryDto)
    expect(memory.getConversationSummaryDetail).toHaveBeenCalledWith({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: null,
      conversationId: null,
    })
  })

  // #1955.31 — « une correction humaine gagne toujours » : le texte corrigé
  // part avec la même portée que la lecture.
  it('corrects the conversation summary scoped to the JWT user + the resolved workspace', async () => {
    const { memory, workspaceContext, controller } = build()
    const result = await controller.correctConversationSummary(user, {
      conversationId: 'general',
      accountId: null,
      summary: 'Le bon résumé',
    } as CorrectConversationSummaryDto)
    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('u-1')
    expect(memory.correctConversationSummary).toHaveBeenCalledWith({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: null,
      conversationId: 'general',
      summary: 'Le bon résumé',
    })
    expect(result.summary).toEqual({ summary: 'Le bon résumé', updatedAt: '2026-09-16T11:00:00.000Z' })
  })

  it('« tout oublier » borne le geste à l’appelant ET à son espace actif', async () => {
    const { memory, workspaceContext, controller } = build()

    const report = await controller.forgetAll(user)

    // Les DEUX bornes viennent du serveur : le corps de la requête n'en porte
    // aucune, et l'espace est RÉSOLU, jamais reçu.
    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('u-1')
    expect(memory.forgetAll).toHaveBeenCalledWith({ userId: 'u-1', workspaceId: 'ws-1' })
    // La réponse porte un compte rendu, pas un 204 muet : un geste irréversible
    // doit pouvoir dire qu'il n'a pas tout fait.
    expect(report).toEqual({ forgotten: 4, failedLayers: [] })
  })
})
