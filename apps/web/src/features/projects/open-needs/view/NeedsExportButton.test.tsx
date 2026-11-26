import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

type ApiCall = { path: string; method?: string; body?: unknown }
const apiFetch = vi.fn(async (_args: ApiCall): Promise<unknown> => '"Besoin"\r\n')
vi.mock('@/lib/api', () => ({ apiFetch: (args: ApiCall) => apiFetch(args) }))
const downloadCSV = vi.fn()
vi.mock('@/lib/export-csv', () => ({
  downloadCSV: (...args: unknown[]) => downloadCSV(...args),
  downloadJSON: vi.fn(),
}))

const { NeedsExportButton } = await import('./NeedsExportButton')
const { useDataExit } = await import('@/lib/data-exit')
type DataExitGrant = NonNullable<ReturnType<typeof useDataExit>['grant']>

/**
 * #4295.14 — recette production : /projects n'avait AUCUN bouton d'export (l'export de masse ne vivait que dans la
 * barre de sélection). « Exporter » envoie les besoins VISIBLES sur la route gouvernée, et rien sans autorisation.
 */
describe('NeedsExportButton', () => {
  it('exporte en CSV les besoins visibles, sur la route gouvernée, puis télécharge avec la preuve', async () => {
    apiFetch.mockClear()
    const user = userEvent.setup()
    render(<NeedsExportButton needIds={['n-1', 'n-2', 'n-3']} />)
    await user.click(screen.getByRole('button', { name: 'Exporter les 3 besoins affichés en CSV' }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: '/projects/needs/export',
        method: 'POST',
        body: { needIds: ['n-1', 'n-2', 'n-3'], format: 'csv', lang: 'fr' },
        responseType: 'text',
      }),
    )
    await waitFor(() => expect(downloadCSV).toHaveBeenCalledTimes(1))
    expect(downloadCSV.mock.calls[0]?.[1]).toMatch(/^besoins-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(downloadCSV.mock.calls[0]?.[2]).toBeTruthy()
  })

  it('Théo C projects-besoins — « Exporter pour un partenaire » : même route gouvernée, audience partenaire (sans tarif ni porteur)', async () => {
    apiFetch.mockClear()
    const user = userEvent.setup()
    render(<NeedsExportButton needIds={['n-1']} />)
    const partner = screen.getByRole('button', { name: /pour un partenaire/ })
    expect(partner).toHaveAttribute('title', 'Sans tarif ni porteur')
    await user.click(partner)
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: '/projects/needs/export',
        method: 'POST',
        body: { needIds: ['n-1'], format: 'csv', audience: 'partner', lang: 'fr' },
        responseType: 'text',
      }),
    )
  })

  it('#4295.14 — chaque bouton porte un aria-label NOMMÉ qui contient son libellé visible', () => {
    render(<NeedsExportButton needIds={['n-1', 'n-2']} />)
    expect(screen.getByRole('button', { name: /pour un partenaire/ })).toHaveAttribute(
      'aria-label',
      expect.stringContaining('partenaire'),
    )
    expect(screen.getByRole('button', { name: /^Exporter les 2 besoins/ })).toHaveTextContent('Exporter')
  })

  it('sait dire NON : sans autorisation de la règle d’espace, ou sans besoin visible, aucun bouton', () => {
    vi.mocked(useDataExit).mockReturnValue({ allowed: false, grant: null })
    const { unmount } = render(<NeedsExportButton needIds={['n-1']} />)
    expect(screen.queryByRole('button', { name: /Exporter/ })).toBeNull()
    unmount()
    vi.mocked(useDataExit).mockReturnValue({ allowed: true, grant: {} as DataExitGrant })
    render(<NeedsExportButton needIds={[]} />)
    expect(screen.queryByRole('button', { name: /Exporter/ })).toBeNull()
  })
})
