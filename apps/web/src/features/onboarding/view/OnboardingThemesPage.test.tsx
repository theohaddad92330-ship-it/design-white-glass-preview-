import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UNKNOWN_ANSWER_LABELS, type OnboardingStateResponse } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { THEMES } from '@/features/onboarding/lib/theme-catalog'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { OnboardingThemesPage } from './OnboardingThemesPage'

// La barre haute du cadrage porte la bascule clair/sombre : le thème est simulé, pas monté.
vi.mock('@/features/theme/theme-provider', () => ({
  useTheme: () => ({ theme: 'dark', resolvedTheme: 'dark', setTheme: vi.fn(), toggleTheme: vi.fn() }),
}))

// Théo O onboarding-catalogue — le catalogue des 16 thèmes.

const { mockUseOnboardingState } = vi.hoisted(() => ({ mockUseOnboardingState: vi.fn() }))

vi.mock('@/features/onboarding/hooks/useOnboarding', () => ({
  useOnboardingState: () => mockUseOnboardingState(),
  useSaveAnswers: () => ({ mutate: vi.fn(), isPending: false }),
}))

const state = {
  id: '0a3c1861-840d-4606-8324-5fbea19bafff',
  status: 'in_progress',
  current_stage_code: 'company_info',
  stages: [],
  answers: {},
} as unknown as OnboardingStateResponse

beforeEach(() => {
  useOnboardingStore.getState().reset()
  mockUseOnboardingState.mockReset()
  mockUseOnboardingState.mockReturnValue({ data: state, isLoading: false })
})

describe('OnboardingThemesPage', () => {
  it('rend les 16 thèmes numérotés, chacun relié à son détail', async () => {
    renderWithRouter(<OnboardingThemesPage />)
    const section = (await screen.findByText('Les 16 thèmes')).closest('section')!
    const links = within(section).getAllByRole('link')
    expect(links).toHaveLength(16)
    expect(links[0]).toHaveAttribute('href', `/onboarding/themes/${THEMES[0]!.slug}`)
  })

  it('dit « Pas encore commencé » et jamais « 0 réponse » (GA-18)', async () => {
    renderWithRouter(<OnboardingThemesPage />)
    const withQuestions = THEMES.filter(theme => theme.questions.length > 0).length
    expect((await screen.findAllByText(/Pas encore commencé · \d+ repères disponibles/)).length).toBe(withQuestions)
    // Un thème sans repère au catalogue ne s'annonce jamais « 0 repère disponible ».
    expect(screen.queryByText(/\b0 repères? disponibles?/)).toBeNull()
    expect(screen.getAllByText('Pas encore de repère dans ce thème')).toHaveLength(16 - withQuestions)
    expect(screen.queryByText(/\b0 réponse/)).toBeNull()
    expect(screen.getByText('Pas encore de réponse · 16 thèmes')).toBeInTheDocument()
  })

  it('reprend les réponses mises de côté, jamais « Non applicable »', async () => {
    const [a, b] = THEMES[0]!.questions
    useOnboardingStore.getState().setStatus(a!.key, 'answer_later')
    useOnboardingStore.getState().setAnswer(b!.key, UNKNOWN_ANSWER_LABELS.not_applicable)
    renderWithRouter(<OnboardingThemesPage />)
    expect(await screen.findByText('Tes réponses à reprendre')).toBeInTheDocument()
    expect(screen.getByText('1 question mise de côté')).toBeInTheDocument()
  })

  it('la recherche parcourt les questions et renvoie vers le thème qui les porte', async () => {
    renderWithRouter(<OnboardingThemesPage />)
    const input = await screen.findByLabelText('Rechercher dans le questionnaire')
    fireEvent.change(input, { target: { value: 'zzzzqq' } })
    expect(await screen.findByText(/Aucune question ne correspond/)).toBeInTheDocument()
    fireEvent.change(input, { target: { value: 'consultants' } })
    const hits = await screen.findAllByRole('link', { name: /consultants/i })
    expect(hits.length).toBeGreaterThan(0)
  })

  it('propose « Reprendre le guidage » et « Voir ma restitution »', async () => {
    renderWithRouter(<OnboardingThemesPage />)
    expect(await screen.findByRole('link', { name: /Reprendre le guidage/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Voir ma restitution/ })).toHaveAttribute(
      'href',
      `/onboarding/${state.id}/review`,
    )
  })

  // Théo O V23 (contrôle 23/10) — l'ordre de la maquette : en-tête, recherche, réponses à reprendre,
  // « À regarder selon tes réponses », les 16 cartes, puis la barre d'actions collée en bas.
  it('les blocs se suivent comme dans la maquette', async () => {
    useOnboardingStore.getState().setStatus(THEMES[0]!.questions[0]!.key, 'to_verify_with_team')
    renderWithRouter(<OnboardingThemesPage />)
    await screen.findByText('Tes réponses à reprendre')
    const ids = Array.from(document.querySelectorAll('[data-testid]'))
      .map(node => node.getAttribute('data-testid'))
      .filter(id => id?.startsWith('catalog-') || id?.startsWith('framing-'))
    expect(ids).toEqual([
      'framing-topbar',
      'framing-heading',
      'catalog-pending',
      'catalog-recommended',
      'catalog-themes',
      'framing-footer',
    ])
    // La couleur dit l'état : « À vérifier avec mon équipe » est une pastille, pas un texte nu.
    expect(within(screen.getByTestId('catalog-pending')).getByText('À vérifier avec mon équipe').className).toMatch(
      /info-soft/,
    )
  })

  it('« Retour » ramène au guidage', async () => {
    renderWithRouter(<OnboardingThemesPage />)
    const footer = await screen.findByTestId('framing-footer')
    expect(within(footer).getByRole('button', { name: 'Retour' })).toBeInTheDocument()
  })
})
