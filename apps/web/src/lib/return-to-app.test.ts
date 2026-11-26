import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTINGS_SECTIONS } from '@/components/sidebar/items.settings'
import {
  consumeReturnToAppScrollIfMatching,
  isSettingsPath,
  readReturnToApp,
  rememberReturnToApp,
  trackContentScrollTop,
} from './return-to-app'

/**
 * #2112.23-25 — LA PAGE D'ORIGINE DES RÉGLAGES.
 *
 * `SettingsNavbarBody.tsx:112` codait `to="/dashboard"` en dur — confirmé faux
 * par le registre (#2112.23, #2112.25) : quitter les Réglages ramenait
 * toujours au Tableau de bord, quelle que soit la page quittée pour y entrer.
 */
describe('#2112.23-25 — la page d’origine des Réglages', () => {
  beforeEach(() => sessionStorage.clear())

  it('retient l’origine en ENTRANT dans les Réglages depuis une autre page', () => {
    rememberReturnToApp({ pathname: '/accounts', href: '/accounts?tab=contacts' }, '/settings/profile')
    expect(readReturnToApp()).toBe('/accounts?tab=contacts')
  })

  it('ne retient rien sans page d’origine — chargement direct sur /settings', () => {
    rememberReturnToApp(null, '/settings')
    expect(readReturnToApp()).toBeNull()
  })

  it('ignore une navigation qui ne MÈNE pas aux Réglages', () => {
    rememberReturnToApp({ pathname: '/accounts', href: '/accounts' }, '/contacts')
    expect(readReturnToApp()).toBeNull()
  })

  it('une navigation INTERNE aux Réglages n’écrase JAMAIS l’origine déjà retenue', () => {
    rememberReturnToApp({ pathname: '/missions', href: '/missions' }, '/settings')
    rememberReturnToApp({ pathname: '/settings', href: '/settings' }, '/settings/security')
    expect(readReturnToApp()).toBe('/missions')
  })

  it('une DEUXIÈME entrée depuis l’extérieur remplace l’origine précédente', () => {
    rememberReturnToApp({ pathname: '/missions', href: '/missions' }, '/settings')
    rememberReturnToApp({ pathname: '/settings', href: '/settings' }, '/chat')
    rememberReturnToApp({ pathname: '/chat', href: '/chat' }, '/settings/profile')
    expect(readReturnToApp()).toBe('/chat')
  })

  it('un stockage qui lève (navigation privée, quota) ne casse rien', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('quota exceeded')
      },
      setItem: () => {
        throw new Error('quota exceeded')
      },
    })
    expect(() => rememberReturnToApp({ pathname: '/accounts', href: '/accounts' }, '/settings')).not.toThrow()
    expect(readReturnToApp()).toBeNull()
    vi.unstubAllGlobals()
  })
})

/**
 * #2145.19 — « RETOUR À L'APP » RAMÈNE AUSSI AU SCROLL QUITTÉ.
 *
 * `rememberReturnToApp` retenait déjà la route, ses filtres et son objet (le
 * `href` complet) — jamais la position de défilement, propriété du CONTENEUR
 * qui défile réellement (`CustomerPageContent.tsx`, pas la fenêtre). Ce bloc
 * couvre la mémoire (`trackContentScrollTop`, mise à jour en continu pendant
 * la visite) et la consommation (`consumeReturnToAppScrollIfMatching`),
 * restituée UNE SEULE fois et SEULEMENT sur la page d'origine exacte — jamais
 * sur une autre page arrivée par un autre chemin.
 */
