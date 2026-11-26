import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ACCEPT_ALL_CONSENT, CONSENT_COOKIE_NAME, REJECT_ALL_CONSENT, saveCookieConsent } from './consent'
import { AnalyticsConsentGate } from './react'

/**
 * Ce que ces tests vérifient est le cœur du lot : **un traceur ne se charge que
 * derrière la porte**. On mesure les deux effets qui comptent pour un visiteur,
 * pas l'état interne d'un composant :
 *
 *  1. aucune BALISE de script n'apparaît dans le document ;
 *  2. aucune REQUÊTE réseau n'est faite (`fetch` et `sendBeacon` sont espionnés).
 *
 * Le traceur est simulé par un composant qui fait, au montage, exactement ce
 * que fait un vrai traceur : il injecte un `<script src>` et il envoie une
 * mesure. S'il ne se monte pas, ni l'un ni l'autre n'arrive.
 */

// Sans ce drapeau, React avertit à chaque `act(...)` et — surtout — ne garantit
// pas d'avoir vidé sa file avant l'assertion : un test « aucun script » pourrait
// passer parce que le rendu n'a pas encore eu lieu.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const SCRIPT_SRC = 'https://exemple.invalid/traceur.js'

function FakeTracker() {
  const script = document.createElement('script')
  script.src = SCRIPT_SRC
  script.dataset.tracker = 'true'
  document.head.appendChild(script)
  navigator.sendBeacon(SCRIPT_SRC, 'pageview')
  return null
}

let container: HTMLDivElement
let root: Root
let beacons: string[]
let fetches: string[]

function render(node: React.ReactNode): void {
  act(() => {
    root.render(node)
  })
}

function injectedScripts(): NodeListOf<Element> {
  return document.head.querySelectorAll('script[data-tracker]')
}

function clearConsentCookie(): void {
  for (const domain of ['', ';domain=.localhost', ';domain=localhost']) {
    document.cookie = `${CONSENT_COOKIE_NAME}=;path=/;max-age=0${domain}`
  }
}

beforeEach(() => {
  clearConsentCookie()
  beacons = []
  fetches = []
  navigator.sendBeacon = (url: string | URL) => {
    beacons.push(String(url))
    return true
  }
  globalThis.fetch = ((url: RequestInfo | URL) => {
    fetches.push(String(url))
    return Promise.resolve(new Response(null))
  }) as typeof fetch
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
  document.head.querySelectorAll('script[data-tracker]').forEach(node => node.remove())
  clearConsentCookie()
})

describe('AnalyticsConsentGate — les quatre états', () => {
  it('AUCUN CHOIX : aucun script, aucune requête réseau', () => {
    render(
      <AnalyticsConsentGate>
        <FakeTracker />
      </AnalyticsConsentGate>,
    )

    expect(injectedScripts()).toHaveLength(0)
    expect(beacons).toEqual([])
    expect(fetches).toEqual([])
  })

  it('REFUSÉ : aucun script, aucune requête réseau', () => {
    saveCookieConsent(REJECT_ALL_CONSENT)

    render(
      <AnalyticsConsentGate>
        <FakeTracker />
      </AnalyticsConsentGate>,
    )

    expect(injectedScripts()).toHaveLength(0)
    expect(beacons).toEqual([])
    expect(fetches).toEqual([])
  })

  it('ACCORDÉ : le traceur se monte', () => {
    saveCookieConsent(ACCEPT_ALL_CONSENT)

    render(
      <AnalyticsConsentGate>
        <FakeTracker />
      </AnalyticsConsentGate>,
    )

    expect(injectedScripts()).toHaveLength(1)
    expect(beacons).toEqual([SCRIPT_SRC])
  })

  it('RETIRÉ : le traceur est démonté sans attendre un rechargement', () => {
    saveCookieConsent(ACCEPT_ALL_CONSENT)
    render(
      <AnalyticsConsentGate>
        <FakeTracker />
      </AnalyticsConsentGate>,
    )
    expect(injectedScripts()).toHaveLength(1)

    act(() => {
      saveCookieConsent(REJECT_ALL_CONSENT)
    })

    expect(container.innerHTML).toBe('')
  })

  it('RETIRÉ puis re-rendu : il ne se remonte pas', () => {
    saveCookieConsent(ACCEPT_ALL_CONSENT)
    render(
      <AnalyticsConsentGate>
        <FakeTracker />
      </AnalyticsConsentGate>,
    )
    act(() => {
      saveCookieConsent(REJECT_ALL_CONSENT)
    })
    document.head.querySelectorAll('script[data-tracker]').forEach(node => node.remove())
    beacons = []

    render(
      <AnalyticsConsentGate>
        <FakeTracker />
      </AnalyticsConsentGate>,
    )

    expect(injectedScripts()).toHaveLength(0)
    expect(beacons).toEqual([])
  })

  it('le faux traceur SAIT se monter — sinon les quatre tests au-dessus ne prouvent rien', () => {
    // Le canari : sans lui, un `FakeTracker` cassé rendrait tous les cas
    // « aucun script » verts pour la mauvaise raison.
    render(<FakeTracker />)

    expect(injectedScripts()).toHaveLength(1)
    expect(beacons).toEqual([SCRIPT_SRC])
  })
})
