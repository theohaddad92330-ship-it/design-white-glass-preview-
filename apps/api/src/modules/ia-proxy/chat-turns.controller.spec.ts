import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { ChatTurnRegistry } from '../chat-turns/chat-turn-registry'
import { ChatTurnsController } from './chat-turns.controller'

const ME = { userId: 'u-1', email: 'me@esn.fr' } as CurrentUserPayload
const OTHER = { userId: 'u-2', email: 'other@esn.fr' } as CurrentUserPayload
const TURN = '33333333-3333-4333-8333-333333333333'

function build() {
  const registry = new ChatTurnRegistry(() => new Date('2026-11-01T09:00:00Z'))
  const abort = new AbortController()
  registry.begin({ turnId: TURN, userId: ME.userId, workspaceId: 'ws', conversationId: 'conv-1', abort })
  return { controller: new ChatTurnsController(registry), abort }
}

describe('ChatTurnsController — les recherches de Laura en arrière-plan (#4967)', () => {
  it('le fil qui revient lit le tour qui y tourne encore', () => {
    const { controller } = build()
    expect(controller.running(ME, { conversationId: 'conv-1' })).toEqual({
      turns: [{ turnId: TURN, conversationId: 'conv-1', startedAt: '2026-11-01T09:00:00.000Z' }],
    })
    expect(controller.running(ME, { conversationId: 'conv-2' })).toEqual({ turns: [] })
  })

  it('« Arrêter » abolit le tour de l’appelant', () => {
    const { controller, abort } = build()
    expect(controller.stop(ME, TURN)).toEqual({ stopped: true })
    expect(abort.signal.aborted).toBe(true)
  })

  it('NON — un autre ne lit ni n’arrête ce tour', () => {
    const { controller, abort } = build()
    expect(controller.running(OTHER, {})).toEqual({ turns: [] })
    expect(controller.stop(OTHER, TURN)).toEqual({ stopped: false })
    expect(abort.signal.aborted).toBe(false)
  })
})
