import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2755 — Louis (beta, 23/09) : « il doit toujours y avoir un organigramme
 * après une analyse (...) sur tous les derniers comptes que j'ai analysé il
 * n'y avait pas d'organigramme ». Mesuré dans son fil d'actions : un clic sur
 * « Enrichir la carte », puis 34 s plus tard le MÊME état vide.
 *
 * Cause : `enrichOrganigram` classe les contacts (phase 3) et tente de
 * réassembler `raw_analysis.org.orgGraph`, mais `saveOrgChart` no-op
 * SILENCIEUSEMENT quand l'IA n'a rien assemblé cette fois (grille tarifaire
 * indisponible, etc.) — le endpoint répondait quand même `{ matched, total }`
 * avec un statut 200, et le hook célébrait un succès (« Organigramme mis à
 * jour ») sur un onglet resté vide. Le serveur nomme maintenant ce cas
 * (`orgGraphUpdated: false`, voir `analysis-ondemand.service.ts`) ; ce fichier
 * vérifie que le toast ne ment plus dessus.
 */

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

import { useEnrichOrganigram } from './useEnrichAccount'

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

beforeEach(() => {
  apiFetch.mockReset()
  toastSuccess.mockReset()
  toastInfo.mockReset()
  toastWarning.mockReset()
  toastError.mockReset()
})

describe('useEnrichOrganigram — #2755, ne prétend jamais un graphe assemblé qui ne l’a pas été', () => {
  it('graphe réellement écrit (orgGraphUpdated=true) : succès, comme avant', async () => {
    apiFetch.mockResolvedValue({ matched: 3, total: 5, orgGraphUpdated: true })
    const { result } = renderHook(() => useEnrichOrganigram('acc-1'), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate()
    })

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    expect(toastWarning).not.toHaveBeenCalled()
  })

  it('contacts classés mais AUCUN graphe assemblé (orgGraphUpdated=false) : avertit, ne célèbre pas', async () => {
    apiFetch.mockResolvedValue({ matched: 3, total: 5, orgGraphUpdated: false })
    const { result } = renderHook(() => useEnrichOrganigram('acc-1'), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate()
    })

    await waitFor(() => expect(toastWarning).toHaveBeenCalled())
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it('aucun contact à classer (total=0) : reste le message existant, inchangé', async () => {
    apiFetch.mockResolvedValue({ matched: 0, total: 0, orgGraphUpdated: false })
    const { result } = renderHook(() => useEnrichOrganigram('acc-1'), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate()
    })

    await waitFor(() => expect(toastInfo).toHaveBeenCalled())
    expect(toastWarning).not.toHaveBeenCalled()
    expect(toastSuccess).not.toHaveBeenCalled()
  })
})
