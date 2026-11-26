import { isThrottleError, mapWithConcurrency, mapWithConcurrencySettled, retryOnThrottle } from './concurrency'

describe('mapWithConcurrency', () => {
  it('garde l’ORDRE des entrées, même quand les plus lentes sont en tête', async () => {
    // Un appelant qui dédoublonne « le plus récent par fil » dépend de cet ordre.
    const delays = [30, 1, 20, 2]
    const out = await mapWithConcurrency(delays, 2, async (ms, index) => {
      await new Promise(resolve => setTimeout(resolve, ms))
      return index
    })
    expect(out).toEqual([0, 1, 2, 3])
  })

  it('ne dépasse JAMAIS la borne de requêtes en vol', async () => {
    // C'est le défaut réel de production : soixante appels Gmail simultanés →
    // « Too many concurrent requests for user » → l'appel entier tombe.
    let inFlight = 0
    let peak = 0
    await mapWithConcurrency(
      Array.from({ length: 40 }, (_, i) => i),
      5,
      async value => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await new Promise(resolve => setTimeout(resolve, 1))
        inFlight--
        return value
      },
    )
    expect(peak).toBeLessThanOrEqual(5)
  })

  it('ne lance pas plus d’ouvriers que d’articles', async () => {
    let calls = 0
    const out = await mapWithConcurrency([1, 2], 10, async value => {
      calls++
      return value * 2
    })
    expect(out).toEqual([2, 4])
    expect(calls).toBe(2)
  })

  it('rend une liste vide sans rien appeler', async () => {
    const fn = jest.fn()
    await expect(mapWithConcurrency([], 5, fn as never)).resolves.toEqual([])
    expect(fn).not.toHaveBeenCalled()
  })

  it('une borne absurde vaut 1 plutôt que zéro ouvrier — sinon rien ne s’exécute', async () => {
    await expect(mapWithConcurrency([1, 2, 3], 0, async v => v)).resolves.toEqual([1, 2, 3])
  })

  it('propage l’échec au lieu de rendre un trou silencieux', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async v => {
        if (v === 2) throw new Error('boom')
        return v
      }),
    ).rejects.toThrow('boom')
  })
})

describe('isThrottleError', () => {
  it('reconnaît le refus de débit de Gmail — rendu sous 403, pas sous 429', () => {
    // Un appelant qui n'attendrait que le 429 laisserait passer exactement le
    // cas qui nous occupe.
    expect(isThrottleError(new Error('Gmail get message failed: Too many concurrent requests for user'))).toBe(true)
    expect(isThrottleError(new Error('rateLimitExceeded'))).toBe(true)
    expect(isThrottleError(new Error('HTTP 429'))).toBe(true)
  })

  it('ne retente PAS ce qui ne se réparera pas tout seul', () => {
    expect(isThrottleError(new Error('invalid_grant'))).toBe(false)
    expect(isThrottleError(new Error('Insufficient Permission'))).toBe(false)
    expect(isThrottleError(new Error('Requested entity was not found'))).toBe(false)
  })
})

describe('retryOnThrottle', () => {
  const noSleep = async () => {}

  it('réussit au second essai après un refus de débit', async () => {
    let calls = 0
    const result = await retryOnThrottle(
      async () => {
        calls++
        if (calls === 1) throw new Error('Too many concurrent requests for user')
        return 'ok'
      },
      { sleep: noSleep },
    )
    expect(result).toBe('ok')
    expect(calls).toBe(2)
  })

  it('rend la main IMMÉDIATEMENT sur une erreur qui n’est pas du débit', async () => {
    // Retenter un jeton périmé trois fois ne fait que tripler le temps que
    // l'utilisateur attend avant de lire « reconnecte-toi ».
    let calls = 0
    await expect(
      retryOnThrottle(
        async () => {
          calls++
          throw new Error('invalid_grant')
        },
        { sleep: noSleep },
      ),
    ).rejects.toThrow('invalid_grant')
    expect(calls).toBe(1)
  })

  it('abandonne après le dernier essai, en remontant l’erreur du fournisseur', async () => {
    let calls = 0
    await expect(
      retryOnThrottle(
        async () => {
          calls++
          throw new Error('Too many concurrent requests for user')
        },
        { attempts: 3, sleep: noSleep },
      ),
    ).rejects.toThrow('Too many concurrent requests')
    expect(calls).toBe(3)
  })

  it('double l’attente à chaque essai', async () => {
    const waited: number[] = []
    await expect(
      retryOnThrottle(
        async () => {
          throw new Error('rate limit')
        },
        { attempts: 4, baseDelayMs: 100, sleep: async ms => void waited.push(ms) },
      ),
    ).rejects.toThrow()
    expect(waited).toEqual([100, 200, 400])
  })
})

/**
 * Recette live du 17/08 : la routine « relances sans réponse » a rendu
 * « Échec : Gmail get message failed: Too many concurrent requests for user »
 * alors que la borne de simultanéité était déjà déployée. Elle avait rendu le
 * refus rare, pas impossible — et il restait FATAL.
 */
describe('mapWithConcurrencySettled', () => {
  it("laisse passer les autres articles quand l'un d'eux échoue", async () => {
    const results = await mapWithConcurrencySettled([1, 2, 3, 4], 2, async value => {
      if (value === 3) throw new Error('Too many concurrent requests for user')
      return value * 10
    })
    expect(results).toEqual([10, 20, null, 40])
  })

  it("conserve l'ORDRE — un appelant dédoublonne « le plus récent par fil » dessus", async () => {
    const results = await mapWithConcurrencySettled(['a', 'b', 'c'], 3, async value => {
      if (value === 'a') throw new Error('boom')
      return value.toUpperCase()
    })
    expect(results).toEqual([null, 'B', 'C'])
  })

  it("prévient l'appelant de chaque article sauté — un trou silencieux se lit comme une boîte vide", async () => {
    const skipped: string[] = []
    await mapWithConcurrencySettled(
      ['ok', 'ko'],
      2,
      async value => {
        if (value === 'ko') throw new Error('refus')
        return value
      },
      (error, item) => skipped.push(`${item}:${(error as Error).message}`),
    )
    expect(skipped).toEqual(['ko:refus'])
  })

  it('ne masque rien quand tout se passe bien', async () => {
    expect(await mapWithConcurrencySettled([1, 2], 5, async value => value + 1)).toEqual([2, 3])
  })
})
