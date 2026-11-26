import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OnboardingStateResponse } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { TEMPS1_SUBSTEPS } from '@/features/onboarding/lib/questions'
import { isStageEntry } from '@/features/onboarding/components/OnboardingStageTransition'
import { OnboardingWizard } from './OnboardingWizard'

/**
 * #2087.19 / #2087.20 — l'écran de transition est BRANCHÉ dans le parcours :
 * il précède la première sous-étape de chaque étape, dure un clic, et ne
 * s'interpose jamais au milieu d'une étape.
 */

const { mockState, mockNav } = vi.hoisted(() => ({ mockState: vi.fn(), mockNav: vi.fn() }))

vi.mock('@/features/onboarding/hooks/useOnboarding', () => ({
  useOnboardingState: () => mockState(),
  useSkipOnboarding: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/features/onboarding/hooks/useOnboardingNavigation', () => ({
  useOnboardingNavigation: () => mockNav(),
}))

function state(): OnboardingStateResponse {
  return {
    id: '0a3c1861-840d-4606-8324-5fbea19bafff',
    status: 'in_progress',
    current_stage_code: 'offer_expertise',
    stages: [],
    answers: {},
    inherited_answer_keys: [],
  } as unknown as OnboardingStateResponse
}

async function renderAt(stageCode: string, slug: string): Promise<void> {
  mockState.mockReturnValue({ data: state(), isLoading: false })
  renderWithRouter(
    <>
      <OnboardingWizard stageCode={stageCode} slug={slug} />
      <div data-testid="sentinel" />
    </>,
  )
  await screen.findByTestId('sentinel')
}

beforeEach(() => {
  useOnboardingStore.getState().reset()
  mockNav.mockReset()
  mockNav.mockReturnValue({ pending: false, onContinue: vi.fn(), onBack: vi.fn() })
  mockState.mockReset()
})

describe('#2087.19 / #2087.20 — transition à l’entrée de chaque étape', () => {
  const entry = TEMPS1_SUBSTEPS.find(sub => sub.stageCode === 'offer_expertise' && isStageEntry(sub))
  const middle = TEMPS1_SUBSTEPS.find(sub => sub.stageCode === 'offer_expertise' && !isStageEntry(sub))

  it('à l’entrée d’une étape, la transition s’affiche AVANT les questions, puis « Continuer » les révèle', async () => {
    if (!entry) throw new Error('offer_expertise sans sous-étape posée au Temps 1')
    await renderAt(entry.stageCode, entry.slug)

    expect(screen.getByTestId('onboarding-stage-transition')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ton offre' })).toBeInTheDocument()
    expect(screen.queryByTestId('onboarding-actions')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))

    expect(screen.queryByTestId('onboarding-stage-transition')).toBeNull()
    expect(screen.getByTestId('onboarding-actions')).toBeInTheDocument()
  })

  it('au milieu d’une étape, aucune transition ne s’interpose', async () => {
    if (!middle) throw new Error('offer_expertise n’a qu’une sous-étape posée')
    await renderAt(middle.stageCode, middle.slug)

    expect(screen.queryByTestId('onboarding-stage-transition')).toBeNull()
    expect(screen.getByTestId('onboarding-actions')).toBeInTheDocument()
  })
})
