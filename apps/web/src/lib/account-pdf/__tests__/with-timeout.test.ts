import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withTimeout } from '../with-timeout'

describe('withTimeout', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('rejette avec le message quand le travail ne rend jamais la main', async () => {
    const attente = withTimeout(new Promise<Blob>(() => undefined), 30_000, 'trop long')
    const verdict = expect(attente).rejects.toThrow('trop long')
    await vi.advanceTimersByTimeAsync(30_000)
    await verdict
  })

  it('rend la valeur quand le travail finit à temps', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 30_000, 'trop long')).resolves.toBe('ok')
  })

  it("laisse passer l'erreur d'origine", async () => {
    await expect(withTimeout(Promise.reject(new Error('police absente')), 30_000, 'trop long')).rejects.toThrow(
      'police absente',
    )
  })
})
