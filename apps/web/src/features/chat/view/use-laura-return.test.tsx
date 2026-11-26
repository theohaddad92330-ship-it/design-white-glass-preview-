import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { markLeftWhileRunning, readLeftWhileRunning } from '@/features/chat/lib/laura-return'
import { useLauraReturn } from './use-laura-return'

const navigate = vi.fn()
const running = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' }, loading: false }) }))
vi.mock('@/features/chat/api/chatTurnsApi', () => ({
  chatTurnsApi: { running: (...args: unknown[]) => running(...args) },
}))

const turn = (conversationId: string) => ({
  turnId: `t-${conversationId}`,
  conversationId,
  startedAt: '2026-11-01T10:00:00Z',
})

describe('useLauraReturn (#4967 L14)', () => {
  beforeEach(() => {
    navigate.mockReset()
    running.mockReset()
    window.localStorage.clear()
  })

  it('un tour en cours : ouvre CE fil, en replace', async () => {
    running.mockResolvedValue({ turns: [turn('c-run')] })
    const { result } = renderHook(() => useLauraReturn({}, true))
    expect(result.current).toBe(true)
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: '/chat', search: { conversationId: 'c-run' }, replace: true }),
    )
    await waitFor(() => expect(result.current).toBe(false))
  })

  it('réponse arrivée pendant l’absence : ramène UNE fois, puis la marque est effacée', async () => {
    markLeftWhileRunning('u1', 'c-done')
    running.mockResolvedValue({ turns: [] })
    renderHook(() => useLauraReturn({}, true))
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: '/chat', search: { conversationId: 'c-done' }, replace: true }),
    )
    expect(readLeftWhileRunning('u1')).toBeNull()
    navigate.mockClear()
    renderHook(() => useLauraReturn({}, true))
    await waitFor(() => expect(running).toHaveBeenCalledTimes(2))
    expect(navigate).not.toHaveBeenCalled()
  })

  it('déjà vue (aucune marque, aucun tour) : accueil, pas de redirection', async () => {
    running.mockResolvedValue({ turns: [] })
    const { result } = renderHook(() => useLauraReturn({}, true))
    await waitFor(() => expect(result.current).toBe(false))
    expect(navigate).not.toHaveBeenCalled()
  })

  it('?fresh=1 : jamais redirigé, aucun appel', () => {
    running.mockResolvedValue({ turns: [turn('c-run')] })
    const { result } = renderHook(() => useLauraReturn({ fresh: '1' }, true))
    expect(result.current).toBe(false)
    expect(running).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('?fresh= retiré de l’URL après le montage (Chat le consomme) : pas de chargement sans fin, aucun appel', () => {
    running.mockResolvedValue({ turns: [turn('c-run')] })
    const { result, rerender } = renderHook(({ search }) => useLauraReturn(search, true), {
      initialProps: { search: { fresh: '1' } as Record<string, unknown> },
    })
    rerender({ search: {} })
    expect(result.current).toBe(false)
    expect(running).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('l’appel running échoue : accueil, jamais d’erreur', async () => {
    markLeftWhileRunning('u1', 'c-done')
    running.mockRejectedValue(new Error('500'))
    const { result } = renderHook(() => useLauraReturn({}, true))
    await waitFor(() => expect(result.current).toBe(false))
    expect(navigate).not.toHaveBeenCalled()
  })
})