describe('#2145.19 — le scroll quitté, restitué au retour', () => {
  beforeEach(() => {
    sessionStorage.clear()
    trackContentScrollTop(0)
  })

  it('retient le dernier défilement connu au moment d’ENTRER dans les Réglages', () => {
    trackContentScrollTop(420)
    rememberReturnToApp({ pathname: '/accounts', href: '/accounts?tab=contacts' }, '/settings/profile')
    expect(consumeReturnToAppScrollIfMatching('/accounts?tab=contacts')).toBe(420)
  })

  it('ne restitue rien sur une page différente de l’origine exacte', () => {
    trackContentScrollTop(420)
    rememberReturnToApp({ pathname: '/accounts', href: '/accounts?tab=contacts' }, '/settings/profile')
    expect(consumeReturnToAppScrollIfMatching('/accounts?tab=autre')).toBeNull()
  })

  it('ne se restitue qu’UNE fois — une deuxième lecture retombe sur 0, pas sur 420 à nouveau', () => {
    trackContentScrollTop(420)
    rememberReturnToApp({ pathname: '/accounts', href: '/accounts' }, '/settings')
    expect(consumeReturnToAppScrollIfMatching('/accounts')).toBe(420)
    expect(consumeReturnToAppScrollIfMatching('/accounts')).toBe(0)
  })

  it('une navigation INTERNE aux Réglages ne réécrase pas le défilement déjà retenu', () => {
    trackContentScrollTop(300)
    rememberReturnToApp({ pathname: '/missions', href: '/missions' }, '/settings')
    trackContentScrollTop(999) // défilement DANS les Réglages — jamais celui de l'origine
    rememberReturnToApp({ pathname: '/settings', href: '/settings' }, '/settings/security')
    expect(consumeReturnToAppScrollIfMatching('/missions')).toBe(300)
  })

  it('sans défilement connu (page jamais défilée), retombe sur 0 — jamais une exception', () => {
    rememberReturnToApp({ pathname: '/accounts', href: '/accounts' }, '/settings')
    expect(consumeReturnToAppScrollIfMatching('/accounts')).toBe(0)
  })

  it('un stockage qui lève (navigation privée, quota) ne casse rien', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('quota exceeded')
      },
      setItem: () => {
        throw new Error('quota exceeded')
      },
      removeItem: () => {
        throw new Error('quota exceeded')
      },
    })
    expect(() => consumeReturnToAppScrollIfMatching('/accounts')).not.toThrow()
    expect(consumeReturnToAppScrollIfMatching('/accounts')).toBeNull()
    vi.unstubAllGlobals()
  })

  // #4534 — le menu des Paramètres affiche aussi /integrations et /billing, hors du préfixe /settings.
  it('#4534 — /accounts → /integrations → /settings/preferences : l’origine reste /accounts', () => {
    rememberReturnToApp({ pathname: '/accounts', href: '/accounts' }, '/integrations')
    rememberReturnToApp({ pathname: '/integrations', href: '/integrations' }, '/settings/preferences')
    expect(readReturnToApp()).toBe('/accounts')
  })

  it('#4534 — /billing → /settings/x ne retient pas /billing', () => {
    rememberReturnToApp({ pathname: '/accounts', href: '/accounts' }, '/billing')
    rememberReturnToApp({ pathname: '/billing', href: '/billing' }, '/settings/x')
    expect(readReturnToApp()).toBe('/accounts')
  })

  it('#4534 — chaque `to` de items.settings.ts est une page des Réglages', () => {
    for (const section of SETTINGS_SECTIONS) {
      for (const item of section.items) {
        sessionStorage.clear()
        rememberReturnToApp({ pathname: '/accounts', href: '/accounts' }, String(item.to))
        expect(readReturnToApp(), String(item.to)).toBe('/accounts')
      }
    }
  })
})

/**
 * #4534.1-3 — « Retour à l'app » : TOUTE page du menu des Paramètres est une page des Paramètres.
 *
 * `/integrations` et `/billing` sont des entrées du menu mais ne commencent pas par `/settings` : elles étaient
 * retenues comme ORIGINE, et « Retour à l'app » ramenait à l'écran des Paramètres qu'on venait de quitter.
 * La liste est DÉRIVÉE des `to` de `items.settings.ts` (un seul endroit, GA-26).
 */
