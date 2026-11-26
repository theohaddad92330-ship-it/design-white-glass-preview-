import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { useCrmPresence } from './useCrmPresence'

const apiFetchMock = vi.mocked(apiFetch)

vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'u-1', email: 'u@example.com' }, loading: false }),
}))

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useCrmPresence', () => {
  beforeEach(() => apiFetchMock.mockReset())

  it('anchors on the company name and the bare domain extracted from the website', async () => {
    apiFetchMock.mockResolvedValueOnce({
      provider: 'hubspot',
      matched: true,
      contactsCount: 2,
      contacts: [],
      openDeals: [],
      lastActivityAt: null,
    })

    const { result } = renderHook(
      () => useCrmPresence({ companyName: 'ACME', website: 'https://www.acme.fr/contact', siren: '123456789' }),
      { wrapper: wrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const path = apiFetchMock.mock.calls[0]?.[0].path as string
    expect(path).toContain('/crm/presence?')
    expect(path).toContain('account=ACME')
    expect(path).toContain('domain=acme.fr')
    expect(path).toContain('siren=123456789')
  })

  it('stays disabled (no request) when there is no company name to anchor on', () => {
    renderHook(() => useCrmPresence({ companyName: null, website: null }), { wrapper: wrapper() })
    expect(apiFetchMock).not.toHaveBeenCalled()
  })

  it('omits the domain param when the website is unparsable', async () => {
    apiFetchMock.mockResolvedValueOnce({
      provider: null,
      matched: false,
      contactsCount: 0,
      contacts: [],
      openDeals: [],
      lastActivityAt: null,
    })

    const { result } = renderHook(() => useCrmPresence({ companyName: 'ACME', website: 'not a url' }), {
      wrapper: wrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const path = apiFetchMock.mock.calls[0]?.[0].path as string
    expect(path).toContain('account=ACME')
    expect(path).not.toContain('domain=')
  })
})
