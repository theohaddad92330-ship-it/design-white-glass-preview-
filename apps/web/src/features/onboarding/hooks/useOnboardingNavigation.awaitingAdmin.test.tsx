import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OnboardingStateResponse } from '@bellum/contracts'
import { useOnboardingNavigation } from './useOnboardingNavigation'
import type { FlatSubStep } from '@/features/onboarding/lib/questions'

// #4158.12 — le membre qui attend l'administrateur termine son onboarding sur
// ses seules questions personnelles : pas de relecture, pas de génération
// d'audit entreprise — la complétion part de la dernière question perso, puis
// il entre dans le produit.
const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  completeMutate: vi.fn().mockResolvedValue(undefined),
  saveMutate: vi.fn().mockResolvedValue(undefined),
  advanceMutate: vi.fn().mockResolvedValue(undefined),
  // Trois sous-étapes globales ; seule l'avant-dernière (index 1) est personnelle.
  steps: [
    { index: 0, stageCode: 'a', slug: 'entreprise', questions: [] },
    { index: 1, stageCode: 'b', slug: 'frein', questions: [] },
    { index: 2, stageCode: 'b', slug: 'cibles', questions: [] },
  ] as unknown as FlatSubStep[],
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => h.navigate }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/features/onboarding/hooks/useOnboarding', () => ({
  useSaveAnswers: () => ({ mutateAsync: h.saveMutate, isPending: false }),
  useAdvanceStage: () => ({ mutateAsync: h.advanceMutate, isPending: false }),
  useCompleteOnboarding: () => ({ mutateAsync: h.completeMutate, isPending: false }),
}))
vi.mock('@/features/onboarding/lib/validation', () => ({ presentedValue: (_q: unknown, v: unknown) => v }))
vi.mock('@/features/onboarding/lib/questions', () => ({ TEMPS1_SUBSTEPS: h.steps }))
vi.mock('@/features/onboarding/lib/awaiting-admin', () => ({
  isAwaitingAdmin: (s: { awaiting_company_admin?: unknown }) => Boolean(s.awaiting_company_admin),
  // Séquence réduite : l'unique étape personnelle est l'index 1.
  awaitingNeighbour: () => null,
}))
vi.mock('@/features/preferences/preferences-provider', () => ({ landingRouteNow: () => '/briefing' }))
vi.mock('@/stores/onboardingStore', () => ({
  useOnboardingStore: (selector: (s: { answers: Record<string, unknown> }) => unknown) => selector({ answers: {} }),
}))

const waiting = {
  id: 'ob-1',
  status: 'in_progress',
  awaiting_company_admin: { admin_name: 'Marie Curie' },
} as unknown as OnboardingStateResponse
const normal = { id: 'ob-1', status: 'in_progress', awaiting_company_admin: null } as unknown as OnboardingStateResponse

describe('useOnboardingNavigation — le membre qui attend l’administrateur (#4158.12)', () => {
  beforeEach(() => {
    h.navigate.mockClear()
    h.completeMutate.mockClear()
    h.saveMutate.mockClear()
    h.advanceMutate.mockClear()
  })

  it('termine sur sa dernière question PERSONNELLE : enregistre, complète, entre dans le produit', async () => {
    const { result } = renderHook(() => useOnboardingNavigation(waiting, h.steps[1]!))
    await act(async () => {
      await result.current.onContinue()
    })
    expect(h.saveMutate).toHaveBeenCalledTimes(1)
    expect(h.completeMutate).toHaveBeenCalledTimes(1)
    expect(h.navigate).toHaveBeenCalledWith({ to: '/briefing' })
    // Ni relecture ni génération : elles portent sur la fiche entreprise.
    expect(h.navigate).not.toHaveBeenCalledWith({ to: '/onboarding/$id/review', params: { id: 'ob-1' } })
  })

  it('ne remonte pas sur une sous-étape d’entreprise : « Retour » est sans effet au début de la séquence réduite', async () => {
    const { result } = renderHook(() => useOnboardingNavigation(waiting, h.steps[1]!))
    await act(async () => {
      await result.current.onBack()
    })
    expect(h.saveMutate).not.toHaveBeenCalled()
    expect(h.navigate).not.toHaveBeenCalled()
  })

  it('hors attente, rien ne change : la dernière sous-étape globale mène à la relecture', async () => {
    const { result } = renderHook(() => useOnboardingNavigation(normal, h.steps[2]!))
    await act(async () => {
      await result.current.onContinue()
    })
    expect(h.completeMutate).not.toHaveBeenCalled()
    expect(h.navigate).toHaveBeenCalledWith({ to: '/onboarding/$id/review', params: { id: 'ob-1' } })
  })
})
