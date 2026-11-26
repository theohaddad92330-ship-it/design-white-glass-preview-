import { ChatTurnRegistry } from './chat-turn-registry'

const ME = 'user-1'
const OTHER = 'user-2'

function turn(
  registry: ChatTurnRegistry,
  overrides: Partial<{ turnId: string; userId: string; conversationId: string | null }> = {},
) {
  const abort = new AbortController()
  registry.begin({
    turnId: overrides.turnId ?? 't-1',
    userId: overrides.userId ?? ME,
    workspaceId: 'ws-1',
    conversationId: overrides.conversationId === undefined ? 'conv-1' : overrides.conversationId,
    abort,
  })
  return abort
}

describe('ChatTurnRegistry — les recherches de Laura qui tournent côté serveur (#4967, lot L6)', () => {
  it('un tour commencé est lu « en cours » pour son fil, puis disparaît à sa fin', () => {
    const registry = new ChatTurnRegistry(() => new Date('2026-11-01T10:00:00Z'))
    turn(registry)
    expect(registry.running(ME, 'conv-1')).toEqual([
      { turnId: 't-1', conversationId: 'conv-1', startedAt: '2026-11-01T10:00:00.000Z' },
    ])
    registry.end('t-1')
    expect(registry.running(ME, 'conv-1')).toEqual([])
  })

  it('« Arrêter » abolit le tour de SON auteur — et seulement le sien', () => {
    const registry = new ChatTurnRegistry()
    const abort = turn(registry)
    expect(registry.stop(OTHER, 't-1')).toBe(false)
    expect(abort.signal.aborted).toBe(false)
    expect(registry.stop(ME, 't-1')).toBe(true)
    expect(abort.signal.aborted).toBe(true)
  })

  it('NON — un tour inconnu ou fini ne s’arrête pas (rien n’est inventé)', () => {
    const registry = new ChatTurnRegistry()
    expect(registry.stop(ME, 'nope')).toBe(false)
    turn(registry)
    registry.end('t-1')
    expect(registry.stop(ME, 't-1')).toBe(false)
  })

  it('NON — les tours d’un collègue ne se lisent pas, même sur un fil de même clé', () => {
    const registry = new ChatTurnRegistry()
    turn(registry, { userId: OTHER })
    expect(registry.running(ME, 'conv-1')).toEqual([])
    expect(registry.measure(ME).running).toBe(0)
  })

  it('la mesure de l’auteur : combien tournent, depuis quand (le plus ancien départ)', () => {
    let now = new Date('2026-11-01T10:00:00Z')
    const registry = new ChatTurnRegistry(() => now)
    turn(registry, { turnId: 'a' })
    now = new Date('2026-11-01T10:05:00Z')
    turn(registry, { turnId: 'b', conversationId: 'conv-2' })
    expect(registry.measure(ME)).toEqual({
      running: 2,
      since: '2026-11-01T10:00:00.000Z',
      lastActivityAt: '2026-11-01T10:05:00.000Z',
    })
    expect(registry.running(ME)).toHaveLength(2)
  })
})
