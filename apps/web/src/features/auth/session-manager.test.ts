import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-error'

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

const USER = { id: 'u1', email: 'sales@esn.fr', created_at: 'now', roles: ['customer'] }

/** Fresh singleton per test — `loadSession` is one-shot (guards on `this.loaded`). */
async function freshManager() {
  vi.resetModules()
  const mod = await import('./session-manager')
  return mod.sessionManager
}

describe('SessionManager.loadSession — boot session recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sessionCall.mockReset()
    refreshCall.mockReset()
    hasLoggedInCookieMock.mockReset()
    clearClientUserStateMock.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('sentinel present + warm access cookie → user from /auth/session, no refresh', async () => {
    hasLoggedInCookieMock.mockReturnValue(true)
    sessionCall.mockResolvedValue({ user: USER })

    const mgr = await freshManager()
    await mgr.loadSession()

    expect(mgr.getState().user).toEqual(USER)
    expect(refreshCall).not.toHaveBeenCalled()
  })

  it('MITIGATION: sentinel UNREADABLE but a valid refresh cookie → silent refresh restores the session', async () => {
    // Cross-site case: `loggedIn:` lives on the API host, unreadable by the SPA.
    hasLoggedInCookieMock.mockReturnValue(false)
    refreshCall.mockResolvedValue({ user: USER, expires_at: null })

    const mgr = await freshManager()
    await mgr.loadSession()

    // Before the fix this cleared immediately (logout on hard reload); now the
    // boot refresh recovers the session.
    expect(refreshCall).toHaveBeenCalledTimes(1)
    expect(mgr.getState().user).toEqual(USER)
  })

  it('sentinel unreadable + no valid session → cleared (genuinely anonymous)', async () => {
    hasLoggedInCookieMock.mockReturnValue(false)
    refreshCall.mockRejectedValue(new ApiError('unauthorized', 401))

    const mgr = await freshManager()
    await mgr.loadSession()

    expect(refreshCall).toHaveBeenCalledTimes(1)
    expect(mgr.getState().user).toBeNull()
    expect(mgr.getState().loading).toBe(false)
  })

  it('serveur indisponible (429) → la session n’est PAS déclarée morte', async () => {
    // Incident prod : une analyse tourne, l'API renvoie 429, et le boot suivant
    // concluait « anonyme » — l'utilisateur se retrouvait sur /login. Un 429 ne
    // dit rien de la session : on reste en « inconnu », et la prochaine
    // navigation retentera au lieu de conclure.
    hasLoggedInCookieMock.mockReturnValue(true)
    sessionCall.mockRejectedValue(new ApiError('rate limited', 429))
    refreshCall.mockRejectedValue(new ApiError('rate limited', 429))

    const mgr = await freshManager()
    // `clear()` lance `clearClientUserState()` sans l'attendre : on mesure un
    // delta plutôt qu'un total, sinon un test antérieur nous compte ses appels.
    const purgesBefore = clearClientUserStateMock.mock.calls.length
    await mgr.loadSession()

    expect(mgr.getState().sessionUnavailable).toBe(true)
    expect(clearClientUserStateMock.mock.calls.length).toBe(purgesBefore)
  })

  it('serveur indisponible → un nouvel essai est autorisé (loadSession n’est pas consommé)', async () => {
    hasLoggedInCookieMock.mockReturnValue(true)
    sessionCall.mockRejectedValue(new ApiError('boom', 503))
    refreshCall.mockRejectedValue(new ApiError('boom', 503))

    const mgr = await freshManager()
    await mgr.loadSession()

    // Le serveur revient : la seconde tentative doit vraiment repartir.
    sessionCall.mockResolvedValue({ user: USER })
    await mgr.loadSession()

    expect(mgr.getState().user).toEqual(USER)
    expect(mgr.getState().sessionUnavailable).toBe(false)
  })

  it('#3573 visiteur sans jeton, refresh muet (réseau/5xx) → pas retenu : les gardes renvoient à /login', async () => {
    hasLoggedInCookieMock.mockReturnValue(false)
    refreshCall.mockRejectedValue(new TypeError('Failed to fetch'))

    const mgr = await freshManager()
    await mgr.loadSession()

    expect(mgr.getState().user).toBeNull()
    expect(mgr.getState().loading).toBe(false)
    expect(mgr.getState().sessionUnavailable).toBe(false)
  })

  it('#3573 visiteur sans jeton, refresh muet → un rejeu restaure la session si elle existait', async () => {
    hasLoggedInCookieMock.mockReturnValue(false)
    refreshCall.mockRejectedValueOnce(new ApiError('boom', 503))
    refreshCall.mockResolvedValue({ user: USER, expires_at: null })

    const mgr = await freshManager()
    await mgr.loadSession()
    await vi.advanceTimersByTimeAsync(3_100)

    expect(mgr.getState().user).toEqual(USER)
  })

  // R38 (16/10) — « La démo se prépare » > 70 s puis rechargement manuel : la reprise s'arrêtait après 3 essais.
  it('onglet de démo : la session reprend TOUTE SEULE bien après les trois essais, sans rechargement', async () => {
    const { markTabAsDemo, forgetTabDemoFlag } = await import('./demo-tab')
    markTabAsDemo()
    try {
      hasLoggedInCookieMock.mockReturnValue(true)
      sessionCall.mockRejectedValue(new ApiError('unavailable', 503))
      refreshCall.mockRejectedValue(new ApiError('unavailable', 503))

      const mgr = await freshManager()
      await mgr.loadSession()
      await vi.advanceTimersByTimeAsync(3_000 + 10_000 + 30_000 + 5_000)
      expect(mgr.getState().sessionUnavailable).toBe(true)

      // La salle répond enfin (plus de 70 s après) : le prochain essai automatique la reprend.
      sessionCall.mockReset()
      sessionCall.mockResolvedValue({ user: USER })
      await vi.advanceTimersByTimeAsync(31_000)

      expect(mgr.getState().user).toEqual(USER)
      expect(mgr.getState().sessionUnavailable).toBe(false)
    } finally {
      forgetTabDemoFlag()
    }
  })

  it('hors démo : après les trois essais, plus de minuteur (les réveils prennent le relais)', async () => {
    hasLoggedInCookieMock.mockReturnValue(true)
    sessionCall.mockRejectedValue(new ApiError('unavailable', 503))
    refreshCall.mockRejectedValue(new ApiError('unavailable', 503))

    const mgr = await freshManager()
    await mgr.loadSession()
    await vi.advanceTimersByTimeAsync(3_000 + 10_000 + 30_000 + 5_000)
    sessionCall.mockReset()
    sessionCall.mockResolvedValue({ user: USER })
    await vi.advanceTimersByTimeAsync(120_000)

    expect(mgr.getState().user).toBeNull()
  })

  it('session vraiment invalide (401) → nettoyage complet', async () => {
    hasLoggedInCookieMock.mockReturnValue(false)
    refreshCall.mockRejectedValue(new ApiError('unauthorized', 401))

    const mgr = await freshManager()
    const purgesBefore = clearClientUserStateMock.mock.calls.length
    await mgr.loadSession()

    expect(mgr.getState().user).toBeNull()
    expect(mgr.getState().sessionUnavailable).toBe(false)
    expect(clearClientUserStateMock.mock.calls.length).toBeGreaterThan(purgesBefore)
  })

  it('sentinel present but access probe 401s → falls back to refresh', async () => {
    hasLoggedInCookieMock.mockReturnValue(true)
    sessionCall.mockRejectedValue(new ApiError('unauthorized', 401))
    refreshCall.mockResolvedValue({ user: USER, expires_at: null })

    const mgr = await freshManager()
    await mgr.loadSession()

    expect(sessionCall).toHaveBeenCalledTimes(1)
    expect(refreshCall).toHaveBeenCalledTimes(1)
    expect(mgr.getState().user).toEqual(USER)
  })
})