describe('#4534 — les pages du menu des Paramètres ne sont jamais une origine', () => {
  beforeEach(() => sessionStorage.clear())

  it('/accounts → /integrations → /settings/preferences retient /accounts', () => {
    rememberReturnToApp({ pathname: '/accounts', href: '/accounts' }, '/integrations')
    rememberReturnToApp({ pathname: '/integrations', href: '/integrations' }, '/settings/preferences')
    expect(readReturnToApp()).toBe('/accounts')
  })

  it('/billing → /settings/x ne retient pas /billing', () => {
    rememberReturnToApp({ pathname: '/billing', href: '/billing' }, '/settings/security')
    expect(readReturnToApp()).toBeNull()
  })

  it('entrer dans /integrations ou /billing depuis l’app retient l’origine', () => {
    rememberReturnToApp({ pathname: '/missions', href: '/missions?x=1' }, '/billing')
    expect(readReturnToApp()).toBe('/missions?x=1')
    rememberReturnToApp({ pathname: '/chat', href: '/chat' }, '/integrations')
    expect(readReturnToApp()).toBe('/chat')
  })

  it('chaque `to` du menu des Paramètres est reconnu (et ses sous-adresses)', () => {
    const tos = SETTINGS_SECTIONS.flatMap(section => section.items).map(item => String(item.to))
    expect(tos.length).toBeGreaterThan(10)
    for (const to of tos) {
      expect(isSettingsPath(to), to).toBe(true)
      expect(isSettingsPath(`${to}/x`), `${to}/x`).toBe(true)
    }
  })

  it('les adresses retirées du menu (redirections) restent reconnues', () => {
    expect(isSettingsPath('/settings/import')).toBe(true)
    expect(isSettingsPath('/settings/vivier-export')).toBe(true)
  })

  it('une page de l’app n’est pas une page des Paramètres', () => {
    expect(isSettingsPath('/accounts')).toBe(false)
    expect(isSettingsPath('/billing-report')).toBe(false)
  })
})

/**
 * #4534.1-3 — « Retour à l'app » : TOUTE page du menu des Paramètres est une page des Paramètres.
 *
 * `/integrations` et `/billing` sont des entrées du menu mais ne commencent pas par `/settings` : elles étaient
 * retenues comme ORIGINE, et « Retour à l'app » ramenait à l'écran des Paramètres qu'on venait de quitter.
 * La liste est DÉRIVÉE des `to` de `items.settings.ts` (un seul endroit, GA-26).
 */
describe('#4534 — les pages du menu des Paramètres ne sont jamais une origine', () => {
  beforeEach(() => sessionStorage.clear())

  it('/accounts → /integrations → /settings/preferences retient /accounts', () => {
    rememberReturnToApp({ pathname: '/accounts', href: '/accounts' }, '/integrations')
    rememberReturnToApp({ pathname: '/integrations', href: '/integrations' }, '/settings/preferences')
    expect(readReturnToApp()).toBe('/accounts')
  })

  it('/billing → /settings/x ne retient pas /billing', () => {
    rememberReturnToApp({ pathname: '/billing', href: '/billing' }, '/settings/security')
    expect(readReturnToApp()).toBeNull()
  })

  it('entrer dans /integrations ou /billing depuis l’app retient l’origine', () => {
    rememberReturnToApp({ pathname: '/missions', href: '/missions?x=1' }, '/billing')
    expect(readReturnToApp()).toBe('/missions?x=1')
    rememberReturnToApp({ pathname: '/chat', href: '/chat' }, '/integrations')
    expect(readReturnToApp()).toBe('/chat')
  })

  it('chaque `to` du menu des Paramètres est reconnu (et ses sous-adresses)', () => {
    const tos = SETTINGS_SECTIONS.flatMap(section => section.items).map(item => String(item.to))
    expect(tos.length).toBeGreaterThan(10)
    for (const to of tos) {
      expect(isSettingsPath(to), to).toBe(true)
      expect(isSettingsPath(`${to}/x`), `${to}/x`).toBe(true)
    }
  })

  it('les adresses retirées du menu (redirections) restent reconnues', () => {
    expect(isSettingsPath('/settings/import')).toBe(true)
    expect(isSettingsPath('/settings/vivier-export')).toBe(true)
  })

  it('une page de l’app n’est pas une page des Paramètres', () => {
    expect(isSettingsPath('/accounts')).toBe(false)
    expect(isSettingsPath('/billing-report')).toBe(false)
  })
})
