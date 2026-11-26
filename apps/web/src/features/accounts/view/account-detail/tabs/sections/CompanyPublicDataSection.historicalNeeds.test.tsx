import { type AccountAnalysis } from '@bellum/contracts'
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { CompanyPublicDataSection } from './CompanyPublicDataSection'

vi.mock('@/features/accounts/hooks/useAccountRegistryAnnouncements', () => ({
  useAccountRegistryAnnouncements: () => ({ data: null }),
}))
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => ({ data: null }),
}))

const render = (analysis: Partial<AccountAnalysis>) =>
  renderWithRouter(<CompanyPublicDataSection analysis={analysis as AccountAnalysis} />)

/**
 * #4760 — LA GARDE SUR LE DOSSIER. L'analyse écrit `raw_analysis.historical_needs` ; la fiche le NOMME, avec la date
 * réelle. Avant, `recordHistoricalNeeds` ne journalisait qu'un compte : un dossier à historique long s'ouvrait sans
 * un seul besoin ancien, et aucun test ne le voyait.
 */
describe('CompanyPublicDataSection — besoins historiques nommés (#4760)', () => {
  it('nomme un besoin de plus de 180 jours avec sa date réelle', async () => {
    render({
      historical_needs: {
        total: 1,
        items: [{ label: 'Plan stratégique 2021', date: '2021-03-10', source: 'signal' }],
      },
    })
    expect(await screen.findByText('Besoins plus anciens')).toBeInTheDocument()
    expect(screen.getByText(/Plan stratégique 2021/)).toBeInTheDocument()
    expect(screen.getByText(/10 mars 2021/)).toBeInTheDocument()
  })

  it('un besoin non daté reste nommé sans date — jamais une date devinée', async () => {
    render({
      historical_needs: { total: 1, items: [{ label: 'Refonte SI annoncée', date: null, source: 'signal' }] },
    })
    expect(await screen.findByText(/Refonte SI annoncée/)).toBeInTheDocument()
    expect(screen.queryByText(/1 janv/)).not.toBeInTheDocument()
  })

  it('sans signal historique, la carte ne fait aucune ligne — les offres anciennes ont déjà leur bloc (GA-26)', () => {
    render({
      historical_needs: { total: 1, items: [{ label: 'Développeur Java', date: '2025-01-10', source: 'job_offer' }] },
    })
    expect(screen.queryByText('Besoins plus anciens')).not.toBeInTheDocument()
  })
})