// #3243 (recette prod 03/10) — « le 1er rechargement de /chat a renvoyé à /login » : un
// jeton d'accès EXPIRÉ dont le refresh est valide ne doit JAMAIS renvoyer à /login. Le repère
// `loggedIn:` vit aussi longtemps que le refresh (365 j côté API), pas que l'accès : il est
// donc lisible au rechargement, et le démarrage sonde puis rafraîchit.
describe('SessionManager — accès expiré, refresh valide (#3243)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sessionCall.mockReset()
    refreshCall.mockReset()
    hasLoggedInCookieMock.mockReset()
    clearClientUserStateMock.mockReset()
    hasLoggedInCookieMock.mockReturnValue(true)
    sessionCall.mockRejectedValue(new ApiError('unauthorized', 401))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('le refresh valide rétablit l’utilisateur : ni purge, ni état « déconnecté »', async () => {
    refreshCall.mockResolvedValue({ user: USER, expires_at: null })
    const mgr = await freshManager()
    await mgr.loadSession()
    expect(mgr.getState()).toMatchObject({ user: USER, loading: false, sessionUnavailable: false })
    expect(clearClientUserStateMock).not.toHaveBeenCalled()
  })

  it('refresh muet (réseau coupé) avec le repère lisible : on ATTEND, on ne déconnecte pas', async () => {
    refreshCall.mockRejectedValue(new TypeError('Failed to fetch'))
    const mgr = await freshManager()
    await mgr.loadSession()
    expect(mgr.getState()).toMatchObject({ user: null, sessionUnavailable: true })
    expect(clearClientUserStateMock).not.toHaveBeenCalled()
  })

  it('⚠️ SAIT DIRE NON — refresh REFUSÉ (401) : état vidé, jamais de page protégée sans session valide', async () => {
    refreshCall.mockRejectedValue(new ApiError('unauthorized', 401))
    const mgr = await freshManager()
    await mgr.loadSession()
    expect(mgr.getState()).toMatchObject({ user: null, sessionUnavailable: false })
    expect(clearClientUserStateMock).toHaveBeenCalled()
  })
})

