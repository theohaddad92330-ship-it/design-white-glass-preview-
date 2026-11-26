import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OnboardingStateResponse } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ESSENTIAL_STEPS, GUIDED_STEPS } from '@/features/onboarding/lib/guided-framing'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { GuidedFramingShell } from './GuidedFramingShell'

// La barre haute du cadrage porte la bascule clair/sombre : le thème est simulé, pas monté.
vi.mock('@/features/theme/theme-provider', () => ({
  useTheme: () => ({ theme: 'dark', resolvedTheme: 'dark', setTheme: vi.fn(), toggleTheme: vi.fn() }),
}))

// Théo O onboarding-essentiel + onboarding-guide — le cadrage en deux marches.

const { mockUseOnboardingState, saveAsync } = vi.hoisted(() => ({
  mockUseOnboardingState: vi.fn(),
  saveAsync: vi.fn(),
}))

vi.mock('@/features/onboarding/hooks/useOnboarding', () => ({
  useOnboardingState: () => mockUseOnboardingState(),
  useSaveAnswers: () => ({ mutate: vi.fn(), mutateAsync: saveAsync, isPending: false }),
}))

const state = {
  id: '0a3c1861-840d-4606-8324-5fbea19bafff',
  status: 'in_progress',
  current_stage_code: 'company_info',
  stages: [],
  answers: {},
} as unknown as OnboardingStateResponse

function settleEssentials(): void {
  for (const question of ESSENTIAL_STEPS.flatMap(s => s.questions)) {
    useOnboardingStore.getState().setStatus(question.key, 'answer_later')
  }
}

beforeEach(() => {
  useOnboardingStore.getState().reset()
  mockUseOnboardingState.mockReset()
  mockUseOnboardingState.mockReturnValue({ data: state, isLoading: false })
  saveAsync.mockReset()
  saveAsync.mockResolvedValue(state)
})

