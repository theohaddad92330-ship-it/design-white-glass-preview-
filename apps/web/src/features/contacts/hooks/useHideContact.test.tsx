import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { useHideContact } from './useHideContact'

const setHidden = vi.fn()
vi.mock('@/features/contacts/api', async () => {
  const actual = await vi.importActual<typeof import('@/features/contacts/api')>('@/features/contacts/api')
  return {
    ...actual,
    contactsApi: { ...actual.contactsApi, setHidden: (...args: unknown[]) => setHidden(...args) },
  }
})

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m) } }))

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const CONTACT = { id: 'c1', account_id: 'a1', full_name: 'Jean Dupont' } as Contact

describe('useHideContact', () => {
  beforeEach(() => {
    setHidden.mockReset()
    toastSuccess.mockReset()
    toastError.mockReset()
  })

  it('hides the contact via the API and runs the onHidden callback', async () => {
    setHidden.mockResolvedValueOnce({ ...CONTACT, hidden: true })
    const onHidden = vi.fn()
    const { result } = renderHook(() => useHideContact(), { wrapper: wrapper() })

    result.current.mutate({ contact: CONTACT, hidden: true, onHidden })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(setHidden).toHaveBeenCalledWith('c1', true)
    expect(onHidden).toHaveBeenCalled()
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('surfaces an error toast on failure', async () => {
    setHidden.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useHideContact(), { wrapper: wrapper() })

    result.current.mutate({ contact: CONTACT, hidden: true })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(toastError).toHaveBeenCalled()
  })
})
