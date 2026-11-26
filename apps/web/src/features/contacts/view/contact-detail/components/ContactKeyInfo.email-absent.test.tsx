import type { Contact } from '@bellum/contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { ContactKeyInfo } from './ContactKeyInfo'

const enrich = vi.fn()
const setScope = vi.fn()

vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-moi' } }) }))
vi.mock('./ContactAssignControl', () => ({
  ContactAssignControl: ({ label }: { label?: string }) => <button type="button">{label ?? 'Attribuer'}</button>,
}))
vi.mock('@/features/team-guardrails/components/DoNotContactPreference', () => ({
  DoNotContactPreference: () => <span>Aucune opposition consignée</span>,
}))
// La logique d'« Enrichir » (coût, crédits, confirmation) est celle de la fiche : on la double, on ne la recopie pas.
vi.mock('./ContactEnrichButton', () => ({
  useContactEnrich: () => ({ enrich, setScope, enriching: false, disabled: false, hint: undefined }),
  ContactEnrichConfirm: () => null,
}))

// #4599.6 — une fiche dont l'adresse gabarit a été vidée : « E-mail absent » + de quoi le chercher.
const sansEmail = {
  id: 'c1',
  account_id: 'a1',
  full_name: 'Claire Vasseur',
  email: null,
  phone: null,
  raw_data: {},
} as unknown as Contact

describe('ContactKeyInfo — #4599.6 e-mail absent', () => {
  beforeEach(async () => {
    enrich.mockClear()
    setScope.mockClear()
    await i18n.changeLanguage('fr')
  })

  it('une fiche sans e-mail dit « E-mail absent » et propose de le chercher (confirmation, jamais un débit direct)', () => {
    render(<ContactKeyInfo contact={sansEmail} />)
    expect(screen.getByText('E-mail absent')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Chercher l’e-mail' }))
    expect(enrich).toHaveBeenCalledTimes(1)
    expect(setScope).toHaveBeenCalledWith('email')
  })

  it('sait dire NON : une fiche AVEC e-mail ne dit pas « absent » et ne propose rien', () => {
    render(<ContactKeyInfo contact={{ ...sansEmail, email: 'claire@exemple.fr' } as unknown as Contact} />)
    expect(screen.queryByText('E-mail absent')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Chercher l’e-mail' })).not.toBeInTheDocument()
  })

  it('sait dire NON : une recherche déjà faite et vide garde son « non trouvé », sans second libellé', () => {
    render(
      <ContactKeyInfo contact={{ ...sansEmail, last_enrichment_at: '2026-10-01T00:00:00Z' } as unknown as Contact} />,
    )
    expect(screen.queryByText('E-mail absent')).not.toBeInTheDocument()
  })
})
