import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { CompactContactRow } from './CompactContactRow'

/**
 * #4290.12 (recette D3 01/11) — un contact écarté DIT son motif sur la fiche du compte (« A quitté l'entreprise… »),
 * pas seulement sur sa fiche détail. Sans motif enregistré, aucune ligne : rien d'inventé.
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
    full_name: 'Directeur des systèmes d’information',
    title: 'DSI',
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

describe('CompactContactRow — motif d’écartement (#4290.12)', () => {
  it('affiche le motif d’un contact écarté', () => {
    draw(
      contact({
        excluded_at: '2026-10-20T10:00:00.000Z',
        exclusion_reason: 'A quitté l’entreprise — poste repris en interne',
      }),
    )
    expect(screen.getByTestId('contact-exclusion-reason')).toHaveTextContent(
      'Motif : A quitté l’entreprise — poste repris en interne',
    )
  })

  it('sait dire NON : sans écartement ou sans motif, aucune ligne', () => {
    draw(contact({ exclusion_reason: 'orphelin' }))
    expect(screen.queryByTestId('contact-exclusion-reason')).not.toBeInTheDocument()
  })

  it('sait dire NON : écarté sans motif, rien d’inventé', () => {
    draw(contact({ excluded_at: '2026-10-20T10:00:00.000Z', exclusion_reason: null }))
    expect(screen.queryByTestId('contact-exclusion-reason')).not.toBeInTheDocument()
  })
})
