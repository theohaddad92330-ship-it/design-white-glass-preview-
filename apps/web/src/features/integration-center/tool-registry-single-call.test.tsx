import type { ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { SessionContext } from '@/features/auth/session-context'
import { useConnectedCapabilities } from '@/features/chat/hooks/useConnectedCapabilities'
import { useToolRegistry } from './api'

// perf P3 (29/09/2026) — `/tool-registry` partait DEUX fois par page : le gabarit
// (`useRouteAccess`) sous ['tool-registry'] avec `refetchOnMount: 'always'`, le chat
// sous une autre clé. Une clé, un appel.
const USER = { id: 'u1', email: 'a@b.fr', email_confirmed_at: null, created_at: '2026-01-01', roles: ['customer'] }

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={client}>
      <SessionContext.Provider value={{ user: USER, loading: false }}>{children}</SessionContext.Provider>
    </QueryClientProvider>
  )
}

describe('/tool-registry — un seul appel par page', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset()
    vi.mocked(apiFetch).mockResolvedValue([])
  })

  it('le gabarit et le chat partagent la même requête', async () => {
    renderHook(
      () => {
        useToolRegistry()
        useToolRegistry()
        return useConnectedCapabilities()
      },
      { wrapper },
    )
    await waitFor(() => expect(vi.mocked(apiFetch)).toHaveBeenCalled())
    await new Promise(resolve => setTimeout(resolve, 30))
    const registryCalls = vi.mocked(apiFetch).mock.calls.filter(([args]) => args.path === '/tool-registry')
    expect(registryCalls).toHaveLength(1)
  })
})
