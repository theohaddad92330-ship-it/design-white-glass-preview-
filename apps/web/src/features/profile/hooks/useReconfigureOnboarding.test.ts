import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OnboardingStateResponse } from '@bellum/contracts'
import { useReconfigureOnboarding } from './useReconfigureOnboarding'

/**
 * #2021 — le DÉCLENCHEUR extrait de `ReconfigureAnswersSection` (#2022) : un
 * seul geste (demander la reconfiguration puis ouvrir `/onboarding`), deux
 * points d'entrée. Ce fichier garde le geste lui-même ; `ReconfigureAnswersSection.test.tsx`
 * garde l'écran qui l'affichait déjà.
 */

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  refreshMutate: vi.fn().mockResolvedValue(undefined),
  startTour: vi.fn(),
  state: { status: 'completed' } as unknown as OnboardingStateResponse,
  credits: { is_demo: false } as { is_demo: boolean } | null,
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => h.navigate }))
vi.mock('@/features/onboarding/hooks/useOnboarding', () => ({
  useOnboardingState: () => ({ data: h.state }),
  useRequestOnboardingRefresh: () => ({ mutateAsync: h.refreshMutate, isPending: false }),
}))
vi.mock('@/features/credits/hooks/useCredits', () => ({
  useCredits: () => ({ data: h.credits }),
}))
vi.mock('@/features/product-tour/product-tour-store', () => ({
  useProductTourStore: (selector: (state: { start: () => void }) => unknown) => selector({ start: h.startTour }),
}))

describe('#2021 — useReconfigureOnboarding', () => {
  beforeEach(() => {
    h.navigate.mockClear()
    h.refreshMutate.mockClear()
    h.refreshMutate.mockResolvedValue(undefined)
    h.startTour.mockClear()
    h.state = { status: 'completed' } as unknown as OnboardingStateResponse
    h.credits = { is_demo: false }
  })

  it('est disponible depuis un état terminal (completed)', () => {
    const { result } = renderHook(() => useReconfigureOnboarding())
    expect(result.current.available).toBe(true)
  })

  it('reste disponible sur une reconfiguration déjà demandée (refresh_required)', () => {
    h.state = { status: 'refresh_required' } as unknown as OnboardingStateResponse
    const { result } = renderHook(() => useReconfigureOnboarding())
    expect(result.current.available).toBe(true)
    expect(result.current.alreadyRequested).toBe(true)
  })

  it('n’est jamais disponible avant même d’avoir démarré (not_started)', () => {
    h.state = { status: 'not_started' } as unknown as OnboardingStateResponse
    const { result } = renderHook(() => useReconfigureOnboarding())
    expect(result.current.available).toBe(false)
  })

  it('n’est pas disponible tant que l’état n’est pas encore chargé', () => {
    h.state = { status: undefined } as unknown as OnboardingStateResponse
    const { result } = renderHook(() => useReconfigureOnboarding())
    expect(result.current.available).toBe(false)
  })

  /**
   * #2021 (recette écran 27/09/2026, DÉCISION Louis) — réfuté sur l'espace RÉEL
   * de Louis : `in_progress` n'était pas encore un état terminal, donc le lien
   * restait invisible pour un compte pourtant déjà PASSÉ par l'onboarding.
   * « Tout statut postérieur à `not_started` » couvre `in_progress` ET les huit
   * états intermédiaires du parcours fin (`identity_in_progress` →
   * `first_value_ready`), pas seulement `completed`/`activated`.
   */
  it.each([
    'in_progress',
    'identity_in_progress',
    'audit_in_progress',
    'audit_generating',
    'audit_to_review',
    'audit_validated',
    'data_enrichment_optional',
    'first_value_ready',
    'activated',
  ])('est disponible depuis %s — tout statut postérieur au démarrage, pas seulement un état terminal', status => {
    h.state = { status } as unknown as OnboardingStateResponse
    const { result } = renderHook(() => useReconfigureOnboarding())
    expect(result.current.available).toBe(true)
  })

  /**
   * #2021 (recette démo 03/10/2026) — réfuté : le lien était ABSENT en démo
   * (`!isDemo` l'excluait inconditionnellement). DÉCISION TRANCHÉE (brief N08,
   * 07/10/2026) : le lien reste visible en démo, mais ouvre la visite guidée
   * EXISTANTE (le survol produit de `useProductTourStore`, déjà monté à la
   * racine, `<ProductTour />`) plutôt que le vrai flux d'onboarding — qui
   * écrirait `refresh_required` sur l'espace démo PARTAGÉ (le prospect suivant
   * atterrirait sur un questionnaire qu'il n'a pas demandé).
   */
  it('reste disponible dans un espace de démonstration, même sans statut d’onboarding réel', () => {
    h.credits = { is_demo: true }
    h.state = { status: 'not_started' } as unknown as OnboardingStateResponse
    const { result } = renderHook(() => useReconfigureOnboarding())
    expect(result.current.available).toBe(true)
  })

  it('n’affiche jamais « déjà demandé » en démo — ce statut n’y a aucun sens', () => {
    h.credits = { is_demo: true }
    h.state = { status: 'refresh_required' } as unknown as OnboardingStateResponse
    const { result } = renderHook(() => useReconfigureOnboarding())
    expect(result.current.alreadyRequested).toBe(false)
  })

  it('trigger() en démo lance la visite guidée EXISTANTE, sans écrire l’état de l’espace partagé', async () => {
    h.credits = { is_demo: true }
    const { result } = renderHook(() => useReconfigureOnboarding())

    let outcome: boolean | undefined
    await act(async () => {
      outcome = await result.current.trigger()
    })

    expect(h.refreshMutate).not.toHaveBeenCalled()
    expect(h.navigate).not.toHaveBeenCalled()
    expect(h.startTour).toHaveBeenCalledTimes(1)
    expect(outcome).toBe(true)
  })

  it('trigger() demande la reconfiguration puis ouvre /onboarding, et rend true', async () => {
    const { result } = renderHook(() => useReconfigureOnboarding())

    let outcome: boolean | undefined
    await act(async () => {
      outcome = await result.current.trigger()
    })

    expect(h.refreshMutate).toHaveBeenCalledTimes(1)
    expect(h.navigate).toHaveBeenCalledWith({ to: '/onboarding' })
    expect(outcome).toBe(true)
  })

  it('trigger() ne navigue pas et rend false quand la demande échoue', async () => {
    h.refreshMutate.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useReconfigureOnboarding())

    let outcome: boolean | undefined
    await act(async () => {
      outcome = await result.current.trigger()
    })

    expect(h.navigate).not.toHaveBeenCalled()
    expect(outcome).toBe(false)
  })
})
