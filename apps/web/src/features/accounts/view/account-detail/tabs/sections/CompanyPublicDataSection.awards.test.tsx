import type { AccountAnalysis } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CompanyPublicDataSection } from './CompanyPublicDataSection'

// #3915.decp — un marché public attribué que la veille relit en continu (et que l'analyse
// n'a pas figé) apparaît dans la carte des marchés, daté — jamais dans les annonces légales.
vi.mock('@/features/accounts/hooks/useAccountRegistryAnnouncements', () => ({
  useAccountRegistryAnnouncements: () => ({
    data: {
      announcements: [
        {
          source: 'decp',
          kind: 'award_won',
          type: 'Expertise DATA-IA',
          date: '2026-09-01',
          url: null,
          tribunal: null,
          counterpart: 'Ministère de l’Europe',
        },
      ],
      checkedAt: '2026-10-16T04:00:00.000Z',
      truncated: false,
    },
  }),
}))
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => ({ data: null }),
}))

describe('CompanyPublicDataSection — #3915.decp', () => {
  it('montre le marché lu en continu, daté, avec l’acheteur — sans analyse qui le porte', () => {
    const analysis: AccountAnalysis = { contract_model: null } as unknown as AccountAnalysis
    render(<CompanyPublicDataSection analysis={analysis} accountId="acc-1" />)
    expect(screen.getByText('Marchés publics attribués')).toBeInTheDocument()
    expect(screen.getByText('Expertise DATA-IA')).toBeInTheDocument()
    expect(screen.getByText(/Remporté — acheteur : Ministère de l’Europe/)).toBeInTheDocument()
    expect(screen.getByText(/Attribué le 1 septembre 2026/)).toBeInTheDocument()
    expect(screen.queryByText('Annonces légales')).not.toBeInTheDocument()
  })

  // #4286.1 (recette 23/10) — un marché figé par l'analyse nomme AUSSI son acheteur, avec la date d'attribution
  // et le montant quand ils sont connus ; une absence ne fait aucune ligne.
  it('nomme l’acheteur d’un marché figé par l’analyse, à côté du titulaire, du montant et de la date', () => {
    const analysis = {
      contract_model: null,
      awarded_contracts: [
        {
          title: 'Radars sol',
          buyer: 'Direction générale de l’armement',
          winner: 'Thales',
          amount: 2500000,
          notified_date: '2026-03-05',
        },
      ],
    } as unknown as AccountAnalysis
    render(<CompanyPublicDataSection analysis={analysis} accountId="acc-1" />)
    expect(screen.getByText(/Acheteur : Direction générale de l’armement/)).toBeInTheDocument()
    expect(screen.getByText(/Attribué le 5 mars 2026/)).toBeInTheDocument()
  })
})
