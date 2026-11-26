import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BulkVerifyOutcome } from '@bellum/contracts'

const bulkVerify = vi.fn()
const pollEnrichment = vi.fn()
vi.mock('@/features/contacts/api', async () => {
  const actual = await vi.importActual<typeof import('@/features/contacts/api')>('@/features/contacts/api')
  return {
    ...actual,
    contactsApi: { ...actual.contactsApi, bulkVerify: (...args: unknown[]) => bulkVerify(...args) },
    pollEnrichment: (...args: unknown[]) => pollEnrichment(...args),
  }
})

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}))

import { useBulkVerifyContacts } from './useBulkVerifyContacts'

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useBulkVerifyContacts — #2297 (LAU-FINAL-038, section LOT)', () => {
  beforeEach(() => {
    bulkVerify.mockReset()
    pollEnrichment.mockReset()
    toastSuccess.mockReset()
    toastError.mockReset()
  })

  it('restitue le lot en comptes nommés une fois tous les contacts pollés jusqu’au bout', async () => {
    const outcomes: BulkVerifyOutcome[] = [
      { contact_id: 'c1', ok: true, job_id: 'j1', state: 'queued' },
      { contact_id: 'c2', ok: true, job_id: 'j2', state: 'queued' },
      { contact_id: 'c3', ok: true, job_id: 'j3', state: 'queued' },
      { contact_id: 'c4', ok: false, code: 'not_found' },
    ]
    bulkVerify.mockResolvedValueOnce({ outcomes })
    pollEnrichment
      .mockResolvedValueOnce({ email: 'a@x.fr', phone: '+33600000000', last_enrichment_result: 'matched' })
      .mockResolvedValueOnce({ email: null, phone: null, last_enrichment_result: 'ambiguous' })
      .mockRejectedValueOnce(new Error('provider down'))

    const { result } = renderHook(() => useBulkVerifyContacts(), { wrapper: wrapper() })
    await act(async () => {
      result.current.mutate(['c1', 'c2', 'c3', 'c4'])
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Premier toast : la mise en file (comportement inchangé).
    expect(toastSuccess).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.objectContaining({ description: expect.any(String) }),
    )

    // Chaque contact accepté a bien été pollé jusqu'à son terme.
    expect(pollEnrichment).toHaveBeenCalledWith('c1')
    expect(pollEnrichment).toHaveBeenCalledWith('c2')
    expect(pollEnrichment).toHaveBeenCalledWith('c3')
    expect(pollEnrichment).not.toHaveBeenCalledWith('c4') // jamais mis en file : rien à poller

    // Second toast : l'agrégat du lot, une fois réglé.
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(2))
    const [title, options] = toastSuccess.mock.calls[1] as [string, { description: string }]
    expect(title).toBeTruthy()
    expect(options.description).toContain('1') // 1 email trouvé
    expect(options.description.split('\n')).toHaveLength(5) // emails / mobiles / à confirmer / sans résultat / envoyé
  })

  it('ne poll rien et n’affiche pas de second toast quand aucun contact n’a pu être mis en file', async () => {
    bulkVerify.mockResolvedValueOnce({ outcomes: [{ contact_id: 'c1', ok: false, code: 'not_found' }] })

    const { result } = renderHook(() => useBulkVerifyContacts(), { wrapper: wrapper() })
    await act(async () => {
      result.current.mutate(['c1'])
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(pollEnrichment).not.toHaveBeenCalled()
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledTimes(1)
  })
})