/**
 * R15-7 (15/09/2026) — un appareil révoqué (plafond d'appareils, ou
 * « déconnecter cet appareil » depuis un autre) ne reste pas une coquille
 * vide : l'état d'auth est vidé ET l'avis de révocation est levé. Une 401
 * ordinaire garde son chemin (état vidé, pas d'avis).
 */
describe('SessionManager — appareil révoqué', () => {
  const revoked = () => new ApiError('Session révoquée sur cet appareil', 401, 'session_revoked')

  beforeEach(() => {
    vi.useFakeTimers()
    sessionCall.mockReset()
    refreshCall.mockReset()
    hasLoggedInCookieMock.mockReset()
    clearClientUserStateMock.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('refresh refusé `session_revoked` → état vidé ET avis de révocation levé', async () => {
    hasLoggedInCookieMock.mockReturnValue(false)
    refreshCall.mockRejectedValue(revoked())

    const mgr = await freshManager()
    await mgr.loadSession()

    expect(mgr.getState().user).toBeNull()
    expect(mgr.getState().sessionRevoked).toBe(true)
    expect(clearClientUserStateMock).toHaveBeenCalled()
  })

  it('NON — une 401 ordinaire vide l’état SANS avis de révocation', async () => {
    hasLoggedInCookieMock.mockReturnValue(false)
    refreshCall.mockRejectedValue(new ApiError('unauthorized', 401))

    const mgr = await freshManager()
    await mgr.loadSession()

    expect(mgr.getState().user).toBeNull()
    expect(mgr.getState().sessionRevoked).toBe(false)
  })

  it('l’avis acquitté ne revient pas avant une nouvelle session, puis revient', async () => {
    hasLoggedInCookieMock.mockReturnValue(false)
    refreshCall.mockRejectedValue(revoked())

    const mgr = await freshManager()
    await mgr.loadSession()
    mgr.acknowledgeRevocation()
    expect(mgr.getState().sessionRevoked).toBe(false)

    // Une autre requête de l'appareil révoqué reprend la même 401 : pas de
    // second avis, la personne est déjà en route vers la connexion.
    await mgr.refreshSession()
    expect(mgr.getState().sessionRevoked).toBe(false)

    // Reconnectée, puis révoquée à nouveau : l'avis est dû.
    mgr.applySession({ user: USER as never, expires_at: null })
    await mgr.refreshSession()
    expect(mgr.getState().sessionRevoked).toBe(true)
  })
})

/**
 * Constat production du 27/09/2026 : un visiteur de la démonstration qui
 * perdait sa session (401 ordinaire, appareil révoqué, jeton expiré)
 * atterrissait sur `/login` — un mur pour quelqu'un sans compte. `RedirectTo`
 * décide de la destination en lisant `demo-tab.ts` ; ce marqueur doit donc
 * survivre à un `clear()` involontaire et ne s'effacer que sur déconnexion
 * EXPLICITE.
 */
describe('SessionManager — le marqueur de démonstration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sessionCall.mockReset()
    refreshCall.mockReset()
    hasLoggedInCookieMock.mockReset()
    clearClientUserStateMock.mockReset()
    window.sessionStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('un 401 ordinaire vide la session SANS effacer le marqueur de démonstration', async () => {
    const { markTabAsDemo, isTabDemo } = await import('./demo-tab')
    markTabAsDemo()
    hasLoggedInCookieMock.mockReturnValue(false)
    refreshCall.mockRejectedValue(new ApiError('unauthorized', 401))

    const mgr = await freshManager()
    await mgr.loadSession()

    expect(mgr.getState().user).toBeNull()
    expect(isTabDemo()).toBe(true)
  })

  it('une déconnexion EXPLICITE efface le marqueur de démonstration', async () => {
    const { markTabAsDemo, isTabDemo } = await import('./demo-tab')
    markTabAsDemo()

    const mgr = await freshManager()
    await mgr.logout()

    expect(isTabDemo()).toBe(false)
  })
})

/**
 * #3511 — « une session démo tient au moins 60 min d'activité, avec
 * renouvellement silencieux tant que la personne navigue ». Le battement de
 * 10 min (`DEMO_KEEPALIVE_MS`) existait sans test : on rejoue ici une heure.
 */
describe('SessionManager — battement de la salle démo (#3511)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sessionCall.mockReset()
    refreshCall.mockReset()
    hasLoggedInCookieMock.mockReset()
    clearClientUserStateMock.mockReset()
    window.sessionStorage.clear()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  async function demoManager() {
    const { markTabAsDemo } = await import('./demo-tab')
    markTabAsDemo()
    hasLoggedInCookieMock.mockReturnValue(true)
    sessionCall.mockResolvedValue({ user: USER })
    refreshCall.mockResolvedValue({ user: USER, expires_at: null })
    const mgr = await freshManager()
    await mgr.loadSession()
    return mgr
  }

  it('onglet démo visible pendant 60 min → au moins 5 renouvellements, la session reste là', async () => {
    const mgr = await demoManager()
    expect(refreshCall).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)

    expect(refreshCall.mock.calls.length).toBeGreaterThanOrEqual(5)
    expect(mgr.getState().user).toEqual(USER)
  })

  it('onglet démo caché → aucun battement (on ne garde pas vivante une salle que personne ne regarde)', async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    await demoManager()

    await vi.advanceTimersByTimeAsync(30 * 60 * 1000)

    expect(refreshCall).not.toHaveBeenCalled()
  })

  it('onglet ordinaire → pas de battement de 10 min (règles de session de la production intactes)', async () => {
    hasLoggedInCookieMock.mockReturnValue(true)
    sessionCall.mockResolvedValue({ user: USER })
    refreshCall.mockResolvedValue({ user: USER, expires_at: null })
    const mgr = await freshManager()
    await mgr.loadSession()

    await vi.advanceTimersByTimeAsync(20 * 60 * 1000)

    expect(refreshCall).not.toHaveBeenCalled()
  })
})

