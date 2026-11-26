import { beforeEach, describe, expect, it } from 'vitest'
import { registerTurnController, releaseTurnController, stopTurn, useBackgroundTurnsStore } from './background-turns'

const state = () => useBackgroundTurnsStore.getState()

describe('background-turns — la recherche qui continue hors de l’écran', () => {
  beforeEach(() => state().reset())

  it('un tour lancé est « en cours » pour son fil seulement', () => {
    state().begin('c1')
    expect(state().turns.c1).toBe('running')
    expect(state().turns.c2).toBeUndefined()
  })

  it('fini hors de l’écran : « prête » ; fini sous les yeux : rien à signaler', () => {
    state().begin('c1')
    state().finish('c1', { visible: false })
    expect(state().turns.c1).toBe('ready')
    state().begin('c2')
    state().finish('c2', { visible: true })
    expect(state().turns.c2).toBeUndefined()
  })

  it('« lue » retire la réponse prête, mais jamais un tour encore en cours', () => {
    state().begin('c1')
    state().acknowledge('c1')
    expect(state().turns.c1).toBe('running')
    state().finish('c1', { visible: false })
    state().acknowledge('c1')
    expect(state().turns.c1).toBeUndefined()
  })

  it('un arrêt ou un échec retire le tour sans le dire « prêt »', () => {
    state().begin('c1')
    state().discard('c1')
    expect(state().turns.c1).toBeUndefined()
  })

  it('readyIds liste seulement les réponses prêtes', () => {
    state().begin('a')
    state().begin('b')
    state().finish('b', { visible: false })
    expect(state().readyIds()).toEqual(['b'])
  })

  it('« Arrêter » abolit le tour de CE fil, depuis un autre écran que celui qui l’a lancé', () => {
    const mine = new AbortController()
    const other = new AbortController()
    registerTurnController('c1', mine)
    registerTurnController('c2', other)
    stopTurn('c1')
    expect(mine.signal.aborted).toBe(true)
    expect(other.signal.aborted).toBe(false)
    releaseTurnController('c2', other)
    stopTurn('c2')
    expect(other.signal.aborted).toBe(false)
  })
})
