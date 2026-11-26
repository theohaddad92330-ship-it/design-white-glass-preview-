import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CompanyPublicDataSection } from './CompanyPublicDataSection'

vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => ({ data: null }),
}))
vi.mock('@/features/accounts/hooks/useAccountRegistryAnnouncements', () => ({
  useAccountRegistryAnnouncements: () => ({ data: null }),
}))

// #4743.2/.5 — les champs publiés sur la page de mentions légales du site, tels que publiés.
describe('Mentions légales du site (#4743)', () => {
  it('affiche chaque champ publié, avec sa valeur telle quelle', () => {
    render(
      <CompanyPublicDataSection
        analysis={{
          legal_notice: [
            { field: 'raison_sociale', value: 'Acme Industries', sourceUrl: 'https://acme.fr/mentions-legales' },
            { field: 'immatriculation', value: 'RCS Paris B 123 456 789' },
            { field: 'hebergeur', value: 'OVH SAS, Roubaix' },
          ],
        }}
      />,
    )
    expect(screen.getByText('Mentions légales du site')).toBeInTheDocument()
    expect(screen.getByText('Acme Industries')).toBeInTheDocument()
    expect(screen.getByText('RCS Paris B 123 456 789')).toBeInTheDocument()
    expect(screen.getByText('OVH SAS, Roubaix')).toBeInTheDocument()
  })

  it('un champ absent ne fait AUCUNE ligne (page sans hébergeur ⇒ pas de ligne hébergeur)', () => {
    render(
      <CompanyPublicDataSection analysis={{ legal_notice: [{ field: 'raison_sociale', value: 'Acme Industries' }] }} />,
    )
    expect(screen.getByText('Acme Industries')).toBeInTheDocument()
    expect(screen.queryByText('Hébergeur')).not.toBeInTheDocument()
    expect(screen.queryByText('Dirigeant')).not.toBeInTheDocument()
  })

  it('aucun champ ⇒ aucune carte', () => {
    render(<CompanyPublicDataSection analysis={{ legal_notice: [] }} />)
    expect(screen.queryByText('Mentions légales du site')).not.toBeInTheDocument()
  })
})
