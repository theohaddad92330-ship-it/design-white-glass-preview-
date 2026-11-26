import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TEMPS1_REQUIRED_KEYS, type OnboardingStateResponse } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { findTheme } from '@/features/onboarding/lib/theme-catalog'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { OnboardingThemePage } from './OnboardingThemePage'

// La barre haute du cadrage porte la bascule clair/sombre : le thème est simulé, pas monté.
vi.mock('@/features/theme/theme-provider', () => ({
  useTheme: () => ({ theme: 'dark', resolvedTheme: 'dark', setTheme: vi.fn(), toggleTheme: vi.fn() }),
}))

// Théo O onboarding-theme — le détail d'un thème et les cinq statuts par réponse.

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

describe('OnboardingThemePage', () => {
  const theme = findTheme('ton-entreprise')!

  const firstGroup = theme.groups[0]!
  const secondGroup = theme.groups[1]!

  it('ouvre UN groupe à la fois : son titre, ses questions, un menu de statut sous chacune', async () => {
    renderWithRouter(<OnboardingThemePage themeSlug={theme.slug} />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Identité et taille' })).toBeInTheDocument()
    expect(screen.getAllByRole('combobox', { name: /^État de la réponse/ })).toHaveLength(firstGroup.questions.length)
    const nav = screen.getByRole('navigation')
    expect(within(nav).getAllByRole('button')).toHaveLength(theme.groups.length)
    expect(
      within(nav)
        .getAllByRole('button')
        .filter(b => b.getAttribute('aria-current') === 'step'),
    ).toHaveLength(1)
  })

  it('« Précisions suivantes » ouvre le groupe suivant, « Dans ce thème » saute à un groupe', async () => {
    renderWithRouter(<OnboardingThemePage themeSlug={theme.slug} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Précisions suivantes' }))
    expect(screen.getAllByRole('combobox', { name: /^État de la réponse/ })).toHaveLength(secondGroup.questions.length)
    const nav = screen.getByRole('navigation')
    fireEvent.click(within(nav).getAllByRole('button')[0]!)
    expect(await screen.findByRole('heading', { level: 1, name: 'Identité et taille' })).toBeInTheDocument()
  })

  it('« Vue du thème » rend tous les groupes, un menu de statut sous CHAQUE question', async () => {
    renderWithRouter(<OnboardingThemePage themeSlug={theme.slug} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Vue du thème' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Ton entreprise' })).toBeInTheDocument()
    expect(screen.getAllByRole('combobox', { name: /^État de la réponse/ })).toHaveLength(theme.questions.length)
  })

  it('les blocs se suivent comme dans la maquette : en-tête, champs et « Dans ce thème », barre d’actions', async () => {
    renderWithRouter(<OnboardingThemePage themeSlug={theme.slug} />)
    await screen.findByRole('heading', { level: 1 })
    const ids = Array.from(document.querySelectorAll('[data-testid]'))
      .map(node => node.getAttribute('data-testid'))
      .filter(id => ['framing-topbar', 'framing-heading', 'theme-groups', 'framing-footer'].includes(id ?? ''))
    expect(ids).toEqual(['framing-topbar', 'framing-heading', 'theme-groups', 'framing-footer'])
    expect(screen.getByRole('link', { name: 'Lire ma restitution' })).toHaveAttribute(
      'href',
      `/onboarding/${state.id}/review`,
    )
    expect(screen.getByRole('link', { name: /Revenir à mon travail/ })).toBeInTheDocument()
  })

  it('ne montre pas un compteur « 0/n » dans le menu des groupes (GA-18)', async () => {
    renderWithRouter(<OnboardingThemePage themeSlug={theme.slug} />)
    const nav = (await screen.findByRole('navigation')) as HTMLElement
    expect(nav.textContent).not.toMatch(/\b0\/\d/)
  })

  it('range la saisie sous un statut d’incertitude et « Répondre » la ramène', async () => {
    const first = theme.questions[0]!
    useOnboardingStore.getState().setAnswer(first.key, '')
    useOnboardingStore.getState().setStatus(first.key, 'answer_later')
    renderWithRouter(<OnboardingThemePage themeSlug={theme.slug} />)
    await screen.findByRole('heading', { level: 1 })
    const card = document.querySelector<HTMLElement>(`[data-question="${first.key}"]`)!
    // le statut « à compléter plus tard » est dit, et un bouton « Répondre » est offert
    expect(within(card).getAllByText('À compléter plus tard').length).toBeGreaterThan(0)
    fireEvent.click(within(card).getByRole('button', { name: 'Répondre' }))
    expect(useOnboardingStore.getState().statuses[first.key]).toBeUndefined()
  })

  it('« Effacer » revient à « pas encore répondu »', async () => {
    const first = theme.questions[0]!
    useOnboardingStore.getState().setStatus(first.key, 'to_verify_with_team')
    renderWithRouter(<OnboardingThemePage themeSlug={theme.slug} />)
    await screen.findByRole('heading', { level: 1 })
    const card = document.querySelector<HTMLElement>(`[data-question="${first.key}"]`)!
    fireEvent.click(within(card).getByRole('button', { name: 'Effacer' }))
    expect(useOnboardingStore.getState().statuses[first.key]).toBeUndefined()
  })

  it('« Retour aux thèmes » mène au catalogue', async () => {
    renderWithRouter(<OnboardingThemePage themeSlug={theme.slug} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Vue du thème' }))
    const back = await screen.findAllByRole('link', { name: 'Retour aux thèmes' })
    expect(back[0]).toHaveAttribute('href', '/onboarding/themes')
  })

  it('dit « Enregistré sur cet appareil » seulement après une vraie réponse', async () => {
    renderWithRouter(<OnboardingThemePage themeSlug={theme.slug} />)
    await screen.findByRole('heading', { level: 1, name: 'Identité et taille' })
    expect(screen.queryByText(/Enregistré sur cet appareil/)).toBeNull()
    cleanup()
    useOnboardingStore.getState().setStatus(theme.questions[0]!.key, 'answer_later')
    renderWithRouter(<OnboardingThemePage themeSlug={theme.slug} />)
    expect(await screen.findByText(/Enregistré sur cet appareil à/)).toBeInTheDocument()
  })

  // #4818 — une question EXIGÉE par la porte de complétion se distingue d'une facultative, sans second registre.
  it('#4818 — marque les questions exigées par la porte (TEMPS1_REQUIRED_KEYS) et AUCUNE autre', async () => {
    renderWithRouter(<OnboardingThemePage themeSlug={theme.slug} />)
    await screen.findByRole('heading', { level: 1, name: 'Identité et taille' })
    const cards = screen.getAllByTestId('framing-field')
    const marked = cards.filter(c => within(c).queryByText('Exigée pour ouvrir ton espace'))
    const markedKeys = marked.map(c => c.getAttribute('data-question'))
    const unmarkedKeys = cards.filter(c => !marked.includes(c)).map(c => c.getAttribute('data-question'))
    expect(markedKeys).toContain('esn_name')
    for (const key of markedKeys) expect(TEMPS1_REQUIRED_KEYS as readonly (string | null)[]).toContain(key)
    for (const key of unmarkedKeys) expect(TEMPS1_REQUIRED_KEYS as readonly (string | null)[]).not.toContain(key)
    expect(unmarkedKeys.length).toBeGreaterThan(0)
  })
})
