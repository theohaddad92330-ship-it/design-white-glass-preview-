import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { CompactContactRow } from './CompactContactRow'

/**
 * 13/10/2026 (décision Louis) — le badge « Décideur » s'affiche sur CHAQUE
 * ligne de contact décideur de la liste Contacts ; aucune pastille « non
 * décideur », et un rôle inconnu n'en porte aucune.
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

describe('CompactContactRow — badge « Décideur »', () => {
  it('un décideur économique porte le badge « Décideur »', () => {
    draw(contact({ decision_role: 'economic' }))
    // Sous lg seulement : dès lg la colonne Rôle porte « Décideur économique » (GA-26).
    expect(screen.getByText('Décideur')).toHaveClass('lg:hidden')
  })

  it.each(['technical', 'champion', 'unknown', null] as const)('rôle %s : aucun badge « Décideur »', role => {
    draw(contact({ decision_role: role }))
    expect(screen.queryByText('Décideur')).not.toBeInTheDocument()
  })
})
