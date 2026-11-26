import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionContext } from '@/features/auth/session-context'

/**
 * #4503.1 / #4503.7 (contrat Louis 24/10) — `/contacts/imports` porte l'en-tête COMMUN de Contacts et ses trois
 * onglets (« Imports & sources » courant), puis « Relire les doublons » (avec son nombre), puis le contenu des
 * imports. #4503.b — la sous-navigation à deux liens du contenu n'existe plus (une navigation, un endroit).
 */
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/features/governance/view/DuplicatesSection', () => ({
  DuplicatesSection: () => (
    <section data-testid="dupes">
      <h2>3 doublons à relire</h2>
      <button type="button">Relire les doublons</button>
    </section>
  ),
}))
vi.mock('@/features/contacts-import/view/ImportsSourcesContent', () => ({
  ImportsSourcesContent: () => (
    <div data-testid="imports-sources">
      <h2>Enrichir ton répertoire, sans le dupliquer.</h2>
    </div>
  ),
}))
vi.mock('@/features/crm-core/view/CreateContactDialog', () => ({ CreateContactDialog: () => null }))
vi.mock('@/features/target-lists/api', () => ({
  useTargetLists: () => ({
    data: [
      { id: 'l1', type: 'contacts', status: 'active', items: [] },
      { id: 'l2', type: 'accounts', status: 'active', items: [] },
      { id: 'l3', type: 'contacts', status: 'archived', items: [] },
    ],
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string; 'aria-current'?: 'page' }) => (
    <a href={to} aria-current={rest['aria-current']}>
      {children}
    </a>
  ),
  useSearch: () => ({}),
}))

const { ContactsImportsSourcesPage } = await import('./ContactsImportsSourcesPage')

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <SessionContext.Provider value={{ user: null, loading: false }}>
        <ContactsImportsSourcesPage />
      </SessionContext.Provider>
    </QueryClientProvider>,
  )
}

const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('#4503 — /contacts/imports sous l’en-tête commun de Contacts', () => {
  it('en-tête « Contacts » et ses gestes, onglets (Imports & sources courant), doublons, puis imports', () => {
    renderPage()
    const intro = screen.getByTestId('contacts-intro-area')
    expect(within(intro).getByRole('heading', { level: 1, name: 'Contacts' })).toBeInTheDocument()
    expect(within(intro).getByRole('button', { name: /ajouter un contact/i })).toBeInTheDocument()
    expect(within(intro).getByRole('link', { name: /importer des contacts/i })).toBeInTheDocument()
    const tabs = within(intro).getByTestId('contacts-tabs')
    const current = within(tabs)
      .getAllByRole('link')
      .filter(link => link.getAttribute('aria-current') === 'page')
    expect(current.map(link => link.textContent)).toEqual(['Imports & sources'])
    // « Mes listes (N) » : les listes ACTIVES, contacts et comptes (l'archivée ne compte pas).
    expect(within(tabs).getByTestId('contacts-tabs-lists-count')).toHaveTextContent('2')

    const dupes = screen.getByTestId('dupes')
    expect(within(dupes).getByText('3 doublons à relire')).toBeInTheDocument()
    expect(within(dupes).getByRole('button', { name: 'Relire les doublons' })).toBeInTheDocument()
    const imports = screen.getByTestId('imports-sources')
    expect(before(tabs, dupes)).toBe(true)
    expect(before(dupes, imports)).toBe(true)
  })

  it('#4503.b — plus de masquage CSS : le contenu des imports n’est enveloppé d’aucune règle qui cache une navigation', () => {
    renderPage()
    const wrapper = screen.getByTestId('imports-sources').parentElement
    expect(wrapper?.className ?? '').not.toContain('hidden')
    // Une seule navigation de Contacts à l'écran : les trois onglets.
    expect(screen.getAllByRole('navigation')).toHaveLength(1)
  })
})
