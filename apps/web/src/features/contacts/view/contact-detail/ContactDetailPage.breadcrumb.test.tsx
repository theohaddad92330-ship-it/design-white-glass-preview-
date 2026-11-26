import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

/**
 * #4504.4 (contrat Louis 24/10) — fil d'Ariane COURT : « Contacts › Nom ». Ouvert depuis un compte (origine dans
 * l'URL, #2150.62), le compte remplace « Contacts » pour garder le retour à l'onglet quitté — jamais « Comptes › … ».
 * #4504.2 — « Copier le lien » n'est plus dans l'en-tête de page (menu « … » de la fiche).
 */
const { received, search } = vi.hoisted(() => ({
  received: { breadcrumbs: undefined as { label: string }[] | undefined, headerActions: undefined as unknown },
  search: { value: {} as Record<string, unknown> },
}))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: (props: { breadcrumbs?: { label: string }[]; headerActions?: ReactNode }) => {
    received.breadcrumbs = props.breadcrumbs
    received.headerActions = props.headerActions
    return null
  },
}))
vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ id: 'c1' }),
  useSearch: () => search.value,
  useNavigate: () => vi.fn(),
}))
vi.mock('@/features/contacts/hooks/useContact', () => ({
  useContact: () => ({
    data: { id: 'c1', account_id: 'a1', full_name: 'Paul Ferrer', entity: 'Altiver Industries' },
    isLoading: false,
    isError: false,
  }),
}))
vi.mock('@/features/contacts/hooks/useMergedContactRedirect', () => ({ useMergedContactRedirect: () => {} }))

const { ContactDetailPage } = await import('./ContactDetailPage')

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, enabled: false } } })
  render(
    <QueryClientProvider client={client}>
      <ContactDetailPage />
    </QueryClientProvider>,
  )
}

describe('#4504.4 — le fil d’Ariane court de la fiche contact', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    search.value = {}
  })

  it('sans origine : « Contacts › Nom », jamais le compte du contact ni « Comptes »', () => {
    renderPage()
    expect(received.breadcrumbs?.map(crumb => crumb.label)).toEqual(['Contacts', 'Paul Ferrer'])
    expect(received.headerActions).toBeUndefined()
  })

  it('ouvert depuis un compte : « Compte › Nom », le retour à l’onglet quitté reste', () => {
    search.value = { from: 'account', fromId: 'a1', fromTab: 'organigramme' }
    renderPage()
    expect(received.breadcrumbs?.map(crumb => crumb.label)).toEqual(['Altiver Industries', 'Paul Ferrer'])
  })
})
