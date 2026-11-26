import { afterEach, describe, expect, it, vi } from 'vitest'
import { recordFirstSuccessGuideShown, wasFirstSuccessGuideShown } from './first-success-guide-seen'

/**
 * #2214.23 — le guide « Premier succès BellumAI » ne se déclenche qu'une
 * fois par compte, même patron que l’ancien `connector-hint-seen` (#1946.12, retiré par #4513).
 */
describe('first-success-guide-seen — #2214.23', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('non vu par défaut', () => {
    expect(wasFirstSuccessGuideShown('user-1')).toBe(false)
  })

  it('vu juste après avoir été enregistré', () => {
    recordFirstSuccessGuideShown('user-1', 1_000_000)
    expect(wasFirstSuccessGuideShown('user-1')).toBe(true)
  })

  it('l’état ne traverse jamais vers un autre compte', () => {
    recordFirstSuccessGuideShown('user-1', 1_000_000)
    expect(wasFirstSuccessGuideShown('user-2')).toBe(false)
  })

  it('un localStorage qui lève ne fait jamais planter la lecture — rend false', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(wasFirstSuccessGuideShown('user-1')).toBe(false)
    spy.mockRestore()
  })

  it('un localStorage qui lève ne fait jamais planter l’écriture', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => recordFirstSuccessGuideShown('user-1')).not.toThrow()
    spy.mockRestore()
  })
})
