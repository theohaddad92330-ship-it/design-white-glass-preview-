import { EventEmitter } from 'node:events'
import { abortOnClientClose } from './client-abort'

/** #4490.2 — « Arrêter » : le navigateur coupe sa requête, le proxy coupe l'appel au moteur (aucun achat après). */
function fakeRequest(): EventEmitter {
  return new EventEmitter()
}

describe('abortOnClientClose', () => {
  it('annule le signal quand le client ferme avant la réponse', () => {
    const req = fakeRequest()
    const res = { writableEnded: false }
    const { signal } = abortOnClientClose(req as never, res as never)
    expect(signal.aborted).toBe(false)
    req.emit('close')
    expect(signal.aborted).toBe(true)
  })

  it('ne coupe rien quand la réponse est déjà envoyée (fermeture normale)', () => {
    const req = fakeRequest()
    const res = { writableEnded: true }
    const { signal } = abortOnClientClose(req as never, res as never)
    req.emit('close')
    expect(signal.aborted).toBe(false)
  })

  it('release détache l’écouteur', () => {
    const req = fakeRequest()
    const res = { writableEnded: false }
    const { signal, release } = abortOnClientClose(req as never, res as never)
    release()
    req.emit('close')
    expect(signal.aborted).toBe(false)
  })
})
