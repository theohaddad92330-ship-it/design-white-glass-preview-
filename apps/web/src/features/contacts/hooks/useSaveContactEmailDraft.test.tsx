import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))

import { useSaveContactEmailDraft } from './useSaveContactEmailDraft'

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

beforeEach(() => {
  apiFetch.mockReset()
})

/**
 * #3942.2 — « Préparer un e-mail par personne » : la validation d'un
 * brouillon dans l'écran de revue écrit `email_message`, jamais un envoi.
 */
describe('useSaveContactEmailDraft', () => {
  it('écrit le brouillon via PATCH /contacts/:id/email-draft, jamais un POST d’envoi', async () => {
    apiFetch.mockResolvedValue({ id: 'c-1', email_message: { subject: 'Objet', body: 'Corps' } })
    const { result } = renderHook(() => useSaveContactEmailDraft(), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate({ id: 'c-1', subject: 'Objet', body: 'Corps' })
    })

    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/contacts/c-1/email-draft',
      method: 'PATCH',
      body: { subject: 'Objet', body: 'Corps' },
    })
  })

  it('un sujet absent ne part pas comme une chaîne vide', async () => {
    apiFetch.mockResolvedValue({ id: 'c-1', email_message: { body: 'Corps' } })
    const { result } = renderHook(() => useSaveContactEmailDraft(), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate({ id: 'c-1', body: 'Corps' })
    })

    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/contacts/c-1/email-draft',
      method: 'PATCH',
      body: { subject: undefined, body: 'Corps' },
    })
  })
})