/**
 * 29/09/2026 — juste après une déconnexion VOLONTAIRE, l'ancien cookie reprenait
 * une 401 `session_revoked` et l'avis « déconnecté de cet appareil » bloquait
 * `/demo/acces`. Une sortie volontaire n'est pas une révocation à distance.
 */
describe('SessionManager — déconnexion volontaire vs révocation', () => {
  const revoked = () => new ApiError('Session révoquée sur cet appareil', 401, 'session_revoked')

  beforeEach(() => {
    vi.useFakeTimers()
    sessionCall.mockReset()
    refreshCall.mockReset()
    hasLoggedInCookieMock.mockReset()
    clearClientUserStateMock.mockReset()
    window.sessionStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('NON — après « Déconnexion », une 401 session_revoked (même après rechargement) ne lève pas l’avis', async () => {
    hasLoggedInCookieMock.mockReturnValue(false)
    refreshCall.mockRejectedValue(revoked())

    const first = await freshManager()
    await first.logout()
    await first.refreshSession()
    expect(first.getState().sessionRevoked).toBe(false)

    // Rechargement de l'onglet : nouveau gestionnaire, même sessionStorage.
    const reloaded = await freshManager()
    await reloaded.loadSession()
    expect(reloaded.getState().sessionRevoked).toBe(false)
  })

  it('une nouvelle session ré-arme l’avis de révocation', async () => {
    hasLoggedInCookieMock.mockReturnValue(false)
    refreshCall.mockRejectedValue(revoked())

    const mgr = await freshManager()
    await mgr.logout()
    mgr.applySession({ user: USER as never, expires_at: null })
    await mgr.refreshSession()
    expect(mgr.getState().sessionRevoked).toBe(true)
  })
})

describe('SessionManager — un boot tombé pendant une panne se rejoue (#3243, régression 03/10)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sessionCall.mockReset()
    refreshCall.mockReset()
    hasLoggedInCookieMock.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('« Failed to fetch » au boot → indisponible, PUIS la session se rétablit seule au réessai', async () => {
    // Avec jeton lisible (session probablement vivante) : on retient les gardes.
    hasLoggedInCookieMock.mockReturnValue(true)
    sessionCall.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    sessionCall.mockResolvedValueOnce({ user: USER })

    const mgr = await freshManager()
    await mgr.loadSession()
    expect(mgr.getState()).toMatchObject({ user: null, sessionUnavailable: true })

    await vi.advanceTimersByTimeAsync(5_000)

    expect(sessionCall).toHaveBeenCalledTimes(2)
    expect(mgr.getState()).toMatchObject({ user: USER, sessionUnavailable: false })
  })

  it('le réessai s’arrête sur un vrai refus : /login est alors légitime', async () => {
    hasLoggedInCookieMock.mockReturnValue(false)
    refreshCall.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    refreshCall.mockRejectedValueOnce(new ApiError('expired', 401))

    const mgr = await freshManager()
    await mgr.loadSession()
    await vi.advanceTimersByTimeAsync(5_000)

    expect(mgr.getState()).toMatchObject({ user: null, sessionUnavailable: false })
    await vi.advanceTimersByTimeAsync(120_000)
    expect(refreshCall).toHaveBeenCalledTimes(2)
  })
})
