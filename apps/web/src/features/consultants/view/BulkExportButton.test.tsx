import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BulkExportButton } from './BulkExportButton'
import { useBulkExportEnqueue, useBulkExportJobStatus } from '../hooks'
import { useDataExit, type DataExitGrant } from '@/lib/data-exit'
import { downloadDocument } from '@/features/documents/api'

vi.mock('../hooks', () => ({ useBulkExportEnqueue: vi.fn(), useBulkExportJobStatus: vi.fn() }))
vi.mock('@/lib/data-exit', () => ({ useDataExit: vi.fn() }))
vi.mock('@/features/documents/api', () => ({ downloadDocument: vi.fn().mockResolvedValue(undefined) }))

/**
 * #1952.6 (épopée #2844) — l'export en lot du vivier, en tâche de fond.
 *
 * Ce que ces tests protègent :
 *  - le bouton n'existe pas quand la règle d'espace refuse la sortie de
 *    données (même discipline que `AtsExportButton`, son voisin synchrone) ;
 *  - un clic lance le job PUIS télécharge une fois `done`, jamais avant ;
 *  - un vivier vide se DIT, jamais un fichier vide téléchargé en silence.
 */
describe('BulkExportButton', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.mocked(useBulkExportJobStatus).mockReturnValue({ data: undefined } as unknown as ReturnType<
      typeof useBulkExportJobStatus
    >)
  })

  it('ne montre rien quand la règle d’espace refuse la sortie', () => {
    vi.mocked(useDataExit).mockReturnValue({ allowed: false, grant: null })
    vi.mocked(useBulkExportEnqueue).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<
      typeof useBulkExportEnqueue
    >)
    render(<BulkExportButton />)
    expect(screen.queryByRole('button', { name: 'Exporter le vivier en lot' })).not.toBeInTheDocument()
  })

  it('lance le job au clic, puis télécharge une fois `done`', async () => {
    vi.mocked(useDataExit).mockReturnValue({ allowed: true, grant: {} as DataExitGrant })
    const mutateAsync = vi.fn().mockResolvedValue({
      id: 'job-1',
      status: 'queued',
      total: null,
      processed: 0,
      rowCount: null,
      truncated: false,
      error: null,
    })
    vi.mocked(useBulkExportEnqueue).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<
      typeof useBulkExportEnqueue
    >)
    vi.mocked(useBulkExportJobStatus).mockReturnValue({
      data: { id: 'job-1', status: 'done', total: 3, processed: 3, rowCount: 3, truncated: false, error: null },
    } as unknown as ReturnType<typeof useBulkExportJobStatus>)

    render(<BulkExportButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Exporter le vivier en lot' }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    await waitFor(() =>
      expect(downloadDocument).toHaveBeenCalledWith('/talents/export/bulk/job-1/download', 'vivier-job-1.csv'),
    )
  })

  it('un vivier vide se DIT, jamais un fichier vide téléchargé en silence', async () => {
    vi.mocked(useDataExit).mockReturnValue({ allowed: true, grant: {} as DataExitGrant })
    const mutateAsync = vi.fn().mockResolvedValue({
      id: 'job-2',
      status: 'queued',
      total: null,
      processed: 0,
      rowCount: null,
      truncated: false,
      error: null,
    })
    vi.mocked(useBulkExportEnqueue).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<
      typeof useBulkExportEnqueue
    >)
    vi.mocked(useBulkExportJobStatus).mockReturnValue({
      data: { id: 'job-2', status: 'done', total: 0, processed: 0, rowCount: 0, truncated: false, error: null },
    } as unknown as ReturnType<typeof useBulkExportJobStatus>)

    render(<BulkExportButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Exporter le vivier en lot' }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    expect(downloadDocument).not.toHaveBeenCalled()
  })
})
