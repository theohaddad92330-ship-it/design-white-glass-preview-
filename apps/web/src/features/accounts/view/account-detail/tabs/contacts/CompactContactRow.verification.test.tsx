import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { CompactContactRow } from './CompactContactRow'

/**
 * #2632.2 — le poste d'un contact porte sa date, sa source et sa
 * vérification DANS le dossier aussi.
 *
 * Le badge existait déjà sur `/contacts` (`ContactTableRow.tsx`), jamais dans
 * l'onglet Contacts d'un compte (`CompactContactRow.tsx`). Il est désormais
 * porté par `ContactVerificationBadge`, extrait pour ne pas se recopier
 * (GA-26) — ce fichier prouve qu'il est bien APPELÉ ici, pas seulement écrit.
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
    phone: null,
    linkedin_url: null,
    photo_url: null,
    profile_summary: null,
    why_contact: null,
    email_message: { subject: 'Bonjour', body: 'Bonjour Camille,' },
    linkedin_message: null,
    phone_script: null,
    followup_message: null,
    user_status: 'not_contacted',
    source: 'apollo',
    created_at: '2026-07-01T10:00:00.000Z',
    updated_at: '2026-07-10T10:00:00.000Z',
    ...partial,
  } as unknown as Contact
}

function draw(c: Contact) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CompactContactRow contact={c} />
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
})

describe('CompactContactRow — #2632.2 le badge de vérification porte la source', () => {
  it('nomme la CATÉGORIE de la source à côté du poste, comme sur /contacts', () => {
    draw(contact({ source: 'apollo' }))
    expect(screen.getByText(/lu dans un outil connecté/)).toBeInTheDocument()
  })

  it('affiche la date de mise à jour de la donnée', () => {
    draw(contact({ updated_at: '2026-07-10T10:00:00.000Z' }))
    // 13/10/2026 : la date est nommée, jamais nue.
    expect(screen.getByText('Mis à jour le 10/07/2026')).toBeInTheDocument()
  })

  it('sait dire NON : une source non classée ne reçoit pas « outil connecté »', () => {
    draw(contact({ source: 'demo' }))
    expect(screen.queryByText(/lu dans un outil connecté/)).not.toBeInTheDocument()
  })
})
