import { beforeEach, describe, expect, it, vi } from 'vitest'
import { markTabAsDemo } from '../demo-tab'
import { beginVoluntaryExit, consumePreLoginTarget, endVoluntaryExit, rememberPreLoginTarget } from './pre-login-target'

/**
 * #2145.7 — un lien partagé ou de notification, ouvert SANS session active,
 * ramène après connexion sur l'OBJET demandé — jamais sur la destination
 * générique (`resolveLandingFrom`). Même mécanique que `return-to-app.ts`
 * (une valeur de session, jamais un identifiant durable), pour l'autre porte :
 * celle qui redirige vers `/login` plutôt que vers `/settings`.
 */
describe('#2145.7 — la cible avant connexion', () => {
  beforeEach(() => sessionStorage.clear())

  it('retient une page demandée avant le renvoi vers /login', () => {
    rememberPreLoginTarget('/accounts/acc-1?tab=contacts', '/accounts/acc-1')
    expect(consumePreLoginTarget()).toBe('/accounts/acc-1?tab=contacts')
  })

  it('ne retient jamais une page du parcours de connexion elle-même', () => {
    for (const pathname of ['/login', '/signup', '/welcome', '/onboarding', '/onboarding/plan', '/auth/callback']) {
      rememberPreLoginTarget(pathname, pathname)
    }
    expect(consumePreLoginTarget()).toBeNull()
  })

  it('se consomme une seule fois', () => {
    rememberPreLoginTarget('/accounts/acc-1', '/accounts/acc-1')
    expect(consumePreLoginTarget()).toBe('/accounts/acc-1')
    expect(consumePreLoginTarget()).toBeNull()
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
    expect(() => rememberPreLoginTarget('/accounts/acc-1', '/accounts/acc-1')).not.toThrow()
    expect(consumePreLoginTarget()).toBeNull()
    vi.unstubAllGlobals()
  })
})

/**
 * 29/09/2026 — « Quitter la démonstration » : la page de démo (/accounts/<compte
 * de démo>) était retenue comme cible, puis rejouée sur le compte RÉEL
 * (« Compte introuvable »). Une URL venue de la démo ne sert jamais au réel.
 */
describe('la cible avant connexion — jamais celle de la démonstration', () => {
  beforeEach(() => {
    sessionStorage.clear()
    endVoluntaryExit()
  })

  it('NON — un onglet en démonstration ne retient rien', () => {
    markTabAsDemo()
    rememberPreLoginTarget('/accounts/demo-1', '/accounts/demo-1')
    expect(consumePreLoginTarget()).toBeNull()
  })

  it('NON — pendant une sortie volontaire, rien n’est retenu et l’existant est oublié', () => {
    rememberPreLoginTarget('/accounts/demo-1', '/accounts/demo-1')
    beginVoluntaryExit()
    rememberPreLoginTarget('/accounts/demo-1', '/accounts/demo-1')
    expect(consumePreLoginTarget()).toBeNull()
  })

  it('la sortie finie, les liens profonds sont de nouveau retenus', () => {
    beginVoluntaryExit()
    endVoluntaryExit()
    rememberPreLoginTarget('/accounts/acc-1', '/accounts/acc-1')
    expect(consumePreLoginTarget()).toBe('/accounts/acc-1')
  })
})
