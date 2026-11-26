import { ACCEPT_ALL_CONSENT, CONSENT_COOKIE_NAME, REJECT_ALL_CONSENT, saveCookieConsent } from '@bellum/consent'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initAnalytics, track } from './analytics'

const ENV = import.meta.env as Record<string, unknown>

function setDomain(value: string | undefined) {
  if (value === undefined) delete ENV.VITE_PLAUSIBLE_DOMAIN
  else ENV.VITE_PLAUSIBLE_DOMAIN = value
}

function clearConsent() {
  for (const domain of ['', ';domain=.localhost', ';domain=localhost']) {
    document.cookie = `${CONSENT_COOKIE_NAME}=;path=/;max-age=0${domain}`
  }
}

beforeEach(() => {
  clearConsent()
})

afterEach(() => {
  setDomain(undefined)
  delete ENV.VITE_PLAUSIBLE_SRC
  document.head.querySelectorAll('script[data-domain]').forEach(node => node.remove())
  delete (globalThis as { plausible?: unknown }).plausible
  clearConsent()
})

describe('analytics (Plausible) — les deux conditions', () => {
  it('n’injecte RIEN sans domaine configuré', () => {
    // No-op strict : un environnement sans mesure d'audience ne fait aucune
    // requête réseau et ne change pas d'un octet.
    saveCookieConsent(ACCEPT_ALL_CONSENT)

    initAnalytics()

    expect(document.head.querySelector('script[data-domain]')).toBeNull()
  })

  it('n’injecte RIEN tant que le visiteur n’a pas répondu', () => {
    // « Pas encore répondu » n'est pas « oui ». Le domaine est configuré, donc
    // la seule chose qui retient le script ici est le consentement.
    setDomain('app.bellum-ai.com')

    initAnalytics()

    expect(document.head.querySelector('script[data-domain]')).toBeNull()
  })

  it('n’injecte RIEN quand le visiteur a refusé', () => {
    setDomain('app.bellum-ai.com')
    saveCookieConsent(REJECT_ALL_CONSENT)

    initAnalytics()

    expect(document.head.querySelector('script[data-domain]')).toBeNull()
  })

  it('injecte le script quand le domaine est configuré ET le consentement donné', () => {
    setDomain('app.bellum-ai.com')
    saveCookieConsent(ACCEPT_ALL_CONSENT)

    initAnalytics()

    const script = document.head.querySelector('script[data-domain]') as HTMLScriptElement | null
    expect(script?.dataset.domain).toBe('app.bellum-ai.com')
    expect(script?.src).toContain('plausible.io')
    expect(script?.defer).toBe(true)
  })

  it('accepte une instance auto-hébergée', () => {
    setDomain('app.bellum-ai.com')
    saveCookieConsent(ACCEPT_ALL_CONSENT)
    ENV.VITE_PLAUSIBLE_SRC = 'https://stats.bellum-ai.com/js/script.js'

    initAnalytics()

    expect((document.head.querySelector('script[data-domain]') as HTMLScriptElement).src).toBe(
      'https://stats.bellum-ai.com/js/script.js',
    )
  })

  it('n’injecte jamais deux fois (StrictMode, rechargement à chaud)', () => {
    setDomain('app.bellum-ai.com')
    saveCookieConsent(ACCEPT_ALL_CONSENT)

    initAnalytics()
    initAnalytics()

    expect(document.head.querySelectorAll('script[data-domain]')).toHaveLength(1)
  })
})

describe('track()', () => {
  it('ne fait rien sans mesure configurée', () => {
    saveCookieConsent(ACCEPT_ALL_CONSENT)
    const plausible = vi.fn()
    ;(globalThis as { plausible?: unknown }).plausible = plausible

    track('demo_started')

    expect(plausible).not.toHaveBeenCalled()
  })

  it('ne fait rien tant que le visiteur n’a pas répondu', () => {
    setDomain('app.bellum-ai.com')
    const plausible = vi.fn()
    ;(globalThis as { plausible?: unknown }).plausible = plausible

    track('demo_started')

    expect(plausible).not.toHaveBeenCalled()
  })

  it('se tait dès le RETRAIT, même script déjà chargé', () => {
    // Un script en mémoire ne se dé-charge pas ; ce que l'on peut garantir,
    // c'est qu'on cesse de lui envoyer quoi que ce soit.
    setDomain('app.bellum-ai.com')
    saveCookieConsent(ACCEPT_ALL_CONSENT)
    const plausible = vi.fn()
    ;(globalThis as { plausible?: unknown }).plausible = plausible
    track('demo_started')
    expect(plausible).toHaveBeenCalledTimes(1)

    saveCookieConsent(REJECT_ALL_CONSENT)
    track('demo_started')

    expect(plausible).toHaveBeenCalledTimes(1)
  })

  it('transmet l’événement et ses propriétés', () => {
    setDomain('app.bellum-ai.com')
    saveCookieConsent(ACCEPT_ALL_CONSENT)
    const plausible = vi.fn()
    ;(globalThis as { plausible?: unknown }).plausible = plausible

    track('demo_started', { source: 'landing' })

    expect(plausible).toHaveBeenCalledWith('demo_started', { props: { source: 'landing' } })
  })

  it('ne casse pas la page si la mesure échoue', () => {
    setDomain('app.bellum-ai.com')
    saveCookieConsent(ACCEPT_ALL_CONSENT)
    ;(globalThis as { plausible?: unknown }).plausible = () => {
      throw new Error('blocked by adblock')
    }

    expect(() => track('demo_started')).not.toThrow()
  })
})
