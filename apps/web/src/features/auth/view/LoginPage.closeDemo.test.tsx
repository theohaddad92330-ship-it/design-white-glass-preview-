import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'

/**
 * #3788.3 — recette 07/10 : la session démo pouvait encore être en train de se
 * fermer (`useCloseDemoOnLogin`, appel réseau à `/auth/logout`) au moment où
 * le formulaire restait cliquable. Une vraie connexion soumise PENDANT cette
 * fenêtre déclenchait `sessionManager.login()` en même temps que la fermeture
 * de la démo encore en vol — qui, en résolvant plus tard, écrasait la session
 * réelle tout juste posée (`this.clear()` après coup). Tant que la fermeture
 * n'est pas terminée, le formulaire ne doit pas exister : la vraie connexion
 * ne peut être tentée qu'une fois la démo réellement fermée.
 */
const h = vi.hoisted(() => ({ closing: false, checking: false }))
vi.mock('@/features/auth/components/AuthBrandingPanel', () => ({ AuthBrandingPanel: () => null }))
vi.mock('@/features/auth/components/LoginCard', () => ({ LoginCard: () => <div data-testid="login-card" /> }))
vi.mock('@/features/auth/hooks/useRedirectAfterAuth', () => ({ useRedirectAfterAuth: () => undefined }))
vi.mock('@/features/auth/hooks/useCloseDemoOnLogin', () => ({
  useCloseDemoOnLogin: () => ({ closing: h.closing, checking: h.checking }),
}))

describe('LoginPage — ferme la démo avant toute vraie connexion (#3788.3)', () => {
  it('ne rend pas le formulaire tant que la session démo est en train de se fermer', () => {
    h.closing = true
    render(<LoginPage />)
    expect(screen.queryByTestId('login-card')).not.toBeInTheDocument()
    expect(screen.getByText('Fermeture de la démonstration')).toBeInTheDocument()
  })

  // #5024 — tant que le serveur n'a pas dit si la session posée est une démo, le formulaire n'existe pas
  // non plus (même course que #3788.3), et l'écran ne prétend pas « fermer la démonstration ».
  it('ne rend pas le formulaire tant que le statut démo de la session est inconnu', () => {
    h.closing = false
    h.checking = true
    render(<LoginPage />)
    expect(screen.queryByTestId('login-card')).not.toBeInTheDocument()
    expect(screen.getByText('Vérification de ta session')).toBeInTheDocument()
    expect(screen.queryByText('Fermeture de la démonstration')).not.toBeInTheDocument()
  })

  it('rend le formulaire une fois la session démo fermée', () => {
    h.closing = false
    h.checking = false
    render(<LoginPage />)
    expect(screen.getByTestId('login-card')).toBeInTheDocument()
    expect(screen.queryByText('Fermeture de la démonstration')).not.toBeInTheDocument()
  })
})
