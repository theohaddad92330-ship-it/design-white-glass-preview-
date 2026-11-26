import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AnswersRecapDrawer } from './AnswersRecapDrawer'
import type { OnboardingAnswers } from '@/stores/onboardingStore'

const ONBOARDING_ID = '0a3c1861-840d-4606-8324-5fbea19bafff'

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }))

vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => mockNavigate,
}))

beforeEach(() => {
  mockNavigate.mockClear()
})

// #2087.31 — deux réponses de sous-étapes DIFFÉRENTES du même stage, pour
// prouver que chaque ligne ramène à SA sous-étape, pas à la première du stage.
const ANSWERS: OnboardingAnswers = { esn_name: 'Kicklox', sales_team_size: '2-3 personnes' }

describe('AnswersRecapDrawer', () => {
  it('#2087.32 — fermé par défaut : le contenu du récap n’est nulle part avant le clic', async () => {
    renderWithRouter(<AnswersRecapDrawer onboardingId={ONBOARDING_ID} answers={ANSWERS} />)
    expect(await screen.findByRole('button')).toBeInTheDocument()
    expect(screen.queryByText('Kicklox')).not.toBeInTheDocument()
  })

  it('#2087.30 — ouvre un panneau groupé par étape, une ligne par réponse', async () => {
    renderWithRouter(<AnswersRecapDrawer onboardingId={ONBOARDING_ID} answers={ANSWERS} />)
    fireEvent.click(await screen.findByRole('button'))
    expect(await screen.findByText('Kicklox')).toBeInTheDocument()
    expect(screen.getByText('2-3 personnes')).toBeInTheDocument()
  })

  it('#2087.31/.32 — une ligne ramène à SA sous-étape et referme le récap', async () => {
    renderWithRouter(<AnswersRecapDrawer onboardingId={ONBOARDING_ID} answers={ANSWERS} />)
    fireEvent.click(await screen.findByRole('button'))
    fireEvent.click(await screen.findByText('2-3 personnes'))
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/onboarding/$id/$stage/$slug',
      params: { id: ONBOARDING_ID, stage: 'company_info', slug: 'equipe-commerciale' },
    })
    expect(screen.queryByText('Kicklox')).not.toBeInTheDocument()
  })

  it('#2087.30 — sans aucune réponse, un état honnête plutôt qu’un panneau vide', async () => {
    renderWithRouter(<AnswersRecapDrawer onboardingId={ONBOARDING_ID} answers={{}} />)
    fireEvent.click(await screen.findByRole('button'))
    expect(await screen.findByText('Réponds à une première question pour la retrouver ici.')).toBeInTheDocument()
  })
})
