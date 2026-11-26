import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ReseauExternalReads } from './ReseauExternalReads'

/**
 * #2045.5 / #2045.8 / #2045.11 (épopée #2859) — les deux lectures RÉELLES
 * (CRM branché, missions capitalisées) que `reseau-comptage.ts` ne demande
 * jamais en bande, plus le lien d'import ultérieur. Le test qui compte est
 * le troisième : une lecture SILENCIEUSE (pas connectée / pas encore
 * mesurée) ne doit JAMAIS afficher un zéro — elle n'affiche RIEN
 * (GA-18/GA-19), exactement le défaut qu'une bande auto-déclarée aurait
 * caché.
 */

const crmNetworkSize = vi.fn()
const capitalisationSummary = vi.fn()
vi.mock('@/features/crm/hooks/useCrmNetworkSize', () => ({ useCrmNetworkSize: () => crmNetworkSize() }))
vi.mock('@/features/onboarding/hooks/useCapitalisationWorkspaceSummary', () => ({
  useCapitalisationWorkspaceSummary: () => capitalisationSummary(),
}))

beforeEach(() => {
  crmNetworkSize.mockReset()
  capitalisationSummary.mockReset()
})

describe('ReseauExternalReads — les deux réservoirs qu’on LIT, jamais qu’on fait deviner', () => {
  it('montre le total RÉEL du CRM branché et le nombre de missions tracées', async () => {
    crmNetworkSize.mockReturnValue({ data: { provider: 'hubspot', total: 4213 } })
    capitalisationSummary.mockReturnValue({ data: { missionCount: 7 } })
    renderWithRouter(<ReseauExternalReads />)
    expect(await screen.findByText(/4213/)).toBeInTheDocument()
    expect(screen.getByText(/HubSpot/)).toBeInTheDocument()
    expect(screen.getByText(/7/)).toBeInTheDocument()
  })

  it('un vrai zéro MESURÉ s’affiche — ce n’est pas une absence (GA-18/GA-19)', async () => {
    crmNetworkSize.mockReturnValue({ data: { provider: 'hubspot', total: 0 } })
    capitalisationSummary.mockReturnValue({ data: { missionCount: 0 } })
    renderWithRouter(<ReseauExternalReads />)
    expect(await screen.findByText(/0 contact/)).toBeInTheDocument()
    expect(screen.getByText(/0 mission/)).toBeInTheDocument()
  })

  it('aucun CRM connecté : rien ne s’affiche pour ce réservoir — jamais un zéro inventé', async () => {
    crmNetworkSize.mockReturnValue({ data: { provider: null, total: null } })
    capitalisationSummary.mockReturnValue({ data: { missionCount: 3 } })
    renderWithRouter(<ReseauExternalReads />)
    expect(await screen.findByText(/3 mission/)).toBeInTheDocument()
    expect(screen.queryByText(/HubSpot/)).not.toBeInTheDocument()
  })

  it('lecture pas encore arrivée : rien ne s’affiche, jamais un repli deviné', async () => {
    crmNetworkSize.mockReturnValue({ data: undefined })
    capitalisationSummary.mockReturnValue({ data: undefined })
    renderWithRouter(<ReseauExternalReads />)
    await screen.findByRole('link')
    expect(screen.queryByText(/HubSpot/)).not.toBeInTheDocument()
    expect(screen.queryByText(/mission/)).not.toBeInTheDocument()
  })

  it('le lien d’import ultérieur (#2045.11) reste TOUJOURS affiché, même sans aucune lecture', async () => {
    crmNetworkSize.mockReturnValue({ data: undefined })
    capitalisationSummary.mockReturnValue({ data: undefined })
    renderWithRouter(<ReseauExternalReads />)
    const link = await screen.findByRole('link')
    expect(link).toHaveAttribute('href', '/settings/knowledge')
  })
})
