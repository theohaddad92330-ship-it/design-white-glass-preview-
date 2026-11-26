import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Même patron que `useAnalysisProgress.test.tsx` : `apiFetch` est le seul
// point d'entrée réseau, on le remplace plutôt que de simuler un serveur.
const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...(args as Parameters<typeof apiFetch>)),
}))

const { useFailedAnalysisPhases } = await import('./useFailedAnalysisPhases')

function wrapper(): (props: { children: ReactNode }) => ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

// #2478 — « les analyses échouent presque à chaque fois et en plus c'est
// faux, une grande partie a fonctionné ». Ce hook lit `GET
// /analysis/status/:accountId` pour un compte EN ERREUR et rend les phases
// réellement checkpointées — jamais un tableau vide par défaut, qui se
// lirait comme « rien n'a abouti » alors que c'est juste non chargé.
describe('useFailedAnalysisPhases — #2478 la vérité partielle d’un run échoué', () => {
  beforeEach(() => apiFetch.mockReset())

  it('rend `null` (pas []) tant que rien n’est chargé', () => {
    apiFetch.mockResolvedValue({ completedPhases: ['research'] })
    const { result, unmount } = renderHook(() => useFailedAnalysisPhases('acc-1', true), { wrapper: wrapper() })
    // Rendu SYNCHRONE, avant que la promesse ait eu la moindre chance de se
    // résoudre : l'état initial de react-query, pas encore la réponse.
    expect(result.current).toBeNull()
    unmount()
  })

  it('n’appelle PAS le serveur quand `enabled` est faux (compte pas en erreur)', () => {
    renderHook(() => useFailedAnalysisPhases('acc-1', false), { wrapper: wrapper() })
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('rend les phases checkpointées par le serveur, dans SON ordre', async () => {
    apiFetch.mockResolvedValue({
      jobId: 'job-1',
      state: 'failed',
      percent: 0,
      phase: null,
      completedPhases: ['research', 'contacts'],
    })
    const { result } = renderHook(() => useFailedAnalysisPhases('acc-1', true), { wrapper: wrapper() })
    await waitFor(() => expect(result.current).toEqual(['research', 'contacts']))
  })

  // Témoin voisin : une API plus ancienne qui n'a pas encore le champ ne doit
  // PAS se lire comme « aucune phase n'a abouti » — c'est une information
  // absente, pas une mesure de zéro.
  it('rend `null` — jamais [] — quand la réponse ne porte pas `completedPhases`', async () => {
    apiFetch.mockResolvedValue({ jobId: 'job-1', state: 'failed', percent: 0, phase: null })
    const { result } = renderHook(() => useFailedAnalysisPhases('acc-1', true), { wrapper: wrapper() })
    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(result.current).toBeNull()
  })
})
