import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { onboardingApi, type OnboardingState } from '@/features/onboarding/api'
import { useCredits } from '@/features/credits/hooks/useCredits'
import { useSession } from '@/lib/hooks/use-session'
import { useOnboardingStatus } from './useOnboardingStatus'

vi.mock('@/features/onboarding/api', async () => {
  const actual = await vi.importActual<typeof import('@/features/onboarding/api')>('@/features/onboarding/api')
  return { ...actual, onboardingApi: { ...actual.onboardingApi, getState: vi.fn() } }
})
vi.mock('@/features/credits/hooks/useCredits', () => ({ useCredits: vi.fn() }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: vi.fn() }))

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

function setup({
  state,
  stateFails = false,
  credits,
  creditsFail = false,
}: {
  state?: Partial<OnboardingState>
  stateFails?: boolean
  credits?: unknown
  creditsFail?: boolean
}) {
  vi.mocked(useSession).mockReturnValue({ user: { id: 'u-1' } } as ReturnType<typeof useSession>)
  vi.mocked(useCredits).mockReturnValue({
    data: credits,
    isLoading: false,
    isError: creditsFail,
  } as ReturnType<typeof useCredits>)
  vi.mocked(onboardingApi.getState).mockImplementation(
    stateFails ? () => Promise.reject(new Error('429')) : () => Promise.resolve(state as OnboardingState),
  )
}

describe('useOnboardingStatus — ce hook décide si TOUTE page client rebondit', () => {
  it('une analyse déjà consommée ne dispense plus du questionnaire (§13)', async () => {
    // Ce cas renvoyait `false` : avoir consommé une analyse valait preuve que le
    // questionnaire était fait. C'est ce raccourci qui laissait les comptes bêta
    // — provisionnés avec un palier avant toute réponse — lancer des analyses
    // génériques en se présentant comme personnalisées.
    setup({ state: { status: 'in_progress' }, credits: { plan: 'decouverte', accounts_used: 1 } })
    const { result } = renderHook(() => useOnboardingStatus(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.needsOnboarding).toBe(true)
  })

  it('un report explicite, lui, dispense — et il est tracé', async () => {
    setup({ state: { status: 'in_progress', skipped_at: '2026-08-02T10:00:00Z' }, credits: { plan: 'decouverte' } })
    const { result } = renderHook(() => useOnboardingStatus(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.needsOnboarding).toBe(false)
  })

  it('un vrai nouveau venu est envoyé au questionnaire', async () => {
    setup({ state: { status: 'in_progress' }, credits: { plan: 'decouverte', accounts_used: 0 } })
    const { result } = renderHook(() => useOnboardingStatus(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.needsOnboarding).toBe(true)
  })

  it('lecture en ÉCHEC : on ne redirige nulle part, et on ne reste pas bloqué à charger', async () => {
    // Le garde de `/onboarding` renvoie au tableau de bord quand il ne sait pas.
    // Si la page cliente concluait « questionnaire » sur la même ignorance, la
    // boucle renaîtrait sous un autre déguisement.
    setup({ stateFails: true, credits: { plan: 'decouverte', accounts_used: 0 } })
    const { result } = renderHook(() => useOnboardingStatus(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.needsOnboarding).toBe(false)
  })

  it('perf P3 : état non lu (requête en pause, ni chargement ni erreur) — jamais « questionnaire »', () => {
    // Régression E2E intermittente (runs 36586430303 / 36589771184) : la page
    // client rebondissait vers /onboarding alors que l'API répondait `completed`.
    // Sans lecture réussie (`data` absent, ni en vol ni en échec), le prédicat
    // lisait `status: undefined` comme « compte neuf ».
    onlineManager.setOnline(false)
    try {
      setup({ state: { status: 'completed' }, credits: { plan: 'decouverte', accounts_used: 0 } })
      const { result } = renderHook(() => useOnboardingStatus(), { wrapper })
      expect(result.current.needsOnboarding).not.toBe(true)
      expect(result.current.needsOnboarding).toBeUndefined()
      expect(result.current.isLoading).toBe(true)
    } finally {
      onlineManager.setOnline(true)
    }
  })

  it('perf P3 : crédits non lus (ni chargement ni erreur, sans donnée) — jamais « questionnaire »', async () => {
    setup({ state: { status: 'in_progress' }, credits: undefined })
    const { result } = renderHook(() => useOnboardingStatus(), { wrapper })
    await waitFor(() => expect(onboardingApi.getState).toHaveBeenCalled())
    await new Promise(r => setTimeout(r, 50))
    expect(result.current.needsOnboarding).toBeUndefined()
  })

  it('CRÉDITS illisibles : un abonné n’est pas rebondi vers l’écran de tarifs', async () => {
    // `data: undefined` disait la même chose qu'« aucune offre » : un 429 sur
    // `GET /credits/me` renvoyait un compte Growth vers `/onboarding`, donc vers
    // « Choisissez votre offre ».
    setup({ state: { status: 'in_progress' }, creditsFail: true })
    const { result } = renderHook(() => useOnboardingStatus(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.needsOnboarding).toBe(false)
  })
})
