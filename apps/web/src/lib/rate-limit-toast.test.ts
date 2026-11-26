import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #1687.3 — le bandeau d'échec de requête (429) émet `trackErrorShown`,
 * exactement quand le toast s'affiche, jamais plus tôt (un appel coalescé ne
 * doit rien émettre : il ne montre rien de neuf à l'utilisateur).
 */

const toastWarning = vi.fn()
vi.mock('sonner', () => ({
  toast: { warning: (...args: unknown[]) => toastWarning(...args) },
}))

vi.mock('@/i18n', () => ({
  i18n: { t: (key: string) => key },
}))

const trackErrorShown = vi.fn()
vi.mock('@/lib/product-tracker', () => ({
  trackErrorShown: (...args: unknown[]) => trackErrorShown(...args),
}))

describe('notifyIfRateLimited — #1687.3', () => {
  beforeEach(() => {
    vi.resetModules()
    toastWarning.mockClear()
    trackErrorShown.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parseApiStatus lit le statut porté par le message, jamais autre chose', async () => {
    const { parseApiStatus } = await import('./rate-limit-toast')
    expect(parseApiStatus(new Error('API error: 429'))).toBe(429)
    expect(parseApiStatus(new Error('API error: 500'))).toBe(500)
    expect(parseApiStatus(new Error('boom'))).toBeNull()
    expect(parseApiStatus('not an error')).toBeNull()
  })

  it('émet trackErrorShown(screen, "RATE_LIMITED") quand le toast part', async () => {
    vi.stubGlobal('window', { location: { pathname: '/accounts/3f1c4b7a-9e2d-4a11-8b3a-1234567890ab' } })
    const { notifyIfRateLimited } = await import('./rate-limit-toast')
    notifyIfRateLimited(new Error('API error: 429'))
    await Promise.resolve() // laisse la microtâche s'exécuter
    expect(toastWarning).toHaveBeenCalledTimes(1)
    expect(trackErrorShown).toHaveBeenCalledTimes(1)
    expect(trackErrorShown).toHaveBeenCalledWith('/accounts/$id', 'RATE_LIMITED')
  })

  it('n’émet RIEN pour une erreur qui n’est pas un 429', async () => {
    const { notifyIfRateLimited } = await import('./rate-limit-toast')
    notifyIfRateLimited(new Error('API error: 500'))
    await Promise.resolve()
    expect(toastWarning).not.toHaveBeenCalled()
    expect(trackErrorShown).not.toHaveBeenCalled()
  })

  it('un appel coalescé (fenêtre de 5 s) ne montre rien de neuf — donc n’émet rien de plus', async () => {
    vi.useFakeTimers()
    const { notifyIfRateLimited } = await import('./rate-limit-toast')
    notifyIfRateLimited(new Error('API error: 429'))
    await vi.runAllTimersAsync()
    expect(trackErrorShown).toHaveBeenCalledTimes(1)

    // Un second 429 dans la fenêtre de coalescence : ni toast, ni émission de plus.
    notifyIfRateLimited(new Error('API error: 429'))
    await vi.runAllTimersAsync()
    expect(toastWarning).toHaveBeenCalledTimes(1)
    expect(trackErrorShown).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('sans `window` (rendu hors navigateur) : screen = "(hors catalogue)", jamais une exception', async () => {
    vi.stubGlobal('window', undefined)
    const { notifyIfRateLimited } = await import('./rate-limit-toast')
    expect(() => notifyIfRateLimited(new Error('API error: 429'))).not.toThrow()
    await Promise.resolve()
    expect(trackErrorShown).toHaveBeenCalledWith('(hors catalogue)', 'RATE_LIMITED')
  })
})
