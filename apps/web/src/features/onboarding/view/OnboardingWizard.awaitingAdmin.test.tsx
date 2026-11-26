import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OnboardingStateResponse } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { OnboardingWizard } from './OnboardingWizard'

/**
 * #4158.12 — un membre arrivé AVANT que l'administrateur décrive l'ESN ne voit
 * que ses questions PERSONNELLES, sous un bandeau qui nomme cet administrateur.
 */
const { mockState, redirectTo } = vi.hoisted(() => ({ mockState: vi.fn(), redirectTo: vi.fn() }))

vi.mock('@/features/onboarding/hooks/useOnboarding', () => ({
  useOnboardingState: () => mockState(),
  useSkipOnboarding: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/onboarding/hooks/useOnboardingNavigation', () => ({
  useOnboardingNavigation: () => ({ pending: false, onContinue: vi.fn(), onBack: vi.fn(), onJump: vi.fn() }),
}))
vi.mock('@/components/navigation/RedirectTo', () => ({
  RedirectTo: ({ to }: { to: string }) => {
    redirectTo(to)
    return <div data-testid="redirect" />
  },
}))

const ID = '0a3c1861-840d-4606-8324-5fbea19bafff'

function state(awaiting: { admin_name: string | null } | null): OnboardingStateResponse {
  return {
    id: ID,
    status: 'in_progress',
    current_stage_code: 'company_info',
    stages: [],
    answers: {},
    inherited_answer_keys: [],
    awaiting_company_admin: awaiting,
  } as unknown as OnboardingStateResponse
}

beforeEach(() => {
  useOnboardingStore.getState().reset()
  mockState.mockReset()
  redirectTo.mockReset()
})

async function render(stage: string, slug: string, awaiting: { admin_name: string | null } | null): Promise<void> {
  mockState.mockReturnValue({ data: state(awaiting), isLoading: false })
  renderWithRouter(
    <>
      <OnboardingWizard stageCode={stage} slug={slug} />
      <div data-testid="sentinel" />
    </>,
  )
  await screen.findByTestId('sentinel')
}

describe('OnboardingWizard — le membre qui attend l’administrateur (#4158.12)', () => {
  it('une sous-étape d’entreprise le renvoie vers sa première question personnelle', async () => {
    await render('company_info', 'equipe-commerciale', { admin_name: 'Marie Curie' })
    expect(screen.getByTestId('redirect')).toBeInTheDocument()
    expect(redirectTo).toHaveBeenCalledWith(`/onboarding/${ID}/target_market/frein`)
  })

  it('sur sa question personnelle : le bandeau nomme l’administrateur', async () => {
    await render('target_market', 'frein', { admin_name: 'Marie Curie' })
    expect(screen.getByTestId('awaiting-admin-banner')).toHaveTextContent('Marie Curie')
    expect(screen.queryByTestId('redirect')).toBeNull()
  })

  it('hors attente, aucun bandeau et aucune redirection', async () => {
    await render('target_market', 'frein', null)
    expect(screen.queryByTestId('awaiting-admin-banner')).toBeNull()
    expect(screen.queryByTestId('redirect')).toBeNull()
  })
})
