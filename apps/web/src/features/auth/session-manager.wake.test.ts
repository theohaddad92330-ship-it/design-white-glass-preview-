import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-error'

/**
 * Session tenue 24 h (demande de Louis du 15/09/2026) — un onglet laissé ouvert
 * la nuit est toujours connecté le matin.
 *
 * Le renouvellement ne tenait qu'à un `setTimeout` programmé ~60 s avant
 * l'expiration de l'access. Mac en veille, onglet en fond : le minuteur ne tourne
 * JAMAIS (l'horloge des minuteurs s'arrête pendant la veille, et Chrome gèle les
 * onglets cachés). Au réveil, seul `visibilitychange` rattrapait — et encore,
 * pas après un démarrage par `/auth/session`, qui supposait un access de 24 h.
 *
 * Ici la veille est simulée comme elle se passe : l'horloge MURALE avance
 * (`setSystemTime`) sans qu'aucun minuteur ne s'exécute.
 */

const sessionCall = vi.fn()
const refreshCall = vi.fn()
const hasLoggedInCookieMock = vi.fn()
const clearClientUserStateMock = vi.fn()

vi.mock('./api', () => ({
  authApi: {
    session: () => sessionCall(),
    refresh: () => refreshCall(),
  },
}))
vi.mock('./logged-in-cookie', () => ({ hasLoggedInCookie: () => hasLoggedInCookieMock() }))
vi.mock('./clear-client-user-state', () => ({ clearClientUserState: () => clearClientUserStateMock() }))

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'sales@esn.fr',
  created_at: 'now',
  roles: ['customer'],
}
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const T0 = new Date('2026-09-15T19:00:00Z').getTime()

const nowSeconds = () => Math.floor(Date.now() / 1000)

/** Les écouteurs posés par chaque gestionnaire créé ici. Retirés après chaque cas :
 *  sinon le gestionnaire d'un cas précédent répondrait au réveil du suivant. */
const registered: Array<{ target: EventTarget; type: string; listener: EventListenerOrEventListenerObject }> = []

function trackListeners(target: Window | Document): void {
  const original = target.addEventListener.bind(target)
  vi.spyOn(target, 'addEventListener').mockImplementation(((
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) => {
    if (!listener) return
    registered.push({ target, type, listener })
    original(type, listener, options)
  }) as never)
}

async function freshManager() {
  vi.resetModules()
  const mod = await import('./session-manager')
  return mod.sessionManager
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
}

type WakeSignal = 'focus' | 'online' | 'visibilitychange' | 'pageshow'

function wake(signal: WakeSignal): void {
  if (signal === 'visibilitychange') document.dispatchEvent(new Event('visibilitychange'))
  else window.dispatchEvent(new Event(signal))
}

/** La machine dort : l'horloge murale avance, AUCUN minuteur ne s'exécute. */
function sleepWithoutTimers(ms: number): void {
  vi.setSystemTime(Date.now() + ms)
}

async function bootWithRefresh(accessTtlSeconds: number) {
  hasLoggedInCookieMock.mockReturnValue(false)
  refreshCall.mockResolvedValueOnce({ user: USER, expires_at: nowSeconds() + accessTtlSeconds })
  const mgr = await freshManager()
  await mgr.loadSession()
  return mgr
}

