import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContactScope } from '@bellum/contracts'
import { ApiError } from '@/lib/api-error'

// P0-03 (Théo restitution) : « largeur puis qualification ». The server already
// merges a scoped Phase-2 re-run into the existing stock; the web just never
// forwarded a scope. These lock the wiring end-to-end (hook → api → request):
// the chosen angle reaches the endpoint, and a wide/empty pass sends no body.

const apiFetch = vi.fn()
const toastSuccess = vi.fn()
const toastInfo = vi.fn()
const toastWarning = vi.fn()
const toastError = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    info: (...a: unknown[]) => toastInfo(...a),
    warning: (...a: unknown[]) => toastWarning(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}))

import { useEnrichContacts } from './useEnrichAccount'
import { accountsApi } from '@/features/accounts/api'

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

function lastBody(): unknown {
  return (apiFetch.mock.calls.at(-1)?.[0] as { body?: unknown }).body
}

beforeEach(() => {
  apiFetch.mockReset().mockResolvedValue({ count: 3 })
  toastSuccess.mockReset()
  toastInfo.mockReset()
  toastWarning.mockReset()
  toastError.mockReset()
})

describe('useEnrichContacts — forwards the chosen angle (P0-03)', () => {
  it('sends the scope to the enrich-contacts endpoint when an angle is picked', async () => {
    const scope: ContactScope = { entity: 'TF1 Pub', theme: 'Data / Adtech' }
    const { result } = renderHook(() => useEnrichContacts('acc-1'), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate(scope)
    })

    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(apiFetch).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/analysis/acc-1/enrich-contacts', method: 'POST', body: { scope } }),
    )
  })

  it('runs a wide pass with no body when mutate() is called with no angle', async () => {
    const { result } = renderHook(() => useEnrichContacts('acc-1'), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate()
    })

    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(lastBody()).toBeUndefined()
  })
})

describe('accountsApi.enrichContacts — request body (P0-03)', () => {
  it('sends { scope } only when the angle carries a value', async () => {
    await accountsApi.enrichContacts('acc-1', { theme: 'Achats' })
    expect(lastBody()).toEqual({ scope: { theme: 'Achats' } })
  })

  it('omits the body for a wide pass and for an all-empty scope', async () => {
    await accountsApi.enrichContacts('acc-1')
    expect(lastBody()).toBeUndefined()

    await accountsApi.enrichContacts('acc-1', { entity: '', titles: [] })
    expect(lastBody()).toBeUndefined()
  })
})

/**
 * Refus de PÉRIMÈTRE (Théo TF1 p8). Une recherche ciblée qui vise une entité/thème
 * exclu au lancement est refusée EN AMONT par le serveur (409, zéro appel/zéro
 * crédit). Le front avalait ce refus : on le rend VISIBLE et DISTINCT d'une vraie
 * erreur technique — un avertissement, pas une erreur.
 */
describe('useEnrichContacts — refus de périmètre (409)', () => {
  const scope: ContactScope = { entity: 'TF1 Pub' }

  it('affiche un avertissement de périmètre, jamais un toast d’erreur technique', async () => {
    apiFetch
      .mockReset()
      .mockRejectedValue(new ApiError("« TF1 PUB » a été exclue du périmètre au lancement de l'analyse.", 409))
    const { result } = renderHook(() => useEnrichContacts('acc-1'), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate(scope)
    })

    await waitFor(() => expect(toastWarning).toHaveBeenCalled())
    expect(toastError).not.toHaveBeenCalled()
    // Le message précis du serveur (nom de l'entité écartée) est conservé en détail.
    const opts = toastWarning.mock.calls[0]![1] as { description?: string }
    expect(opts?.description).toContain('TF1 PUB')
  })

  it('garde le toast d’erreur pour une vraie panne technique (502)', async () => {
    apiFetch.mockReset().mockRejectedValue(new ApiError('IA indisponible', 502))
    const { result } = renderHook(() => useEnrichContacts('acc-1'), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate(scope)
    })

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(toastWarning).not.toHaveBeenCalled()
  })
})

// C.2 (Cédric 20/10) — une recherche partie SANS ancre d'organisation le DIT : le
// toast nomme « recherche limitée au nom de l'entreprise » au lieu de laisser
// croire qu'on a cherché plus loin. Ancre présente ou non mesurée : rien à ajouter.
describe('useEnrichContacts — recherche sans ancre d’organisation (C.2)', () => {
  const nameOnly = /nom de l.entreprise/

  it('nomme la limite quand aucun contact n’entre et que l’IA a cherché sans ancre', async () => {
    apiFetch.mockResolvedValue({ count: 0, identified: 0, orgAnchorSource: 'none' })
    const { result } = renderHook(() => useEnrichContacts('acc-1'), { wrapper: wrapper() })
    await act(async () => {
      result.current.mutate()
    })
    await waitFor(() => expect(toastInfo).toHaveBeenCalled())
    expect(JSON.stringify(toastInfo.mock.calls[0])).toMatch(nameOnly)
  })

  it('nomme la limite aussi sur un succès', async () => {
    apiFetch.mockResolvedValue({ count: 2, orgAnchorSource: 'none' })
    const { result } = renderHook(() => useEnrichContacts('acc-1'), { wrapper: wrapper() })
    await act(async () => {
      result.current.mutate()
    })
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    expect(JSON.stringify(toastSuccess.mock.calls[0])).toMatch(nameOnly)
  })

  it('ne dit rien de tel quand l’ancre existe ou n’est pas mesurée', async () => {
    for (const orgAnchorSource of ['enrichment', undefined]) {
      toastInfo.mockReset()
      apiFetch.mockResolvedValue({ count: 0, identified: 0, orgAnchorSource })
      const { result } = renderHook(() => useEnrichContacts('acc-1'), { wrapper: wrapper() })
      await act(async () => {
        result.current.mutate()
      })
      await waitFor(() => expect(toastInfo).toHaveBeenCalled())
      expect(JSON.stringify(toastInfo.mock.calls[0])).not.toMatch(nameOnly)
    }
  })
})
