import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AtsExportButton } from './AtsExportButton'
import { useAtsExport } from '../hooks'
import { useDataExit, type DataExitGrant } from '@/lib/data-exit'

vi.mock('../hooks', () => ({ useAtsExport: vi.fn() }))
vi.mock('@/lib/data-exit', () => ({ useDataExit: vi.fn() }))
vi.mock('@/lib/export-csv', () => ({ downloadCSV: vi.fn() }))

/**
 * #2326.8 (épopée #2794) — export ATS du vivier entier.
 *
 * Ce que ces tests protègent :
 *  - le bouton n'existe pas quand la règle d'espace refuse la sortie de
 *    données (même discipline que `exportSelection`, `ConsultantsPage.tsx`) ;
 *  - un vivier vide se DIT, jamais un fichier vide téléchargé en silence.
 */
describe('AtsExportButton', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('ne montre rien quand la règle d’espace refuse la sortie', () => {
    vi.mocked(useDataExit).mockReturnValue({ allowed: false, grant: null })
    vi.mocked(useAtsExport).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<
      typeof useAtsExport
    >)
    render(<AtsExportButton />)
    expect(screen.queryByRole('button', { name: 'Exporter le vivier (ATS)' })).not.toBeInTheDocument()
  })

  it('télécharge le CSV quand la règle autorise et le vivier a des fiches', async () => {
    vi.mocked(useDataExit).mockReturnValue({ allowed: true, grant: {} as DataExitGrant })
    const mutateAsync = vi.fn().mockResolvedValue({
      items: [
        {
          consultantId: 'c1',
          firstName: 'Claire',
          lastName: 'Vasseur',
          email: 'claire@acme.fr',
          phone: null,
          title: 'Dev',
          seniority: 'senior',
          availability: 'immediate',
          availableFrom: null,
          tjm: 650,
          engagementKind: 'salarie',
          source: 'manual',
        },
      ],
      truncated: false,
    })
    vi.mocked(useAtsExport).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<
      typeof useAtsExport
    >)
    const { downloadCSV } = await import('@/lib/export-csv')

    render(<AtsExportButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Exporter le vivier (ATS)' }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    await waitFor(() => expect(downloadCSV).toHaveBeenCalled())
    expect(vi.mocked(downloadCSV).mock.calls[0]![0]).toContain('Claire')
  })
})
