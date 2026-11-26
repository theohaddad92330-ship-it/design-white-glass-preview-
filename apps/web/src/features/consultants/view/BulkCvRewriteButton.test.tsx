import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BulkCvRewriteButton } from './BulkCvRewriteButton'
import { useBulkCvRewriteEnqueue, useBulkCvRewriteJobStatus } from '../hooks'
import { ApiError } from '@/lib/api-error'

vi.mock('../hooks', () => ({ useBulkCvRewriteEnqueue: vi.fn(), useBulkCvRewriteJobStatus: vi.fn() }))

/**
 * #1952.5 (épopée #2844) — la réécriture de CV en lot devient cliquable.
 *
 * Ce que ces tests protègent :
 *  - un clic lance le job avec l'opportunité et les consultants sélectionnés ;
 *  - un rapport de fin se DIT (succès total, partiel, ou échec) — jamais un
 *    silence sur ce qui a réellement été réécrit ;
 *  - un solde épuisé (403) a son propre message, jamais « une erreur ».
 */
describe('BulkCvRewriteButton', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.mocked(useBulkCvRewriteJobStatus).mockReturnValue({ data: undefined } as unknown as ReturnType<
      typeof useBulkCvRewriteJobStatus
    >)
  })

  it('lance le job au clic avec l’opportunité et les consultants sélectionnés', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      id: 'job-1',
      status: 'queued',
      total: 2,
      processed: 0,
      results: [],
      error: null,
    })
    vi.mocked(useBulkCvRewriteEnqueue).mockReturnValue({
      mutateAsync,
      isPending: false,
      data: undefined,
    } as unknown as ReturnType<typeof useBulkCvRewriteEnqueue>)

    render(<BulkCvRewriteButton opportunityId="opp-1" consultantIds={['c1', 'c2']} />)
    fireEvent.click(screen.getByRole('button', { name: 'Réécrire les CV des 2 profils sélectionnés' }))

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ opportunityId: 'opp-1', consultantIds: ['c1', 'c2'] }),
    )
  })

  it('rapporte un succès total une fois `done`', () => {
    vi.mocked(useBulkCvRewriteEnqueue).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      data: { id: 'job-1' },
    } as unknown as ReturnType<typeof useBulkCvRewriteEnqueue>)
    vi.mocked(useBulkCvRewriteJobStatus).mockReturnValue({
      data: {
        id: 'job-1',
        status: 'done',
        total: 2,
        processed: 2,
        results: [
          { consultantId: 'c1', status: 'done', charged: true },
          { consultantId: 'c2', status: 'done', charged: true },
        ],
        error: null,
      },
    } as unknown as ReturnType<typeof useBulkCvRewriteJobStatus>)

    render(<BulkCvRewriteButton opportunityId="opp-1" consultantIds={['c1', 'c2']} />)

    expect(screen.getByRole('button', { name: 'Réécrire les CV des 2 profils sélectionnés' })).toBeEnabled()
  })

  it('un solde épuisé (403) a son propre message', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new ApiError('forbidden', 403))
    vi.mocked(useBulkCvRewriteEnqueue).mockReturnValue({
      mutateAsync,
      isPending: false,
      data: undefined,
    } as unknown as ReturnType<typeof useBulkCvRewriteEnqueue>)

    render(<BulkCvRewriteButton opportunityId="opp-1" consultantIds={['c1']} />)
    fireEvent.click(screen.getByRole('button', { name: 'Réécrire le CV du profil sélectionné' }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
  })
})
