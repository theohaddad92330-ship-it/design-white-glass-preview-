import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserAttackAngle } from '@bellum/contracts'

// Théo TF1 p31 — « générer un autre angle » accumule un angle SANS écraser les
// précédents. Ce qui mérite un test : l'appel part sur le bon endpoint, le cache
// du compte est invalidé pour que le nouvel angle apparaisse, un doublon ne se
// fait pas passer pour un ajout, et un échec IA (502) ne fabrique rien.

const generateAngle = vi.fn()
const invalidateQueries = vi.fn()
const toastSuccess = vi.fn()
const toastInfo = vi.fn()
const toastError = vi.fn()

vi.mock('@/features/accounts/api', async () => {
  const actual = await vi.importActual<typeof import('@/features/accounts/api')>('@/features/accounts/api')
  return { ...actual, accountsApi: { ...actual.accountsApi, generateAngle: (...a: unknown[]) => generateAngle(...a) } }
})

vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    info: (...a: unknown[]) => toastInfo(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}))

import { useGenerateAttackAngle } from './useGenerateAttackAngle'
import { accountKeys } from '@/features/accounts/api'

const angle: UserAttackAngle = {
  title: 'Moderniser le socle data',
  description: null,
  entry_point: null,
  offer: null,
  estimated_deal_size: null,
  recommended: false,
}

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  qc.invalidateQueries = invalidateQueries
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

beforeEach(() => {
  generateAngle.mockReset()
  invalidateQueries.mockReset()
  toastSuccess.mockReset()
  toastInfo.mockReset()
  toastError.mockReset()
})

describe('useGenerateAttackAngle', () => {
  it('calls the endpoint, invalidates the account detail, and confirms a real add', async () => {
    generateAngle.mockResolvedValue({ angle, added: true })
    const { result } = renderHook(() => useGenerateAttackAngle('acc-1'), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate()
    })

    await waitFor(() => expect(generateAngle).toHaveBeenCalledWith('acc-1'))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: accountKeys.detail('acc-1') })
    expect(toastError).not.toHaveBeenCalled()
  })

  it('shows an info toast (not a fake "new angle") when the angle was a duplicate', async () => {
    generateAngle.mockResolvedValue({ angle, added: false })
    const { result } = renderHook(() => useGenerateAttackAngle('acc-1'), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate()
    })

    await waitFor(() => expect(toastInfo).toHaveBeenCalled())
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it('surfaces a plain error when the IA could not generate an angle (502)', async () => {
    generateAngle.mockRejectedValue(new Error("Aucun angle d'attaque n'a pu être généré", { cause: 502 }))
    const { result } = renderHook(() => useGenerateAttackAngle('acc-1'), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate()
    })

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(toastSuccess).not.toHaveBeenCalled()
  })
})