describe('GuidedFramingShell — l’essentiel', () => {
  it('ouvre sur les cinq blocs, un menu de statut sous chaque repère', async () => {
    renderWithRouter(<GuidedFramingShell targetKey={null} />)
    expect(
      await screen.findByRole('heading', { level: 1, name: /Ce qu’il faut pour que Laura démarre/ }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2, name: /^0\d · / })).toHaveLength(ESSENTIAL_STEPS.length)
    expect(screen.getAllByRole('combobox', { name: /^État de la réponse/ })).toHaveLength(18)
  })

  it('le rail dit « À commencer », jamais « 0/4 » (GA-18)', async () => {
    renderWithRouter(<GuidedFramingShell targetKey={null} />)
    const rail = await screen.findByRole('navigation', { name: 'Étapes du cadrage' })
    expect(within(rail).getAllByText('À commencer')).toHaveLength(ESSENTIAL_STEPS.length)
    expect(rail.textContent).not.toMatch(/\b0\/\d/)
  })

  it('un statut déclaré fait passer le bloc à « traités » sans rien bloquer', async () => {
    useOnboardingStore.getState().setStatus(ESSENTIAL_STEPS[0]!.questions[0]!.key, 'not_yet_known')
    renderWithRouter(<GuidedFramingShell targetKey={null} />)
    const rail = await screen.findByRole('navigation', { name: 'Étapes du cadrage' })
    expect(within(rail).getByText('1/4')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Compléter le premier cadrage' })).toBeEnabled()
  })

  it('« Compléter le premier cadrage » enregistre puis ouvre l’étape guidée 1', async () => {
    renderWithRouter(<GuidedFramingShell targetKey={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Compléter le premier cadrage' }))
    expect(await screen.findByText('Repère 1 / 8')).toBeInTheDocument()
    expect(saveAsync).toHaveBeenCalledTimes(1)
  })

  it('« Tous les thèmes » mène au catalogue, sans route neuve', async () => {
    renderWithRouter(<GuidedFramingShell targetKey={null} />)
    expect(await screen.findByRole('link', { name: 'Tous les thèmes' })).toHaveAttribute('href', '/onboarding/themes')
  })

  it('une réponse proposée depuis le site se dit « à confirmer »', async () => {
    const key = ESSENTIAL_STEPS[0]!.questions[0]!.key
    useOnboardingStore.getState().applyPrefill({
      [key]: { value: 'Altimance', confidence: 'medium', source: 'website', rationale: 'Titre du site', as_of: null },
    })
    renderWithRouter(<GuidedFramingShell targetKey={null} />)
    expect(await screen.findByText(/Laura a prérempli 1 réponses? à partir de ton site/)).toBeInTheDocument()
  })
})

describe('GuidedFramingShell — le guide', () => {
  it('ouvre sur l’étape guidée de la cible, quatre repères visibles et huit étapes au rail', async () => {
    renderWithRouter(<GuidedFramingShell targetKey="horizon" />)
    expect(await screen.findByText('Repère 5 / 8')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Ton cap' })).toBeInTheDocument()
    const rail = screen.getByRole('navigation', { name: 'Étapes du cadrage' })
    expect(within(rail).getAllByRole('button')).toHaveLength(GUIDED_STEPS.length)
  })

  it('« Continuer » ne se bloque jamais : l’étape suivante s’ouvre même sans réponse', async () => {
    settleEssentials()
    renderWithRouter(<GuidedFramingShell targetKey={null} />)
    expect(await screen.findByText('Repère 1 / 8')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))
    expect(await screen.findByText('Repère 2 / 8')).toBeInTheDocument()
  })

  it('le rail est cliquable : on saute à une étape', async () => {
    settleEssentials()
    renderWithRouter(<GuidedFramingShell targetKey={null} />)
    await screen.findByText('Repère 1 / 8')
    const rail = screen.getByRole('navigation', { name: 'Étapes du cadrage' })
    fireEvent.click(within(rail).getByRole('button', { name: /Tes outils/ }))
    expect(await screen.findByText('Repère 7 / 8')).toBeInTheDocument()
  })

  it('« Retour » à l’étape 1 revient aux cinq blocs', async () => {
    settleEssentials()
    renderWithRouter(<GuidedFramingShell targetKey={null} />)
    await screen.findByText('Repère 1 / 8')
    fireEvent.click(screen.getByRole('button', { name: 'Retour' }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: /Ce qu’il faut/ })).toBeInTheDocument())
  })

  it('la dernière étape ne propose que « Terminer ce premier cadrage »', async () => {
    renderWithRouter(<GuidedFramingShell targetKey="detail_level" />)
    await screen.findByText('Repère 8 / 8')
    expect(screen.queryByRole('button', { name: 'Continuer' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Terminer ce premier cadrage' })).toBeInTheDocument()
  })

  it('le fil conducteur ne montre que ce qui est répondu', async () => {
    useOnboardingStore.getState().setAnswer('esn_name', 'Altimance')
    renderWithRouter(<GuidedFramingShell targetKey="horizon" />)
    const aside = (await screen.findByText('Ton fil conducteur')).closest('section')!
    expect(within(aside).getByText('Altimance')).toBeInTheDocument()
    expect(within(aside).queryByText('Territoire')).toBeNull()
  })

  it('aucun crédit, aucun fournisseur nommé', async () => {
    renderWithRouter(<GuidedFramingShell targetKey={null} />)
    await screen.findByRole('heading', { level: 1 })
    expect(document.body.textContent).not.toMatch(/crédits|enrichissements|Apollo|Pappers|Firecrawl|Brave/i)
  })
})

// Théo O V23 (contrôle 23/10) — la STRUCTURE de la maquette, dans l'ordre : barre haute, onglets d'étapes,
// en-tête, champs en grille, fil conducteur, barre d'actions. Un retour au rail vertical ou aux cartes fait rougir.
describe('GuidedFramingShell — la mise en page V23', () => {
  const order = (): string[] =>
    Array.from(document.querySelectorAll('[data-testid]'))
      .map(node => node.getAttribute('data-testid') ?? '')
      .filter(id =>
        ['framing-topbar', 'framing-step-tabs', 'framing-heading', 'framing-thread', 'framing-footer'].includes(id),
      )
      .filter((id, index, all) => all.indexOf(id) === index)

  it('les blocs se suivent comme dans la maquette', async () => {
    settleEssentials()
    renderWithRouter(<GuidedFramingShell targetKey={null} />)
    await screen.findByText('Repère 1 / 8')
    expect(order()).toEqual([
      'framing-topbar',
      'framing-step-tabs',
      'framing-heading',
      'framing-thread',
      'framing-footer',
    ])
  })

  it('les étapes sont des onglets numérotés « 01 … 08 », l’actif marqué', async () => {
    settleEssentials()
    renderWithRouter(<GuidedFramingShell targetKey={null} />)
    await screen.findByText('Repère 1 / 8')
    const tabs = screen.getByTestId('framing-step-tabs')
    expect(within(tabs).getByText('01')).toBeInTheDocument()
    expect(within(tabs).getByText('08')).toBeInTheDocument()
    expect(
      within(tabs)
        .getAllByRole('button')
        .filter(b => b.getAttribute('aria-current') === 'step'),
    ).toHaveLength(1)
  })

  it('les questions sont des champs à plat sur deux colonnes, pas des cartes', async () => {
    settleEssentials()
    renderWithRouter(<GuidedFramingShell targetKey={null} />)
    await screen.findByText('Repère 1 / 8')
    const fields = screen.getAllByTestId('framing-field')
    expect(fields.length).toBeGreaterThan(1)
    expect(fields[0]!.parentElement!.className).toMatch(/md:grid-cols-2/)
    expect(fields[0]!.className).not.toMatch(/rounded/)
  })

  it('une question à choix se lit fermée et s’ouvre en fenêtre sur la liste complète', async () => {
    renderWithRouter(<GuidedFramingShell targetKey="horizon" />)
    await screen.findByText('Repère 5 / 8')
    const pickers = screen.getAllByTestId('question-picker')
    expect(pickers.length).toBeGreaterThan(0)
    fireEvent.click(pickers[0]!)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Valider' })).toBeInTheDocument()
  })

  it('« Aller plus loin » mène aux thèmes par des liens, un par thème', async () => {
    renderWithRouter(<GuidedFramingShell targetKey={null} />)
    await screen.findByText('Aller plus loin, au bon moment')
    expect(screen.getByRole('link', { name: 'Ton entreprise' })).toHaveAttribute(
      'href',
      '/onboarding/themes/ton-entreprise',
    )
  })
})
