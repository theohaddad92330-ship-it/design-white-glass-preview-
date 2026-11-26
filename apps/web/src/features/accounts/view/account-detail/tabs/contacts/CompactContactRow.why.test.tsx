import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { CompactContactRow } from './CompactContactRow'

/**
 * #4992.1 — sous chaque contact de la liste, la RAISON du rang (`why_contact`, déjà stockée) ; absente, aucune ligne
 * (rien d'inventé, jamais « - »). Le rôle et le lieu ont déjà leur colonne / leur ligne.
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
    full_name: 'Camille Roux',
    title: 'DSI',
    entity: null,
    decision_role: null,
    priority: 3,
    email: 'camille@acme.fr',
    email_verified: false,
    user_status: 'not_contacted',
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

describe('CompactContactRow — #4992 la raison du rang', () => {
  it('dit pourquoi ce contact, sous son identité', () => {
    draw(contact({ why_contact: 'Pilote le renouvellement du contrat infogérance.' }))
    expect(screen.getByTestId('contact-why')).toHaveTextContent('Pilote le renouvellement du contrat infogérance.')
  })
  it('raison absente ou vide : aucune ligne, rien d’inventé', () => {
    draw(contact({ why_contact: null }))
    expect(screen.queryByTestId('contact-why')).toBeNull()
    draw(contact({ why_contact: '   ' }))
    expect(screen.queryByTestId('contact-why')).toBeNull()
  })
})
