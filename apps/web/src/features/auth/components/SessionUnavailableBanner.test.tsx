import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionUnavailableBanner } from './SessionUnavailableBanner'

const mocks = vi.hoisted(() => ({
  sessionUnavailable: false,
  sessionRevoked: false,
  user: null as { id: string } | null,
  tabDemo: false,
}))

vi.mock('../demo-tab', () => ({ isTabDemo: () => mocks.tabDemo }))

vi.mock('../session-manager', () => ({
  sessionManager: {
    subscribe: () => () => undefined,
    getState: () => ({
      user: mocks.user,
      loading: false,
      sessionUnavailable: mocks.sessionUnavailable,
      sessionRevoked: mocks.sessionRevoked,
    }),
  },
}))

/**
 * #2435.6 — une panne serveur n'est pas une déconnexion.
 *
 * `sessionUnavailable` (session-manager.ts:17, posé le 15/09 par `markUnavailable()`)
 * était mesuré et jamais lu : `SessionProvider` ne le faisait pas traverser
 * jusqu'à React. Ce bandeau lit l'état DIRECTEMENT, comme `SessionRevokedNotice`
 * lit le sien (même grammaire, pas de doublon dans `SessionContextValue`).
 *
 * Ces deux tests prouvent la DISTINCTION, pas juste un texte ajouté :
 *  1. panne serveur → CE bandeau apparaît ;
 *  2. jeton expiré / session révoquée → CE bandeau reste muet (c'est l'AUTRE
 *     message, celui de `SessionRevokedNotice` ou le retour ordinaire à
 *     l'écran de connexion).
 */
describe('SessionUnavailableBanner', () => {
  beforeEach(() => {
    mocks.sessionUnavailable = false
    mocks.sessionRevoked = false
    mocks.user = null
    mocks.tabDemo = false
  })

  it('markUnavailable() → le bandeau de panne serveur apparaît, avec un rôle annoncé aux lecteurs d’écran', () => {
    mocks.sessionUnavailable = true
    render(<SessionUnavailableBanner />)

    const banner = screen.getByRole('alert')
    expect(banner.textContent).not.toMatch(/sessionUnavailable\./)
    expect(banner.textContent?.length).toBeGreaterThan(0)
  })

  it('ne redirige nulle part : aucun lien ni bouton de connexion dans le bandeau', () => {
    mocks.sessionUnavailable = true
    render(<SessionUnavailableBanner />)

    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('NON — session révoquée seule (jeton mort) : ce n’est pas ce message', () => {
    mocks.sessionUnavailable = false
    mocks.sessionRevoked = true
    const { container } = render(<SessionUnavailableBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('NON — session simplement absente (déconnexion ordinaire, jeton expiré) : rien à dire ici', () => {
    mocks.sessionUnavailable = false
    mocks.user = null
    const { container } = render(<SessionUnavailableBanner />)
    expect(container).toBeEmptyDOMElement()
  })
  /**
   * R35 (16/10/2026) — un visiteur de démo ne lit JAMAIS « Le serveur ne répond pas » : la salle se remet en état
   * (purge + re-semis, quelques dizaines de secondes), ce n'est pas une panne. L'écran le dit honnêtement.
   */
  it('R35 — onglet de démonstration : « La démo se prépare », jamais « Le serveur ne répond pas »', () => {
    mocks.sessionUnavailable = true
    mocks.tabDemo = true
    render(<SessionUnavailableBanner />)

    const banner = screen.getByRole('status')
    expect(banner.textContent).toMatch(/démo se prépare|demo is getting ready|sessionUnavailable\.demo/i)
    expect(banner.textContent).not.toMatch(/ne répond pas|isn't responding/i)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('R35 — hors démonstration, la vraie panne garde son bandeau d’alerte', () => {
    mocks.sessionUnavailable = true
    render(<SessionUnavailableBanner />)

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
