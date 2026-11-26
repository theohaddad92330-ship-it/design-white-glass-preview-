import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ChatPresenceController } from './chat-presence.controller'
import type { ChatPresenceService } from './chat-presence.service'
import type { ChatPresenceHeartbeatDto, ChatPresenceQueryDto } from './dto/ia-proxy.dto'

/**
 * #3086 — le contrôleur ne reçoit JAMAIS un `workspaceId` du corps ou de la
 * requête : il résout systématiquement l'espace ACTIF de l'appelant
 * (`resolveActiveWorkspace(user.userId)`), la même porte que le reste du fil.
 * Un membre d'un autre espace ne peut donc pas se faire passer pour présent
 * ailleurs — il n'y a même pas de champ où l'écrire.
 */

const USER = { userId: 'u-a', email: 'a@esn.fr' } as CurrentUserPayload

function fakeWorkspaceContext() {
  return {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'member' }),
    isDemoWorkspace: jest.fn().mockResolvedValue(false),
  } as unknown as WorkspaceContextService
}

function fakePresenceService() {
  return {
    heartbeat: jest.fn().mockResolvedValue(undefined),
    activeMembers: jest.fn().mockResolvedValue([{ firstName: 'Bedros', avatarUrl: null }]),
  } as unknown as ChatPresenceService
}

describe('ChatPresenceController', () => {
  it('heartbeat résout l’espace ACTIF de l’appelant, jamais un espace fourni par le corps', async () => {
    const workspaceContext = fakeWorkspaceContext()
    const presence = fakePresenceService()
    const controller = new ChatPresenceController(presence, workspaceContext)

    const result = await controller.heartbeat(USER, {
      accountId: 'acc-1',
      conversationId: null,
    } as ChatPresenceHeartbeatDto)

    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('u-a')
    expect(presence.heartbeat).toHaveBeenCalledWith({
      userId: 'u-a',
      workspaceId: 'ws-1',
      accountId: 'acc-1',
      conversationId: null,
      isDemoWorkspace: false,
    })
    expect(result).toEqual({ ok: true })
  })

  it('accountId/conversationId absents (`undefined`) retombent sur `null` — le fil par défaut', async () => {
    const presence = fakePresenceService()
    const controller = new ChatPresenceController(presence, fakeWorkspaceContext())

    await controller.heartbeat(USER, {} as ChatPresenceHeartbeatDto)

    expect(presence.heartbeat).toHaveBeenCalledWith(expect.objectContaining({ accountId: null, conversationId: null }))
  })

  it('activeMembers rend les membres du service, bornés à l’espace résolu — jamais celui de la requête', async () => {
    const workspaceContext = fakeWorkspaceContext()
    const presence = fakePresenceService()
    const controller = new ChatPresenceController(presence, workspaceContext)

    const result = await controller.activeMembers(USER, {
      accountId: null,
      conversationId: 'conv-1',
    } as ChatPresenceQueryDto)

    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('u-a')
    expect(presence.activeMembers).toHaveBeenCalledWith({
      userId: 'u-a',
      workspaceId: 'ws-1',
      accountId: null,
      conversationId: 'conv-1',
      isDemoWorkspace: false,
    })
    expect(result).toEqual({ members: [{ firstName: 'Bedros', avatarUrl: null }] })
  })
})
