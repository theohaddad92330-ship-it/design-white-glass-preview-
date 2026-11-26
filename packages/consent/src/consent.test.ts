import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACCEPT_ALL_CONSENT,
  CONSENT_COOKIE_NAME,
  CONSENT_MAX_AGE_SECONDS,
  LEGACY_CONSENT_STORAGE_KEY,
  REJECT_ALL_CONSENT,
  getCookieConsent,
  isAnalyticsAllowed,
  migrateLegacyCookieConsent,
  saveCookieConsent,
  subscribeCookieConsent,
} from './consent'

/** Efface le cookie de consentement sous toutes les portées possibles. */
function clearConsentCookie(): void {
  for (const domain of ['', ';domain=.localhost', ';domain=localhost']) {
    document.cookie = `${CONSENT_COOKIE_NAME}=;path=/;max-age=0${domain}`
  }
}

/**
 * ⚠️ Mesuré : dans cet environnement, `window.localStorage` est un objet NU —
 * ni `setItem`, ni `getItem`, ni `clear`. Les tests de reprise de l'ancien
 * stockage seraient verts pour la mauvaise raison (l'exception est avalée par
 * le `try` de la migration). On pose donc un stockage minimal, et le premier
 * test vérifie qu'il fonctionne — sinon ces tests-là ne prouveraient rien.
 */
function installLocalStorage(): void {
  const entries = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
      clear: () => entries.clear(),
    },
  })
}

beforeEach(() => {
  clearConsentCookie()
  installLocalStorage()
})

afterEach(() => {
  clearConsentCookie()
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('la porte du consentement', () => {
  it('sans choix exprimé, ne rend RIEN — « pas encore répondu » n’est pas « oui »', () => {
    expect(getCookieConsent()).toBeNull()
    expect(isAnalyticsAllowed()).toBe(false)
  })

  it('sans choix exprimé, n’écrit rien non plus — un refus non exprimé ne se mémorise pas', () => {
    getCookieConsent()
    isAnalyticsAllowed()

    expect(document.cookie).not.toContain(CONSENT_COOKIE_NAME)
  })

  it('un refus est mémorisé, et il ferme la porte', () => {
    saveCookieConsent(REJECT_ALL_CONSENT)

    expect(getCookieConsent()).toEqual({ necessary: true, analytics: false })
    expect(isAnalyticsAllowed()).toBe(false)
  })

  it('un accord ouvre la porte', () => {
    saveCookieConsent(ACCEPT_ALL_CONSENT)

    expect(getCookieConsent()).toEqual({ necessary: true, analytics: true })
    expect(isAnalyticsAllowed()).toBe(true)
  })

  it('un retrait referme la porte', () => {
    saveCookieConsent(ACCEPT_ALL_CONSENT)
    expect(isAnalyticsAllowed()).toBe(true)

    saveCookieConsent(REJECT_ALL_CONSENT)

    expect(isAnalyticsAllowed()).toBe(false)
  })

  it('un cookie illisible vaut « pas de choix », jamais « oui »', () => {
    document.cookie = `${CONSENT_COOKIE_NAME}=pas-du-json;path=/`

    expect(getCookieConsent()).toBeNull()
    expect(isAnalyticsAllowed()).toBe(false)
  })

  it('un cookie au JSON valide mais à la mauvaise FORME vaut « pas de choix »', () => {
    // Dérive de forme : le jour où quelqu'un écrit `{ analytics: "true" }`,
    // une lecture laxiste répondrait « oui » sur une chaîne non vide.
    document.cookie = `${CONSENT_COOKIE_NAME}=${encodeURIComponent(JSON.stringify({ analytics: 'true' }))};path=/`

    expect(getCookieConsent()).toBeNull()
    expect(isAnalyticsAllowed()).toBe(false)
  })

  it('mémorise le choix six mois — la durée que les pages publiques promettent déjà', () => {
    const written: string[] = []
    vi.spyOn(document, 'cookie', 'set').mockImplementation(value => {
      written.push(value)
    })

    saveCookieConsent(ACCEPT_ALL_CONSENT)

    expect(written.at(-1)).toContain(`max-age=${CONSENT_MAX_AGE_SECONDS}`)
    expect(CONSENT_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 183)
  })

  it('pose SameSite=Lax et Path=/ — un cookie de consentement ne voyage pas cross-site', () => {
    const written: string[] = []
    vi.spyOn(document, 'cookie', 'set').mockImplementation(value => {
      written.push(value)
    })

    saveCookieConsent(REJECT_ALL_CONSENT)

    expect(written.at(-1)).toContain('samesite=lax')
    expect(written.at(-1)).toContain('path=/')
  })
})

describe('les abonnés sont prévenus', () => {
  it('un changement de choix réveille les abonnés', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeCookieConsent(listener)

    saveCookieConsent(ACCEPT_ALL_CONSENT)
    expect(listener).toHaveBeenCalledTimes(1)

    saveCookieConsent(REJECT_ALL_CONSENT)
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    saveCookieConsent(ACCEPT_ALL_CONSENT)
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

describe('la reprise du choix déjà exprimé sur le site', () => {
  it('le stockage de test FONCTIONNE — sinon les tests suivants sont borgnes', () => {
    window.localStorage.setItem(LEGACY_CONSENT_STORAGE_KEY, 'témoin')

    expect(window.localStorage.getItem(LEGACY_CONSENT_STORAGE_KEY)).toBe('témoin')
  })

  it('reprend un choix stocké par l’ancienne bannière, sans le réinventer', () => {
    window.localStorage.setItem(LEGACY_CONSENT_STORAGE_KEY, JSON.stringify({ necessary: true, analytics: true }))

    migrateLegacyCookieConsent()

    expect(getCookieConsent()).toEqual({ necessary: true, analytics: true })
    expect(window.localStorage.getItem(LEGACY_CONSENT_STORAGE_KEY)).toBeNull()
  })

  it('reprend aussi un REFUS — on ne redemande pas à quelqu’un qui a déjà dit non', () => {
    window.localStorage.setItem(LEGACY_CONSENT_STORAGE_KEY, JSON.stringify({ necessary: true, analytics: false }))

    migrateLegacyCookieConsent()

    expect(getCookieConsent()).toEqual({ necessary: true, analytics: false })
  })

  it('n’invente rien quand rien n’a été exprimé', () => {
    migrateLegacyCookieConsent()

    expect(getCookieConsent()).toBeNull()
    expect(document.cookie).not.toContain(CONSENT_COOKIE_NAME)
  })

  it('n’écrase JAMAIS un choix récent par un vieux reste de localStorage', () => {
    saveCookieConsent(REJECT_ALL_CONSENT)
    window.localStorage.setItem(LEGACY_CONSENT_STORAGE_KEY, JSON.stringify({ necessary: true, analytics: true }))

    migrateLegacyCookieConsent()

    expect(getCookieConsent()).toEqual({ necessary: true, analytics: false })
  })
})
