import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #3666 — « bandeau figé sur Lancement de l'analyse après 2 navigations ».
 * Le dernier désabonné déconnecte le socket ; l'événement de fin émis pendant
 * la déconnexion est perdu, Socket.IO ne le rejoue pas. La reconnexion doit
 * (1) rejoindre la salle et (2) prévenir ceux qui relisent l'état réel.
 */
type Handler = (...args: unknown[]) => void
const fake = vi.hoisted(() => {
  const handlers = new Map<string, Handler[]>()
  const s = {
    connected: false,
    active: false,
    emit: vi.fn(),
    connect: vi.fn(() => {
      s.active = true
    }),
    disconnect: vi.fn(() => {
      s.connected = false
      s.active = false
    }),
    on: (event: string, h: Handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), h])
    },
    fire: (event: string, ...args: unknown[]) => {
      if (event === 'connect') s.connected = true
      for (const h of handlers.get(event) ?? []) h(...args)
    },
  }
  return s
})

vi.mock('socket.io-client', () => ({ io: () => fake }))
vi.mock('@/features/auth/tab-identity', () => ({ readTabIdentity: () => 'u-1' }))

vi.unmock('@/lib/socket')
const { onSocketConnect, subscribeToAccount } = await vi.importActual<typeof import('./socket')>('./socket')

describe('socket — rejeu à la reconnexion (#3666)', () => {
  beforeEach(() => {
    fake.emit.mockClear()
  })

  it('après deux navigations (abonnement → désabonnement → abonnement), la reconnexion rejoint la salle ET prévient les relecteurs', () => {
    const onConnect = vi.fn()
    const off = onSocketConnect(onConnect)

    const unsub1 = subscribeToAccount('acct-1', {})
    fake.fire('connect')
    unsub1() // navigation 1 : le dernier observateur part, le socket se déconnecte
    expect(fake.disconnect).toHaveBeenCalled()

    subscribeToAccount('acct-1', {}) // navigation 2 : retour sur la fiche
    fake.emit.mockClear()
    onConnect.mockClear()
    fake.fire('connect') // reconnexion : l'événement de fin émis entre-temps est perdu

    expect(fake.emit).toHaveBeenCalledWith('join', 'acct-1')
    expect(onConnect).toHaveBeenCalledTimes(1)
    off()
  })

  // #3666.8 — le socket RESTE connecté (une autre salle l'observe) : quitter puis
  // rejoindre la salle d'un compte perd aussi les événements émis entre-temps,
  // sans aucun événement `connect` pour déclencher la relecture.
  it('se réabonner à un compte sur un socket DÉJÀ connecté relit aussi l’état réel', () => {
    const onConnect = vi.fn()
    const off = onSocketConnect(onConnect)
    const keepAlive = subscribeToAccount('acct-keep', {})
    fake.fire('connect')
    const unsub = subscribeToAccount('acct-2', {})
    unsub() // salle quittée, socket toujours connecté (acct-keep)
    onConnect.mockClear()
    fake.emit.mockClear()

    subscribeToAccount('acct-2', {})

    expect(fake.emit).toHaveBeenCalledWith('join', 'acct-2')
    expect(onConnect).toHaveBeenCalledTimes(1)
    keepAlive()
    off()
  })

  it('un écouteur retiré n’est plus prévenu', () => {
    const cb = vi.fn()
    onSocketConnect(cb)()
    fake.fire('connect')
    expect(cb).not.toHaveBeenCalled()
  })
})
