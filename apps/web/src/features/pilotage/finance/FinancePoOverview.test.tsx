import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PoConsumptionOverview } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { FinancePoOverview } from './FinancePoOverview'

const usePoConsumptionOverview = vi.fn<
  () => { data: PoConsumptionOverview | undefined; isLoading: boolean; isError: boolean }
>(() => ({ data: undefined, isLoading: true, isError: false }))
vi.mock('../api', () => ({
  usePoConsumptionOverview: () => usePoConsumptionOverview(),
}))

/**
 * #2783 — LE VOLUME DE BONS DE COMMANDE, à l'échelle de l'ESPACE, croisé aux
 * avenants qui touchent les mêmes missions.
 */
describe('FinancePoOverview', () => {
  it('monte et lit le classement, en attente de réponse', async () => {
    renderWithRouter(<FinancePoOverview />)
    await screen.findByText('Bons de commande')
    expect(usePoConsumptionOverview).toHaveBeenCalled()
  })

  it('rend les quatre compteurs et les avenants, décidés et simulés séparément', async () => {
    usePoConsumptionOverview.mockReturnValue({
      data: { ok: 3, approaching: 1, overrun: 2, unmeasured: 0, amendments: { accepted: 1, simulated: 2 } },
      isLoading: false,
      isError: false,
    })
    renderWithRouter(<FinancePoOverview />)
    await screen.findByTestId('po-overview-buckets')
    const amendments = screen.getByTestId('po-overview-amendments')
    expect(within(amendments).getByText(/1 avenant accepté/)).toBeInTheDocument()
    expect(within(amendments).getByText(/2 avenants simulés/)).toBeInTheDocument()
  })

  // #2783 — doctrine « on n'affiche pas ce qu'on n'a pas » (GA-18/19).
  it('n’affiche AUCUNE ligne d’avenants quand aucun n’en touche une mission suivie par PO', async () => {
    usePoConsumptionOverview.mockReturnValue({
      data: { ok: 1, approaching: 0, overrun: 0, unmeasured: 0, amendments: { accepted: 0, simulated: 0 } },
      isLoading: false,
      isError: false,
    })
    renderWithRouter(<FinancePoOverview />)
    await screen.findByTestId('po-overview-buckets')
    expect(screen.queryByTestId('po-overview-amendments')).not.toBeInTheDocument()
  })

  it('rend un message vide à dessein quand aucune mission ne suit de bon de commande', async () => {
    usePoConsumptionOverview.mockReturnValue({
      data: { ok: 0, approaching: 0, overrun: 0, unmeasured: 0, amendments: { accepted: 0, simulated: 0 } },
      isLoading: false,
      isError: false,
    })
    renderWithRouter(<FinancePoOverview />)
    await screen.findByText('Aucune mission ne suit encore de bon de commande.')
  })

  it('sait dire NON — un échec de lecture se distingue du vide', async () => {
    usePoConsumptionOverview.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderWithRouter(<FinancePoOverview />)
    await screen.findByText(/Lecture impossible/)
  })
})
