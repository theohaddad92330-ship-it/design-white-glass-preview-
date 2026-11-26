import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { CompactContactRow } from './CompactContactRow'

/**
 * #4055.8 (recette démo 21/10) — la fiche d'un compte dit « A quitté l'entreprise » comme la liste /contacts :
 * SEULEMENT sur la preuve datée d'un autre employeur (`employment_left`, projetée par le serveur).
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
    full_name: 'Maxime Delaunay',
    title: 'Directeur des systèmes',
    entity: null,
    decision_role: null,
    priority: 3,
    email: null,
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

describe('CompactContactRow — « A quitté l’entreprise » (#4055.8)', () => {
  it('porte le badge avec l’employeur observé et la date quand la preuve existe', () => {
    draw(contact({ employment_left: { organization: 'BPCE', at: '2026-10-07T10:00:00.000Z' } }))
    const badge = screen.getByTestId('employment-left-badge')
    expect(badge).toHaveTextContent('A quitté l’entreprise')
    expect(badge.getAttribute('title')).toContain('BPCE')
  })

  // #4465.2 — « a quitté l'entreprise (<mois année>) » ; sans employeur observé (départ lu sur le parcours), pas de « vu chez ».
  it('#4465.2 — le badge dit le mois et l’année du départ ; sans employeur observé, aucun « vu chez »', () => {
    draw(contact({ employment_left: { organization: '', at: '2024-03-31' } }))
    const badge = screen.getByTestId('employment-left-badge')
    expect(badge).toHaveTextContent('A quitté l’entreprise (mars 2024)')
    expect(badge.getAttribute('title') ?? '').not.toContain('vu chez')
  })

  it.each([null, undefined])('sait dire NON : sans preuve (%s), aucun badge', proof => {
    draw(contact({ employment_left: proof }))
    expect(screen.queryByTestId('employment-left-badge')).not.toBeInTheDocument()
  })
})
