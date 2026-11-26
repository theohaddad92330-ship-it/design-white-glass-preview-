import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
type ProfilerHandlers = Parameters<typeof import('@/lib/socket').subscribeToProfiler>[1]

const handlers: { current: ProfilerHandlers | null } = { current: null }
const toastSuccess = vi.fn()

vi.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a), error: vi.fn() } }))
vi.mock('@/lib/socket', () => ({
  subscribeToProfiler: (_userId: string, h: ProfilerHandlers) => {
    handlers.current = h
    return () => undefined
  },
}))

import { subscribeToProfilerProgress } from './profiler-subscription'
import { profileContextKeys } from '@/features/profile-context/api'

/**
 * #3386 (vu en passant, recette 03/10) — « Ton profil Bellum a été mis à jour »
 * s'affichait à l'ouverture d'un écran sans rapport (/opportunites) : un `done`
 * rejoué par la socket, sans qu'aucune mise à jour n'ait démarré ICI. Le toast
 * ne confirme qu'une mise à jour dont cet onglet a vu le début.
 */
describe('toast « profil mis à jour »', () => {
  beforeEach(() => {
    toastSuccess.mockClear()
    handlers.current = null
    subscribeToProfilerProgress('u1', new QueryClient())
  })

  it('un done sans démarrage vu dans cet onglet ne fait aucun toast', () => {
    handlers.current?.onDone?.({ userId: 'u1' })
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it('une mise à jour démarrée ici se confirme une fois', () => {
    handlers.current?.onPhaseStarted?.({ phase: 'reading', message: 'm', userId: 'u1' })
    handlers.current?.onDone?.({ userId: 'u1' })
    expect(toastSuccess).toHaveBeenCalledTimes(1)
    handlers.current?.onDone?.({ userId: 'u1' })
    expect(toastSuccess).toHaveBeenCalledTimes(1)
  })
})

// #3909 — « rejouer mes questions » puis Découvrir sans rechargement manuel :
// le profil (`profileContextKeys.me`) doit être invalidé dès la fin de la
// reconfiguration, pas seulement lu au prochain montage.
describe('invalidation du profil à la fin de la reconfiguration (#3909)', () => {
  it('invalide profileContextKeys.me sur onDone, sans attendre un rechargement', () => {
    const queryClient = new QueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    subscribeToProfilerProgress('u1', queryClient)
    const subscribed = handlers.current
    subscribed?.onDone?.({ userId: 'u1' })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: profileContextKeys.me })
  })
})
