import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_REDEEM_TIMEOUT_MS, DEMO_TOUCH_TIMEOUT_MS, DemoTimeoutError } from './demo-timeout'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

// #2705.4/#2705.6 — les deux appels du formulaire obligatoire de démo.
describe('demoApi.registerLead', () => {
  beforeEach(() => apiFetch.mockReset())

  it('poste les champs du formulaire, UTM compris', async () => {
    const { demoApi } = await import('./api')
    apiFetch.mockResolvedValue({ firstName: 'Marie' })

    const result = await demoApi.registerLead({
      firstName: 'Marie',
      lastName: 'Dupont',
      email: 'marie.dupont@acme.fr',
      jobTitle: 'sales_director',
      company: 'Acme',
      utmSource: 'linkedin',
    })

    expect(result).toEqual({ firstName: 'Marie' })
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/demo/lead',
      method: 'POST',
      body: {
        firstName: 'Marie',
        lastName: 'Dupont',
        email: 'marie.dupont@acme.fr',
        jobTitle: 'sales_director',
        company: 'Acme',
        utmSource: 'linkedin',
      },
    })
  })
})

describe('demoApi.leadTouch', () => {
  beforeEach(() => apiFetch.mockReset())

  it('rend { found: true } quand le cookie porte déjà un lead', async () => {
    const { demoApi } = await import('./api')
    apiFetch.mockResolvedValue({ found: true, firstName: 'Marie' })

    await expect(demoApi.leadTouch()).resolves.toEqual({ found: true, firstName: 'Marie' })
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/demo/lead/touch',
      method: 'POST',
      body: {},
      signal: expect.any(AbortSignal),
    })
  })

  it('rend { found: false } — le formulaire doit alors s’afficher', async () => {
    const { demoApi } = await import('./api')
    apiFetch.mockResolvedValue({ found: false })

    await expect(demoApi.leadTouch()).resolves.toEqual({ found: false })
  })
})

// #3468 — une entrée en démo ne tourne jamais sans fin : au-delà de la borne, une erreur NOMMÉE.
describe('demoApi — bornes de temps (#3468)', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  /** Un serveur qui ne répond jamais, mais qui respecte le signal d'abandon. */
  function hangUntilAborted() {
    apiFetch.mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
  }

  it('redeem sans réponse → DemoTimeoutError à 90 s, pas avant', async () => {
    const { demoApi } = await import('./api')
    hangUntilAborted()
    const outcome = demoApi.redeem().then(
      () => 'resolved',
      (error: unknown) => error,
    )
    await vi.advanceTimersByTimeAsync(DEMO_REDEEM_TIMEOUT_MS - 1000)
    let settled = false
    void outcome.then(() => (settled = true))
    await Promise.resolve()
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1500)
    expect(await outcome).toBeInstanceOf(DemoTimeoutError)
  })

  it('leadTouch sans réponse → DemoTimeoutError à 15 s', async () => {
    const { demoApi } = await import('./api')
    hangUntilAborted()
    const outcome = demoApi.leadTouch().catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(DEMO_TOUCH_TIMEOUT_MS + 100)
    expect(await outcome).toBeInstanceOf(DemoTimeoutError)
  })

  it('une vraie erreur serveur n’est PAS prise pour un délai dépassé', async () => {
    const { demoApi } = await import('./api')
    const boom = new Error('500')
    apiFetch.mockRejectedValue(boom)
    await expect(demoApi.redeem()).rejects.toBe(boom)
  })
})

// #3578 — « la démo se prépare » : un état, jamais une panne. Le client redemande seul.
describe('demoApi.redeem — la démo se prépare (#3578)', () => {
  const preparing = async () => {
    const { ApiError } = await import('@/lib/api-error')
    return new ApiError('La démo se prépare', 503, 'demo_preparing', { code: 'demo_preparing', retryAfterSeconds: 15 })
  }

  beforeEach(() => {
    apiFetch.mockReset()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('redemande après le délai annoncé, prévient l’écran, et aboutit quand la salle est prête', async () => {
    const { demoApi } = await import('./api')
    const onPreparing = vi.fn()
    apiFetch
      .mockRejectedValueOnce(await preparing())
      .mockRejectedValueOnce(await preparing())
      .mockResolvedValueOnce({ user: { id: 'u1' } })

    const pending = demoApi.redeem(undefined, { onPreparing })
    await vi.advanceTimersByTimeAsync(0)
    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(onPreparing).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(14_000)
    expect(apiFetch).toHaveBeenCalledTimes(1) // le délai du serveur est respecté (limite 5 appels/min)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(apiFetch).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(15_000)

    await expect(pending).resolves.toEqual({ user: { id: 'u1' } })
    expect(apiFetch).toHaveBeenCalledTimes(3)
  })

  it('SAIT DIRE NON : une autre 503 (pas d’espace de démo) n’est pas « en préparation » — l’erreur remonte', async () => {
    const { demoApi } = await import('./api')
    const { ApiError } = await import('@/lib/api-error')
    const onPreparing = vi.fn()
    apiFetch.mockRejectedValue(new ApiError('Aucun espace', 503, 'no_code'))

    await expect(demoApi.redeem(undefined, { onPreparing })).rejects.toBeInstanceOf(ApiError)
    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(onPreparing).not.toHaveBeenCalled()
  })

  it('ne boucle pas sans fin : au-delà de 15 minutes de préparation, c’est un délai dépassé NOMMÉ', async () => {
    const { demoApi } = await import('./api')
    apiFetch.mockImplementation(async () => {
      throw await preparing()
    })

    const pending = demoApi.redeem(undefined)
    const assertion = expect(pending).rejects.toBeInstanceOf(DemoTimeoutError)
    await vi.advanceTimersByTimeAsync(16 * 60_000)
    await assertion
  })
})

describe('demoApi.redeem — #4291 J la démo forfait / conseil', () => {
  beforeEach(() => apiFetch.mockReset())

  it('porte la variante quand elle est demandée ; sinon le corps d’avant, à l’octet', async () => {
    const { demoApi } = await import('./api')
    apiFetch.mockResolvedValue({ user: { id: 'u1' } })

    await demoApi.redeem('tok', { profile: 'forfait_conseil' })
    await demoApi.redeem('tok')

    expect(apiFetch.mock.calls[0]?.[0]).toMatchObject({ body: { token: 'tok', profile: 'forfait_conseil' } })
    expect(apiFetch.mock.calls[1]?.[0]).toMatchObject({ body: { token: 'tok' } })
    expect((apiFetch.mock.calls[1]?.[0] as { body: object }).body).not.toHaveProperty('profile')
  })
})
