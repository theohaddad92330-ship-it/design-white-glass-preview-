import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useSaveEsnProfile } from './useSaveEsnProfile'

vi.mock('@/features/profile/api', () => ({
  esnProfileKeys: { mine: ['esn-profile', 'mine'] },
  esnProfileApi: { updateMine: vi.fn().mockResolvedValue({ user_role: 'Fondateur / CEO' }) },
}))

describe('#3386 — enregistrer son rôle métier relit le brief', () => {
  it('invalide les requêtes du brief au succès (l’ordre ne reste pas celui d’avant)', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['briefing', 'today'], { generatedAt: '2026-10-03T10:24:00Z' })
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useSaveEsnProfile(), { wrapper })
    result.current.mutate({ user_role: 'Fondateur / CEO' })
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ['briefing'] }))
    expect(qc.getQueryState(['briefing', 'today'])?.isInvalidated).toBe(true)
  })
})