describe('SessionManager — une session active tient au réveil', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    vi.stubGlobal('BroadcastChannel', undefined)
    sessionCall.mockReset()
    refreshCall.mockReset()
    hasLoggedInCookieMock.mockReset()
    clearClientUserStateMock.mockReset()
    localStorage.clear()
    sessionStorage.clear()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    trackListeners(window)
    trackListeners(document)
  })
  afterEach(() => {
    for (const { target, type, listener } of registered.splice(0)) target.removeEventListener(type, listener)
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it.each<WakeSignal>(['focus', 'online', 'visibilitychange', 'pageshow'])(
    'access d’1 h, 23 h de veille, réveil par « %s » → refresh → toujours connecté',
    async signal => {
      const mgr = await bootWithRefresh(3600)
      expect(refreshCall).toHaveBeenCalledTimes(1)

      sleepWithoutTimers(23 * HOUR_MS)
      refreshCall.mockResolvedValueOnce({ user: USER, expires_at: nowSeconds() + 3600 })
      wake(signal)
      await flush()

      expect(refreshCall).toHaveBeenCalledTimes(2)
      expect(mgr.getState().user).toEqual(USER)
    },
  )

  it('démarrage par la sonde /auth/session (échéance inconnue) : 23 h plus tard, le réveil renouvelle', async () => {
    hasLoggedInCookieMock.mockReturnValue(true)
    sessionCall.mockResolvedValue({ user: USER })
    const mgr = await freshManager()
    await mgr.loadSession()
    expect(refreshCall).not.toHaveBeenCalled()

    sleepWithoutTimers(23 * HOUR_MS)
    refreshCall.mockResolvedValueOnce({ user: USER, expires_at: nowSeconds() + 3600 })
    wake('focus')
    await flush()

    expect(refreshCall).toHaveBeenCalledTimes(1)
    expect(mgr.getState().user).toEqual(USER)
  })

  it('focus + visibilitychange + online au même réveil → UN seul refresh', async () => {
    await bootWithRefresh(3600)
    sleepWithoutTimers(23 * HOUR_MS)
    refreshCall.mockResolvedValue({ user: USER, expires_at: nowSeconds() + 3600 })

    wake('focus')
    wake('visibilitychange')
    wake('online')
    await flush()

    expect(refreshCall).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['coupure réseau', new TypeError('Failed to fetch')],
    ['503', new ApiError('Service momentanément indisponible', 503)],
  ])('refresh au réveil en échec (%s) → pas de déconnexion, et on retente', async (_label, failure) => {
    const mgr = await bootWithRefresh(3600)
    sleepWithoutTimers(23 * HOUR_MS)
    refreshCall.mockRejectedValueOnce(failure)
    const purgesBefore = clearClientUserStateMock.mock.calls.length

    wake('focus')
    await flush()

    expect(refreshCall).toHaveBeenCalledTimes(2)
    expect(mgr.getState().user).toEqual(USER)
    expect(mgr.getState().sessionUnavailable).toBe(false)
    expect(clearClientUserStateMock.mock.calls.length).toBe(purgesBefore)

    refreshCall.mockResolvedValueOnce({ user: USER, expires_at: nowSeconds() + 3600 })
    await vi.advanceTimersByTimeAsync(MINUTE_MS)

    expect(refreshCall).toHaveBeenCalledTimes(3)
    expect(mgr.getState().user).toEqual(USER)
  })

  it('refresh réellement refusé (401) au réveil → retour à la connexion', async () => {
    const mgr = await bootWithRefresh(3600)
    sleepWithoutTimers(23 * HOUR_MS)
    refreshCall.mockRejectedValueOnce(new ApiError('Session révoquée sur cet appareil', 401))

    wake('focus')
    await flush()

    expect(mgr.getState().user).toBeNull()
  })

  it('échéance déjà passée à la réception → pas d’enchaînement, et le renouvellement ne s’arrête pas', async () => {
    // Horloge du poste en avance sur le serveur : chaque session reçue semble déjà expirée.
    hasLoggedInCookieMock.mockReturnValue(false)
    refreshCall.mockImplementation(async () => ({ user: USER, expires_at: nowSeconds() - 10 }))
    const mgr = await freshManager()
    await mgr.loadSession()
    await flush()

    expect(refreshCall).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(refreshCall).toHaveBeenCalledTimes(3)
    expect(mgr.getState().user).toEqual(USER)
  })

  it('témoin : un réveil alors que rien n’est dû ne rappelle pas /auth/refresh', async () => {
    await bootWithRefresh(24 * 3600)
    sleepWithoutTimers(2 * MINUTE_MS)

    wake('focus')
    wake('online')
    await flush()

    expect(refreshCall).toHaveBeenCalledTimes(1)
  })
})
