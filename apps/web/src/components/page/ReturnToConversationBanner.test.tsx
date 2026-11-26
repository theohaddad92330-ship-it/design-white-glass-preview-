import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { resetLauraIntro, useCurrentLauraIntro } from '@/features/laura/bubble/laura-intro-store'
import { ReturnToConversationBanner } from './ReturnToConversationBanner'

let currentSearch: Record<string, unknown> = {}
const navigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ search: currentSearch }),
  useNavigate: () => navigate,
  Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
}))

/** Observe ce que `laura-intro-store` publie, sans dépendre du rendu de la bulle. */
function IntroProbe() {
  const intro = useCurrentLauraIntro()
  return <div data-testid="intro-probe">{intro ? `${intro.label}|${intro.question}` : ''}</div>
}

/**
 * #1933.8 / #1903.20 — depuis une page ouverte par Laura, un bouton « Revenir
 * à la conversation » ramène au fil source. Lit `?from=chat:<id>` sur l'URL
 * COURANTE, quelle que soit la route — même patron que `campaignFromSearch`
 * (`location.search`, jamais `Route.useSearch()`) pour ne dépendre d'AUCUN
 * `validateSearch` par écran : un seul composant couvre tous les écrans que
 * Laura peut ouvrir, sans les modifier un par un.
 */
describe('ReturnToConversationBanner', () => {
  beforeEach(() => {
    currentSearch = {}
    navigate.mockReset()
    resetLauraIntro()
  })

  it('ne rend RIEN sans `?from=chat:<id>` — comportement inchangé sur un écran ouvert autrement', () => {
    render(<ReturnToConversationBanner />)
    expect(screen.queryByRole('button', { name: /Revenir à la conversation/ })).not.toBeInTheDocument()
  })

  it('ne rend RIEN sur un `from` d’une autre nature (ex. celui de `/chat`)', () => {
    currentSearch = { from: 'welcome' }
    render(<ReturnToConversationBanner />)
    expect(screen.queryByRole('button', { name: /Revenir à la conversation/ })).not.toBeInTheDocument()
  })

  it('affiche le bouton quand le lien porte le fil source, et ramène au fil au clic', () => {
    currentSearch = { from: 'chat:thread-42', q: 'DSI' }
    render(<ReturnToConversationBanner />)

    const button = screen.getByRole('button', { name: /Revenir à la conversation/ })
    fireEvent.click(button)

    expect(navigate).toHaveBeenCalledWith({ to: '/chat', search: { conversationId: 'thread-42' } })
  })

  /**
   * #2147.9/.10 (épopée #2785) — l'enveloppe de contexte (`?ctx=`) est
   * INDÉPENDANTE de `from` : une continuité sans fil source peut quand même
   * transporter une raison.
   */
  it('n’affiche AUCUNE raison sans `ctx=` — comportement inchangé sur un écran ouvert autrement', () => {
    currentSearch = {}
    render(<ReturnToConversationBanner />)
    expect(screen.queryByText(/Pourquoi cet écran/)).not.toBeInTheDocument()
  })

  it('affiche la raison transportée par `ctx=`, même SANS `from` (Découvrir → Analyser n’a pas de fil)', () => {
    currentSearch = { ctx: encodeURIComponent(JSON.stringify({ reason: 'Signal récent : levée de fonds' })) }
    render(<ReturnToConversationBanner />)
    expect(screen.getByText('Pourquoi cet écran : Signal récent : levée de fonds')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Revenir à la conversation/ })).not.toBeInTheDocument()
  })

  it('affiche le bouton ET la raison ensemble quand les deux paramètres sont posés', () => {
    currentSearch = {
      from: 'chat:thread-42',
      ctx: encodeURIComponent(JSON.stringify({ reason: 'Angle : recrutement en cours' })),
    }
    render(<ReturnToConversationBanner />)
    expect(screen.getByRole('button', { name: /Revenir à la conversation/ })).toBeInTheDocument()
    expect(screen.getByText('Pourquoi cet écran : Angle : recrutement en cours')).toBeInTheDocument()
  })

  it('n’affiche rien sur un `ctx=` sans raison — jamais une ligne vide', () => {
    currentSearch = { ctx: encodeURIComponent(JSON.stringify({ accountId: 'siren:552032534' })) }
    render(<ReturnToConversationBanner />)
    expect(screen.queryByText(/Pourquoi cet écran/)).not.toBeInTheDocument()
  })

  /**
   * #3452 (retour bêta, 30/09/2026) — « je perds Laura » en quittant /chat via
   * un lien de réponse (ex. « Découvrir ») : à côté du bouton qui RAMÈNE, une
   * amorce se dépose dans le canal déjà tenu par `laura-intro-store` (#1812) —
   * LauraDock (racine du routeur) la lit et s'agrandit bas-droite SANS
   * naviguer. On observe le magasin plutôt que le DOM de la bulle : sur
   * bureau et sans concurrent, `AskLaura` gagne la course et s'efface
   * elle-même de la page (c'est la bulle qui montre l'amorce, jamais les
   * deux à la fois) — le dépôt est donc la preuve qui tient, pas un texte
   * visible ici.
   */
  it('#3452 — dépose une amorce « Continuer avec Laura » dans le canal de la bulle, sans naviguer', () => {
    currentSearch = { from: 'chat:thread-42' }
    render(
      <>
        <ReturnToConversationBanner />
        <IntroProbe />
      </>,
    )

    expect(screen.getByTestId('intro-probe')).toHaveTextContent(
      'Continuer avec Laura|Peux-tu continuer sur ce qu’on vient de voir ?',
    )
    expect(navigate).not.toHaveBeenCalled()
  })

  it('#3452 — aucune amorce déposée sans fil source : rien à continuer', () => {
    currentSearch = {}
    render(
      <>
        <ReturnToConversationBanner />
        <IntroProbe />
      </>,
    )

    expect(screen.getByTestId('intro-probe')).toHaveTextContent('')
  })
})
