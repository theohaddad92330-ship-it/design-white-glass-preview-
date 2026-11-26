import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createJSONStorage } from 'zustand/middleware'
import { SessionContext, type SessionContextValue } from '@/features/auth/session-context'
import { useAnalysisStore } from '@/stores/analysisStore'
import { useAnalysisStatusSync } from './useAnalysisStatusSync'

/**
 * #3666.4 (recette prod 09/10) — « Bandeau global … encore affiché > 3 min
 * après "Analyse : Terminé" ». Ce sondage est le FILET qui rattrape un
 * événement Socket.IO manqué (`reconcileAnalysisStatus`) ; React Query suspend
 * `refetchInterval` dès que l'onglet passe en arrière-plan (`document.hidden`),
 * ce que ce fichier reproduit : le filet s'arrêtait de rattraper exactement
 * quand la personne ne regardait plus l'écran.
 */
const apiFetch = vi.fn()
const connectListeners = vi.hoisted(() => new Set<() => void>())
vi.mock('@/lib/socket', () => ({
  onSocketConnect: (cb: () => void) => {
    connectListeners.add(cb)
    return () => connectListeners.delete(cb)
  },
}))
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...(args as Parameters<typeof apiFetch>)),
}))

// Force la cadence de 4 s (repli d'origine armé) plutôt que les 15 s normales
// — le comportement sous test (suspendu ou non en arrière-plan) est le même,
// et un test plus rapide reste sous `TEST_TIMEOUT_MS` sans marge serrée.
vi.mock('@/lib/api-origin', () => ({ isFallbackArmed: () => true }))

const ACCOUNT_ID = 'acct-decathlon'

function wrapper(qc: QueryClient): (props: { children: ReactNode }) => ReactElement {
  const session: SessionContextValue = {
    user: { id: 'u-1', email: 'u@example.com' } as SessionContextValue['user'],
    loading: false,
  }
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
    </QueryClientProvider>
  )
}

beforeAll(() => {
  useAnalysisStore.persist.setOptions({
    storage: createJSONStorage(() => ({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    })),
  })
})

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') })
}

describe('useAnalysisStatusSync — #3666.4 le sondage continue en arrière-plan', () => {
  beforeEach(() => {
    useAnalysisStore.setState({ runs: {} })
    useAnalysisStore.getState().start(ACCOUNT_ID, 'job-1', 'DECATHLON')
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({ jobId: 'job-1', state: 'active', percent: null, phase: 'contacts' })
    setDocumentHidden(false)
  })

  afterEach(() => {
    setDocumentHidden(false)
  })

  it('continue d’interroger /analysis/status même quand l’onglet est en arrière-plan', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    renderHook(() => useAnalysisStatusSync(), { wrapper: wrapper(qc) })

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))

    // L'onglet passe en arrière-plan : avant ce correctif, React Query
    // suspend `refetchInterval` tant que `document.hidden` est vrai.
    setDocumentHidden(true)
    apiFetch.mockResolvedValue({ jobId: 'job-1', state: 'completed', percent: 100, phase: 'analysis_done' })

    // ⚠️ SAIT DIRE NON — sans `refetchIntervalInBackground: true`, ce second
    // appel n'arrive jamais tant que l'onglet reste caché, et le run reste
    // bloqué sur « analyzing » dans le store (donc visible dans le bandeau)
    // indéfiniment.
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2), { timeout: 10_000 })
    await waitFor(() => expect(useAnalysisStore.getState().runs[ACCOUNT_ID]?.state).toBe('completed'))
  })
})

describe('useAnalysisStatusSync — #3666 rejeu à la reconnexion du socket', () => {
  beforeEach(() => {
    useAnalysisStore.setState({ runs: {} })
    useAnalysisStore.getState().start(ACCOUNT_ID, 'job-1', 'DECATHLON')
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({ jobId: 'job-1', state: 'active', percent: null, phase: null })
    connectListeners.clear()
  })

  it('relit l’état réel dès que le socket se reconnecte, sans attendre le prochain tick', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    renderHook(() => useAnalysisStatusSync(), { wrapper: wrapper(qc) })
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))

    // L'événement de fin a été émis pendant la déconnexion.
    apiFetch.mockResolvedValue({ jobId: 'job-1', state: 'completed', percent: 100, phase: 'analysis_done' })
    for (const cb of connectListeners) cb()

    await waitFor(() => expect(useAnalysisStore.getState().runs[ACCOUNT_ID]?.state).toBe('completed'), {
      timeout: 2_000,
    })
  })
})
