import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { OrgCardCoordinates } from './OrgCardCoordinates'

// Louis 22/10 (carte personne enrichie) — les coordonnées en un coup d'œil : icônes e-mail / téléphone,
// en clair au clic, « disponible » / « Chercher » / « Introuvable » selon la règle COORDONNÉES.
const enrichMutate = vi.fn()
vi.mock('@/features/contacts/hooks/useEnrichContact', () => ({
  useEnrichContact: () => ({ mutate: enrichMutate, isPending: false }),
}))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))

const base = {
  id: 'c1',
  company_name: 'Société Générale',
  email: null,
  phone: null,
  email_availability: null,
  phone_availability: null,
  enrichment_coordinates: null,
} as unknown as Contact

function draw(contact: Contact) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OrgCardCoordinates contact={contact} />
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  enrichMutate.mockReset()
})

describe('OrgCardCoordinates', () => {
  it('connu : l’icône est un bouton nommé, le clic montre la valeur EN CLAIR', async () => {
    draw({ ...base, email: 'maxime@sg.fr', phone: '+33 1 42 14 20 00' } as unknown as Contact)
    expect(screen.queryByText('maxime@sg.fr')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Afficher l’e-mail' }))
    expect(screen.getByText('maxime@sg.fr')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Afficher le tél.' }))
    expect(screen.getByText('+33 1 42 14 20 00')).toBeInTheDocument()
  })

  it('annoncé disponible : le clic passe par la confirmation puis enrichit CE champ', async () => {
    draw({ ...base, email_availability: 'available' } as unknown as Contact)
    await userEvent.click(screen.getByRole('button', { name: 'E-mail disponible' }))
    expect(enrichMutate).not.toHaveBeenCalled()
    // #4463 — la confirmation ne dit plus de coût
    const confirm = await screen.findAllByRole('button', { name: /^Enrichir/ })
    expect(document.body.textContent ?? '').not.toMatch(/cr[ée]dit/i)
    await userEvent.click(confirm[confirm.length - 1]!)
    expect(enrichMutate).toHaveBeenCalledWith(expect.objectContaining({ only: 'email' }))
  })

  it('introuvable : l’icône le dit, la date avec, sans geste', () => {
    draw({
      ...base,
      enrichment_coordinates: { phone: { state: 'not_found', sources_queried: 2, at: '2026-10-12T10:00:00.000Z' } },
    } as unknown as Contact)
    expect(screen.getByLabelText(/Tél\. introuvable · /)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /tél/i })).not.toBeInTheDocument()
  })

  it('cibles ≥ 44 px', () => {
    draw({ ...base, email: 'a@b.fr' } as unknown as Contact)
    for (const button of screen.getAllByRole('button')) expect(button.className).toContain('min-h-11')
  })
})
