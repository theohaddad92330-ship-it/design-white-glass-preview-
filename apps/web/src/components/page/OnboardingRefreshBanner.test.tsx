import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OnboardingStateResponse } from '@bellum/contracts'
import { i18n } from '@/i18n'

/**
 * #2021 — DÉCISION LOUIS 08/10/2026 (QCM), RENVERSE #2572 pour ce seul cas.
 * Le bandeau remplace la redirection forcée vers `/onboarding` pour un
 * utilisateur DÉJÀ onboardé qui a redemandé une reconfiguration — voir le
 * docblock d'`OnboardingRefreshBanner.tsx` et `onboarding-gate.test.ts`
 * (`shouldShowOnboardingRefreshBanner`) pour la logique pure.
 */
const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  skipMutate: vi.fn().mockResolvedValue(undefined),
  state: { status: 'completed', skipped_at: null, first_completed_at: null } as unknown as OnboardingStateResponse,
  credits: { is_demo: false } as { is_demo: boolean } | null,
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => h.navigate }))
vi.mock('@/features/onboarding/hooks/useOnboarding', () => ({
  useOnboardingState: () => ({ data: h.state }),
  useSkipOnboarding: () => ({ mutateAsync: h.skipMutate, isPending: false }),
}))
vi.mock('@/features/credits/hooks/useCredits', () => ({
  useCredits: () => ({ data: h.credits }),
}))

const { OnboardingRefreshBanner } = await import('./OnboardingRefreshBanner')

function renderBanner() {
  return render(
    <I18nextProvider i18n={i18n}>
      <OnboardingRefreshBanner />
    </I18nextProvider>,
  )
}

const ALREADY_ONBOARDED_REFRESH = {
  status: 'refresh_required',
  skipped_at: null,
  first_completed_at: '2026-08-01T00:00:00.000Z',
} as unknown as OnboardingStateResponse

beforeEach(() => {
  h.navigate.mockClear()
  h.skipMutate.mockClear()
  h.skipMutate.mockResolvedValue(undefined)
  h.state = { status: 'completed', skipped_at: null, first_completed_at: null } as unknown as OnboardingStateResponse
  h.credits = { is_demo: false }
})

describe('OnboardingRefreshBanner (#2021)', () => {
  it('ne rend rien hors `refresh_required`', () => {
    renderBanner()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('ne rend rien pour un utilisateur JAMAIS onboardé — il reste redirigé par needsOnboarding, pas doublé par ce bandeau', () => {
    h.state = {
      status: 'refresh_required',
      skipped_at: null,
      first_completed_at: null,
    } as unknown as OnboardingStateResponse
    renderBanner()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('ne rend rien dès qu’un « Plus tard » a déjà été posé', () => {
    h.state = {
      status: 'refresh_required',
      skipped_at: '2026-09-18T10:00:00.000Z',
      first_completed_at: '2026-08-01T00:00:00.000Z',
    } as unknown as OnboardingStateResponse
    renderBanner()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('ne rend rien en démo, même à `refresh_required` déjà onboardé', () => {
    h.state = ALREADY_ONBOARDED_REFRESH
    h.credits = { is_demo: true }
    renderBanner()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('affiche le bandeau pour un utilisateur déjà onboardé qui a redemandé une reconfiguration', () => {
    h.state = ALREADY_ONBOARDED_REFRESH
    renderBanner()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reprendre/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /plus tard/i })).toBeInTheDocument()
  })

  it('« Reprendre » ouvre /onboarding', async () => {
    h.state = ALREADY_ONBOARDED_REFRESH
    renderBanner()
    await userEvent.click(screen.getByRole('button', { name: /reprendre/i }))
    expect(h.navigate).toHaveBeenCalledWith({ to: '/onboarding' })
  })

  it('« Plus tard » pose le MÊME report que le reste du produit (useSkipOnboarding) — jamais un état d’écran séparé', async () => {
    h.state = ALREADY_ONBOARDED_REFRESH
    renderBanner()
    await userEvent.click(screen.getByRole('button', { name: /plus tard/i }))
    expect(h.skipMutate).toHaveBeenCalledTimes(1)
  })
})
