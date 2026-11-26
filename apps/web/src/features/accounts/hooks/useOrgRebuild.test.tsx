import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { accountKeys } from '@/features/accounts/api'
import { useOrgRebuild } from './useOrgRebuild'

const mockOrgRebuildState = vi.fn()
const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()

vi.mock('@/features/accounts/api', async () => {
  const actual = await vi.importActual<typeof import('@/features/accounts/api')>('@/features/accounts/api')
  return {
    ...actual,
    accountsApi: { orgRebuildState: (...args: unknown[]) => mockOrgRebuildState(...args) },
  }
})

vi.mock('sonner', () => ({
  toast: { success: (...a: unknown[]) => mockToastSuccess(...a), error: (...a: unknown[]) => mockToastError(...a) },
}))

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useOrgRebuild', () => {
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockOrgRebuildState.mockReset()
    mockToastSuccess.mockReset()
    mockToastError.mockReset()
  })

  it('signale une reconstruction en cours', async () => {
    mockOrgRebuildState.mockResolvedValue({ state: 'active' })
    const { result } = renderHook(() => useOrgRebuild('acc-1'), { wrapper })
    await waitFor(() => expect(result.current.pending).toBe(true))
  })

  it('ne dit rien sur un « terminé » qu’il n’a pas vu tourner', async () => {
    // Ouvrir l'onglet sur un job terminé il y a une heure annoncerait une mise à
    // jour qui a eu lieu hier — et recharger le dossier pour rien.
    mockOrgRebuildState.mockResolvedValue({ state: 'completed' })
    const { result } = renderHook(() => useOrgRebuild('acc-1'), { wrapper })
    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(mockToastSuccess).not.toHaveBeenCalled()
  })

  it('annonce la carte à jour au passage « en cours → terminé », et recharge le dossier', async () => {
    mockOrgRebuildState.mockResolvedValue({ state: 'active' })
    const { result } = renderHook(() => useOrgRebuild('acc-1'), { wrapper })
    await waitFor(() => expect(result.current.pending).toBe(true))

    mockOrgRebuildState.mockResolvedValue({ state: 'completed' })
    await client.invalidateQueries({ queryKey: accountKeys.orgRebuild('acc-1') })

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled())
    expect(result.current.pending).toBe(false)
    // La carte se lit dans le dossier : sans ce rechargement, elle resterait
    // affichée telle qu'elle était avant la reconstruction.
    expect(client.getQueryState(accountKeys.detail('acc-1'))?.isInvalidated ?? true).toBe(true)
  })

  it('dit quand la reconstruction a échoué — un silence se lirait « c’est à jour »', async () => {
    mockOrgRebuildState.mockResolvedValue({ state: 'queued' })
    const { result } = renderHook(() => useOrgRebuild('acc-1'), { wrapper })
    await waitFor(() => expect(result.current.pending).toBe(true))

    mockOrgRebuildState.mockResolvedValue({ state: 'failed' })
    await client.invalidateQueries({ queryKey: accountKeys.orgRebuild('acc-1') })

    await waitFor(() => expect(mockToastError).toHaveBeenCalled())
    expect(mockToastSuccess).not.toHaveBeenCalled()
  })

  it('sans compte, aucune requête — un hook monté à vide ne sonde rien', () => {
    renderHook(() => useOrgRebuild(undefined), { wrapper })
    expect(mockOrgRebuildState).not.toHaveBeenCalled()
  })
})
