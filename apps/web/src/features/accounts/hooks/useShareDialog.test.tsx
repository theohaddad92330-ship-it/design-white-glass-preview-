import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// #2735 — la fenêtre « Partager le dossier » fabriquait déjà un lien public à
// l'OUVERTURE (une `useQuery` `enabled: open`, POST tiré au montage). Décision
// de Louis (22/09 soir, decisions-louis-22-09-soir.md §7) : la fenêtre s'ouvre
// SANS lien, un bouton (`createLink`) le fabrique. Ce test dit NON à l'appel
// automatique et OUI à l'appel sur le geste explicite.

const apiFetch = vi.fn()
const toastError = vi.fn()
const toastSuccess = vi.fn()

vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
vi.mock('sonner', () => ({
  toast: {
    error: (...a: unknown[]) => toastError(...a),
    success: (...a: unknown[]) => toastSuccess(...a),
  },
}))

import { useShareDialog } from './useShareDialog'

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

beforeEach(() => {
  apiFetch.mockReset().mockResolvedValue({
    url: 'https://bellum.ai/share/acme-x1y2',
    slug: 'acme-x1y2',
    expiresAt: '2026-10-23T00:00:00.000Z',
    createdAt: '2026-09-23T00:00:00.000Z',
    section: 'full',
  })
  toastError.mockReset()
  toastSuccess.mockReset()
})

describe('useShareDialog — le lien ne se crée qu’au clic (#2735)', () => {
  it('n’appelle AUCUNE API à l’ouverture de la fenêtre', () => {
    const onOpenChange = vi.fn()
    const { result } = renderHook(() => useShareDialog({ accountId: 'acc-1', open: true, onOpenChange }), {
      wrapper: wrapper(),
    })

    expect(apiFetch).not.toHaveBeenCalled()
    expect(result.current.link).toBeNull()
    expect(result.current.isPending).toBe(false)
  })

  it('crée le lien seulement quand `createLink` est appelé', async () => {
    const onOpenChange = vi.fn()
    const { result } = renderHook(() => useShareDialog({ accountId: 'acc-1', open: true, onOpenChange }), {
      wrapper: wrapper(),
    })

    act(() => result.current.createLink())

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/accounts/acc-1/share',
      method: 'POST',
      body: { section: undefined },
    })

    await waitFor(() => expect(result.current.link).toBe('https://bellum.ai/share/acme-x1y2'))
  })

  // #2914 (#2128.11) — un second geste fabrique un lien réduit à la section
  // Score, jamais le dossier entier.
  it('crée un lien réduit quand `createLink("evaluation")` est appelé', async () => {
    apiFetch.mockResolvedValueOnce({
      url: 'https://bellum.ai/share/acme-x1y2',
      slug: 'acme-x1y2',
      expiresAt: '2026-10-23T00:00:00.000Z',
      createdAt: '2026-09-23T00:00:00.000Z',
      section: 'evaluation',
    })
    const onOpenChange = vi.fn()
    const { result } = renderHook(() => useShareDialog({ accountId: 'acc-1', open: true, onOpenChange }), {
      wrapper: wrapper(),
    })

    act(() => result.current.createLink('evaluation'))

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/accounts/acc-1/share',
      method: 'POST',
      body: { section: 'evaluation' },
    })

    await waitFor(() => expect(result.current.section).toBe('evaluation'))
  })

  it('fermer la fenêtre efface le lien — la rouvrir repart sans lien', async () => {
    const onOpenChange = vi.fn()
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) => useShareDialog({ accountId: 'acc-1', open, onOpenChange }),
      { wrapper: wrapper(), initialProps: { open: true } },
    )

    act(() => result.current.createLink())
    await waitFor(() => expect(result.current.link).not.toBeNull())

    act(() => result.current.handleOpenChange(false))
    rerender({ open: false })

    expect(result.current.link).toBeNull()

    rerender({ open: true })
    expect(result.current.link).toBeNull()
    expect(apiFetch).toHaveBeenCalledTimes(1) // toujours un seul appel, pas un second au remontage
  })
})
