import { beforeEach, describe, expect, it } from 'vitest'
import { forgetTabDemoFlag, isTabDemo, markTabAsDemo } from './demo-tab'

/**
 * Constat production du 27/09/2026 : un visiteur de la démonstration qui
 * perdait sa session (401, appareil révoqué, jeton expiré) atterrissait sur
 * `/login` — un mur pour quelqu'un qui n'a ni compte ni mot de passe. La
 * bannière « MODE DÉMO » disparaissait sans explication.
 *
 * Ce marqueur est SÉPARÉ de `tab-identity.ts` : il doit survivre à un `clear()`
 * involontaire (401 ordinaire) — c'est justement ce qui permet à `RedirectTo`
 * de savoir, une fois `user` redevenu `null`, qu'il doit renvoyer vers
 * `/demo/acces` plutôt que `/login`. Seule une déconnexion EXPLICITE (bouton
 * « Quitter » du bandeau démo, vraie connexion) l'efface.
 */
describe('marqueur « cet onglet est en démonstration »', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('absent par défaut — un onglet ordinaire ne se croit jamais démo', () => {
    expect(isTabDemo()).toBe(false)
  })

  it('se pose à l’entrée en démo et se relit', () => {
    markTabAsDemo()
    expect(isTabDemo()).toBe(true)
  })

  it('reste dans sessionStorage — jamais dans localStorage, que les onglets partagent', () => {
    markTabAsDemo()
    expect(window.sessionStorage.getItem('bellum.tab.demo')).toBe('1')
    expect(window.localStorage.getItem('bellum.tab.demo')).toBeNull()
  })

  it('s’oublie sur une déconnexion EXPLICITE', () => {
    markTabAsDemo()
    forgetTabDemoFlag()
    expect(isTabDemo()).toBe(false)
  })
})
