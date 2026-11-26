import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionContext } from '@/features/auth/session-context'

/**
 * #2476 — « Ajouter un contact » a quitté `headerActions` de `CustomerPage` :
 * il partage désormais la ligne du h1 réel de l'écran (`ScreenIntro`, dans
 * `ContactsIntro` — voir `ContactsIntro.test.tsx` pour la preuve du partage de
 * ligne). Ce fichier-ci mesure seulement que l'entête de `CustomerPage` ne
 * porte plus rien : deux boutons « Ajouter un contact » sur le même écran
 * seraient pires qu'un bouton mal placé.
 */

vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children, headerActions }: { children: ReactNode; headerActions?: ReactNode }) => (
    <div>
      <div data-testid="header-actions">{headerActions}</div>
      {children}
    </div>
  ),
}))

// Théo B c1-repertoire — l'en-tête est rendu PAR le contenu (`renderIntro`), qui y place « Demander à Laura ».
vi.mock('./ContactsPageContent', () => ({
  ContactsPageContent: ({ renderIntro }: { renderIntro?: (askLaura: ReactNode) => ReactNode }) => (
    <>{renderIntro?.(null)}</>
  ),
}))

vi.mock('@/features/crm-core/view/CreateContactDialog', () => ({
  CreateContactDialog: () => null,
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to?: string }) => <a href={to}>{children}</a>,
  // #3376 — `ContactsIntro` lit désormais `useContactsActiveFilterCount`
  // (→ `useSearch`) pour le badge de son déclencheur « Filtres » compact.
  useSearch: () => ({}),
  // #4503.7 — `ContactsPage` redirige l'ancre des doublons vers « Imports & sources ».
  useNavigate: () => vi.fn(),
}))

const { ContactsPage } = await import('./ContactsPage')

function renderContactsPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionContext.Provider value={{ user: null, loading: false }}>
        <ContactsPage />
      </SessionContext.Provider>
    </QueryClientProvider>,
  )
}

describe('#2476 — /contacts : l’entête de CustomerPage ne porte plus le bouton', () => {
  it('rend `headerActions` vide, et le bouton une seule fois, dans le contenu', () => {
    renderContactsPage()
    expect(screen.getByTestId('header-actions')).toBeEmptyDOMElement()
    expect(screen.getAllByRole('button', { name: /ajouter un contact/i })).toHaveLength(1)
  })
})
