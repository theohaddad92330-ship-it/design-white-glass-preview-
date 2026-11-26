import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

/** #4424.6 — créer une mission PROPOSE « Préparer le RDV » ; rien ne part seul. */

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (args: unknown) => apiFetch(args) }))
const toastSuccess = vi.fn()
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: vi.fn() } }))
const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))

const { useCreateMission } = await import('./api')

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

describe('useCreateMission — la préparation du rendez-vous est proposée', () => {
  it('le toast de succès porte l’action « Préparer le RDV », qui mène au panneau R1/R2 de la fiche compte', async () => {
    apiFetch.mockResolvedValue({ id: 'm-1', account_id: 'a-1', label: 'Lead data' })
    const { result } = renderHook(() => useCreateMission('a-1'), { wrapper })
    act(() => result.current.mutate({ accountId: 'a-1', label: 'Lead data', startedOn: '2026-11-01' }))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    const [message, options] = toastSuccess.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ]
    expect(message).toBe('Mission créée.')
    expect(options.action.label).toBe('Préparer le RDV')
    expect(navigate).not.toHaveBeenCalled()
    options.action.onClick()
    // #4424.4 — il ouvre le panneau R1/R2 de la fiche du compte.
    expect(navigate).toHaveBeenCalledWith({
      to: '/accounts/$id',
      params: { id: 'a-1' },
      search: { tab: 'plan', prep: 'rdv' },
    })
  })
})
