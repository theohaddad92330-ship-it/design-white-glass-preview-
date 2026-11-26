import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { CompactContactRow } from './CompactContactRow'

/**
 * Théo A comptes-fiche-reference.N5 / R2 — une identité reprise d'une archive est « À revalider » :
 * le badge et la mention de rattachement le disent, sans rien déduire de plus.
 */

vi.mock('@/features/contacts/hooks/useAddContactsToPlan', () => ({
  useAddContactsToPlan: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/contacts/hooks/useHideContact', () => ({
  useHideContact: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('../../components/contact-engagement/ContactEngagementContext', () => ({
  useContactEngagement: () => ({ openEngagement: vi.fn() }),
  useOptionalContactEngagement: () => ({ openEngagement: vi.fn() }),
}))

function contact(partial: Partial<Contact> = {}): Contact {
  return {
    id: 'c1',
    account_id: 'a1',
    full_name: 'Maxime Crespel',
    title: 'Directeur BPCE Consulting',
    entity: null,
    decision_role: null,
    priority: 3,
    email: null,
    email_verified: false,
    user_status: 'not_contacted',
    tags: [],
    ...partial,
  } as unknown as Contact
}

function draw(c: Contact) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CompactContactRow contact={c} />
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
})

describe('CompactContactRow — « À revalider »', () => {
  it('une identité à revalider porte le badge et la mention de rattachement', () => {
    draw(contact({ tags: ['Gouvernance', 'À revalider'] }))
    expect(screen.getByTestId('to-revalidate-badge')).toHaveTextContent('À revalider')
    expect(
      screen.getByText('Rattachement au groupe selon le relevé. Aucune responsabilité locale ou budgétaire déduite.'),
    ).toBeInTheDocument()
  })

  it('un contact ordinaire ne porte ni badge ni mention', () => {
    draw(contact({ tags: ['Gouvernance'] }))
    expect(screen.queryByTestId('to-revalidate-badge')).not.toBeInTheDocument()
    expect(screen.queryByText(/Aucune responsabilité locale/)).not.toBeInTheDocument()
  })
})
