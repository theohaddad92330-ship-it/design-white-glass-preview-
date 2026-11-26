import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-error'

// Théo TF1 p39 — un besoin MATÉRIALISÉ peut partir au CRM ; la seule chose qui
// mérite un test, c'est que le refus « aucun CRM connecté » (409) devienne un
// nudge actionnable, pas une erreur brute, et qu'aucun succès ne soit fabriqué.

const exportToCrm = vi.fn()
const toastSuccess = vi.fn()
const toastWarning = vi.fn()
const toastError = vi.fn()

vi.mock('@/features/projects/api', async () => {
  const actual = await vi.importActual<typeof import('@/features/projects/api')>('@/features/projects/api')
  return {
    ...actual,
    projectsApi: { ...actual.projectsApi, exportToCrm: (...a: unknown[]) => exportToCrm(...a) },
  }
})

vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    warning: (...a: unknown[]) => toastWarning(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}))

import { useExportProjectToCrm } from './useExportProjectToCrm'

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

beforeEach(() => {
  exportToCrm.mockReset()
  toastSuccess.mockReset()
  toastWarning.mockReset()
  toastError.mockReset()
})

describe('useExportProjectToCrm', () => {
  it('POSTs the opportunity id and confirms the CRM + the object it created', async () => {
    exportToCrm.mockResolvedValue({ provider: 'hubspot', object: 'deal', id: 'deal-9' })
    const { result } = renderHook(() => useExportProjectToCrm(), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate('opp-1')
    })

    await waitFor(() => expect(exportToCrm).toHaveBeenCalledWith('opp-1'))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    // La confirmation dit ce qui a été CRÉÉ (un deal) — jamais un « c'est fait »
    // générique, jamais une « tâche » quand c'est un deal qui est parti.
    //
    // ⚠️ Elle ne nomme PAS l'éditeur : le serveur rend bien `provider` et on le
    // reçoit, on ne l'affiche pas (arbitrage « capacité partout, sans
    // exception », 25/08). Ce qui compte pour l'utilisateur est l'objet créé.
    const message = String(toastSuccess.mock.calls[0]![0])
    expect(message).toContain('ton CRM')
    expect(message).not.toContain('HubSpot')
    expect(message.toLowerCase()).toContain('deal')
    expect(toastError).not.toHaveBeenCalled()
  })

  it('turns a 409 (no CRM connected) into an actionable connect-CRM nudge, not an error', async () => {
    exportToCrm.mockRejectedValue(new ApiError('Aucun CRM connecté', 409))
    const { result } = renderHook(() => useExportProjectToCrm(), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate('opp-1')
    })

    await waitFor(() => expect(toastWarning).toHaveBeenCalled())
    expect(toastError).not.toHaveBeenCalled()
    // Carries an action that routes to the integrations screen.
    const opts = toastWarning.mock.calls[0]![1] as { action?: { label: string; onClick: () => void } }
    expect(opts?.action?.label).toBeTruthy()
  })

  it('shows a plain error toast on the CRM rejecting (502)', async () => {
    exportToCrm.mockRejectedValue(new ApiError('CRM a refusé', 502))
    const { result } = renderHook(() => useExportProjectToCrm(), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate('opp-1')
    })

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(toastWarning).not.toHaveBeenCalled()
  })
})
