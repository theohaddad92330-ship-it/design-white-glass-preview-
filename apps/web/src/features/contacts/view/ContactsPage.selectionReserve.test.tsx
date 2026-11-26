import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionContext } from '@/features/auth/session-context'

/**
 * #3471 (recette 02/10) — « Ajouter un contact / Importer / Créer une cible »
 * sont dans `ContactsIntro`, FRÈRE de `ContactContent` : le panneau de sélection
 * fixe à droite les recouvrait. La page réserve sa largeur à l'en-tête dès que
 * le contenu annonce une sélection.
 */
const navigate = vi.fn()
let received: { renderIntro?: (askLaura: ReactNode) => ReactNode; afterOverview?: ReactNode } = {}

vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('./ContactsPageContent', () => ({
  ContactsPageContent: (props: typeof received) => {
    received = props
    return <div data-testid="content-root">{props.renderIntro?.(<button type="button">Laura</button>)}</div>
  },
}))
vi.mock('@/features/governance/view/DuplicatesSection', () => ({ DuplicatesSection: () => <p>doublons</p> }))
vi.mock('@/features/crm-core/view/CreateContactDialog', () => ({ CreateContactDialog: () => null }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to?: string }) => <a href={to}>{children}</a>,
  useSearch: () => ({}),
  useNavigate: () => navigate,
}))

const { ContactsPage } = await import('./ContactsPage')

/**
 * #3471 — l'en-tête se réservait la largeur du panneau de sélection parce qu'il était le FRÈRE du contenu.
 * Théo B c1-repertoire : il est désormais rendu DANS le contenu (`renderIntro`), sous la même réserve que le
 * tableau (`ContactContent.selection-panel-window.test.tsx`) ; « Demander à Laura » y entre.
 * #4503.1 — les trois onglets (Répertoire · Mes listes · Imports & sources) suivent l'en-tête, sur les routes
 * existantes ; #4503.7 — les doublons ne sont plus passés à la liste (onglet Imports & sources).
 */
describe('#3471 / Théo c1 — /contacts : l’en-tête vit dans le contenu, sous sa réserve de largeur', () => {
  it('l’en-tête est rendu par le contenu, avec Laura, « Ajouter un contact » et les trois onglets ; plus de doublons', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    render(
      <QueryClientProvider client={client}>
        <SessionContext.Provider value={{ user: null, loading: false }}>
          <ContactsPage />
        </SessionContext.Provider>
      </QueryClientProvider>,
    )
    const intro = screen.getByTestId('contacts-intro-area')
    expect(screen.getByTestId('content-root')).toContainElement(intro)
    expect(within(intro).getByRole('button', { name: 'Laura' })).toBeInTheDocument()
    expect(within(intro).getByRole('button', { name: /ajouter un contact/i })).toBeInTheDocument()
    const tabs = within(intro).getByTestId('contacts-tabs')
    expect(
      within(tabs)
        .getAllByRole('link')
        .map(link => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Répertoire', '/contacts'],
      ['Mes listes', '/contacts/lists'],
      ['Imports & sources', '/contacts/imports'],
    ])
    expect(received.afterOverview).toBeUndefined()
    expect(screen.queryByText('doublons')).not.toBeInTheDocument()
  })
})

describe('#4503.7 — l’ancre des doublons suit le panneau dans « Imports & sources »', () => {
  const renderPage = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    render(
      <QueryClientProvider client={client}>
        <SessionContext.Provider value={{ user: null, loading: false }}>
          <ContactsPage />
        </SessionContext.Provider>
      </QueryClientProvider>,
    )
  }

  it('/contacts#hygiene-doublons (contrôle de /pilotage) mène à /contacts/imports#hygiene-doublons', () => {
    navigate.mockClear()
    window.location.hash = '#hygiene-doublons'
    renderPage()
    expect(navigate).toHaveBeenCalledWith({ to: '/contacts/imports', hash: 'hygiene-doublons', replace: true })
    window.location.hash = ''
  })

  it('sait dire NON : sans l’ancre, la liste reste la liste', () => {
    navigate.mockClear()
    window.location.hash = ''
    renderPage()
    expect(navigate).not.toHaveBeenCalled()
  })
})
