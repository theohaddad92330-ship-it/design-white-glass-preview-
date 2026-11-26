import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { CompactContactRow } from './CompactContactRow'

// Théo A comptes-fiche.R5 — la cellule « Coordonnées » de la ligne : disponibilité + enrichissement ciblé.
const enrichMutate = vi.fn()

vi.mock('@/features/contacts/hooks/useEnrichContact', () => ({
  useEnrichContact: () => ({ mutate: enrichMutate, isPending: false }),
}))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('../../components/contact-engagement/ContactEngagementContext', () => ({
  useContactEngagement: () => ({ openEngagement: vi.fn() }),
  useOptionalContactEngagement: () => ({ openEngagement: vi.fn() }),
}))

function contact(partial: Partial<Contact> = {}): Contact {
  return {
    id: 'c1',
    account_id: 'a1',
    entity: 'Société Générale',
    full_name: 'Camille Roux',
    title: 'DSI',
    decision_role: null,
    priority: 3,
    email: null,
    phone: null,
    email_availability: null,
    phone_availability: null,
    enrichment_coordinates: null,
    user_status: 'not_contacted',
    source: null,
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
  enrichMutate.mockReset()
})

// #4463 — la confirmation ne dit plus de coût : on clique le dernier « Enrichir » (celui de la confirmation)
async function confirmEnrich() {
  const buttons = await screen.findAllByRole('button', { name: /^Enrichir/ })
  expect(document.body.textContent ?? '').not.toMatch(/cr[ée]dit/i)
  await userEvent.click(buttons[buttons.length - 1]!)
}

describe('CompactContactRow — coordonnées : disponibilité + enrichir', () => {
  it('« E-mail disponible » : le clic demande d’abord confirmation (sans crédit, #4463), puis enrichit CE champ seulement', async () => {
    draw(contact({ email_availability: 'available' }))
    await userEvent.click(screen.getByRole('button', { name: 'E-mail disponible' }))
    expect(enrichMutate).not.toHaveBeenCalled()
    await confirmEnrich()
    expect(enrichMutate).toHaveBeenCalledWith(
      expect.objectContaining({ only: 'email', accountCompanyName: 'Société Générale' }),
    )
  })

  it('ni e-mail ni téléphone : le bouton de ligne « Enrichir » enrichit le contact entier', async () => {
    draw(contact())
    await userEvent.click(screen.getByRole('button', { name: 'Enrichir' }))
    await confirmEnrich()
    expect(enrichMutate).toHaveBeenCalledWith(expect.not.objectContaining({ only: expect.anything() }))
  })

  it('avec une coordonnée : pas de bouton « Enrichir » de ligne', () => {
    draw(contact({ email: 'camille@acme.fr' }))
    expect(screen.queryByRole('button', { name: 'Enrichir' })).not.toBeInTheDocument()
  })
})
