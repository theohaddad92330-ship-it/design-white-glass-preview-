import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { findSubStep, firstSlugOfStage, TEMPS1_STAGE_CODES } from '@/features/onboarding/lib/questions'
import { OnboardingStagePage } from './OnboardingStagePage'

const { mockState, mockParams } = vi.hoisted(() => ({
  mockState: vi.fn(),
  mockParams: vi.fn(() => ({ id: 'x', stage: 'company_info', slug: 'identite' })),
}))

vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useParams: () => mockParams(),
}))
vi.mock('@/features/onboarding/hooks/useOnboarding', () => ({
  useOnboardingState: () => mockState(),
}))
vi.mock('@/features/onboarding/components/GuidedFramingShell', () => ({
  GuidedFramingShell: ({ targetKey }: { targetKey: string | null }) => <p>cadrage:{String(targetKey)}</p>,
}))
vi.mock('@/features/onboarding/view/OnboardingWizard', () => ({
  OnboardingWizard: () => <p>parcours question par question</p>,
}))

beforeEach(() => mockState.mockReset())

// Théo O onboarding-essentiel / onboarding-guide — qui voit le cadrage, qui garde le parcours historique.
describe('OnboardingStagePage', () => {
  it('un espace ordinaire ouvre le cadrage en deux marches', async () => {
    mockState.mockReturnValue({ data: { status: 'in_progress', inherited_answer_keys: [], answers: {} } })
    renderWithRouter(<OnboardingStagePage />)
    expect(await screen.findByText(/^cadrage:/)).toBeInTheDocument()
  })

  it('un membre dont l’entreprise a déjà répondu garde le parcours question par question', async () => {
    mockState.mockReturnValue({ data: { status: 'in_progress', inherited_answer_keys: ['esn_name'], answers: {} } })
    renderWithRouter(<OnboardingStagePage />)
    expect(await screen.findByText('parcours question par question')).toBeInTheDocument()
  })

  // Théo O onboarding-essentiel — l'entrée du parcours (première sous-étape, où mène la fiche entreprise)
  // ouvre l'ESSENTIEL tant qu'il n'est pas traité : elle ne cible aucune question.
  it('l’adresse d’entrée du parcours ne cible aucune question : l’essentiel s’ouvre', async () => {
    const stage = TEMPS1_STAGE_CODES[0] ?? ''
    mockParams.mockReturnValue({ id: 'x', stage, slug: firstSlugOfStage(stage) ?? '' })
    mockState.mockReturnValue({ data: { status: 'in_progress', inherited_answer_keys: [], answers: {} } })
    renderWithRouter(<OnboardingStagePage />)
    expect(await screen.findByText('cadrage:null')).toBeInTheDocument()
  })

  it('une autre adresse (« Modifier » de la relecture) cible sa question', async () => {
    const stage =
      TEMPS1_STAGE_CODES.find(
        code => code !== TEMPS1_STAGE_CODES[0] && findSubStep(code, firstSlugOfStage(code) ?? '')?.questions[0],
      ) ?? ''
    const slug = firstSlugOfStage(stage) ?? ''
    expect(findSubStep(stage, slug)?.questions[0]?.key).toBeTruthy()
    mockParams.mockReturnValue({ id: 'x', stage, slug })
    mockState.mockReturnValue({ data: { status: 'in_progress', inherited_answer_keys: [], answers: {} } })
    renderWithRouter(<OnboardingStagePage />)
    expect(await screen.findByText(`cadrage:${findSubStep(stage, slug)?.questions[0]?.key ?? ''}`)).toBeInTheDocument()
  })
})
