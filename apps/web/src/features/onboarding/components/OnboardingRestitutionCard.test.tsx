import { buildOnboardingRestitution, type OnboardingRestitution } from '@bellum/contracts'
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { OnboardingRestitutionCard } from './OnboardingRestitutionCard'

const EMPTY: OnboardingRestitution = {
  understanding: [],
  bottleneck: null,
  notRecommended: [],
  priorities: [],
  firstTest: null,
  gaps: [],
}

describe('OnboardingRestitutionCard', () => {
  it('renders nothing — never a bare "profile completed" placeholder — when every section is empty', () => {
    const { container } = renderWithRouter(
      <OnboardingRestitutionCard
        restitution={EMPTY}
        onNotMyContext={vi.fn()}
        onRefineWithLaura={vi.fn()}
        onStartFirstWorksite={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the ten understanding axes, priorities, first test and gaps, with all three CTAs wired', async () => {
    const restitution = buildOnboardingRestitution({
      answers: {
        user_role: 'Dirigeant',
        role_tenure: '3 à 5 ans',
        decisions_alone: ['Tarification'],
        team_coordination_mode: 'Réunion hebdomadaire',
        esn_maturity_situation: 'En croissance',
        expertise_areas: [],
        target_sectors: ['Banque'],
        company_locations: ['Paris'],
        consultant_size: '10 à 50 consultants',
        weekly_sales_time_protected: '5 à 10 heures par semaine',
        sales_blockers: ['Pas assez de temps'],
        entry_channels_used: [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      coachingInsights: { mainWeakness: 'prospection irrégulière', keyAdvice: 'régularité bat intensité' },
      hasAccountsToAct: true,
    })

    const onNotMyContext = vi.fn()
    const onRefineWithLaura = vi.fn()
    const onStartFirstWorksite = vi.fn()

    renderWithRouter(
      <OnboardingRestitutionCard
        restitution={restitution}
        onNotMyContext={onNotMyContext}
        onRefineWithLaura={onRefineWithLaura}
        onStartFirstWorksite={onStartFirstWorksite}
      />,
    )

    expect(await screen.findByText('Ce que Bellum a compris')).toBeInTheDocument()
    // décision Louis 19/10 — maillon faible : Cockpit seul. Sait dire NON.
    expect(screen.queryByText('Ton principal maillon faible')).toBeNull()
    expect(screen.queryByText(/prospection irrégulière/)).toBeNull()
    expect(screen.getByText('Ce que je ne te recommande pas')).toBeInTheDocument()
    expect(screen.getByText('Tes trois premières priorités')).toBeInTheDocument()
    expect(screen.getByText('Ton premier test')).toBeInTheDocument()
    expect(screen.getByText("Ce qu'il me manque encore")).toBeInTheDocument()

    fireEvent.click(screen.getByText("Ce n'est pas mon contexte"))
    expect(onNotMyContext).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('Affiner avec Laura'))
    expect(onRefineWithLaura).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('Lancer mon premier chantier'))
    expect(onStartFirstWorksite).toHaveBeenCalledTimes(1)
  })

  it('never shows a weakest-link block nor a confidence score — the Cockpit alone carries it', async () => {
    const restitution = buildOnboardingRestitution({
      answers: null,
      coachingInsights: { mainWeakness: 'maillon faible', keyAdvice: '' },
      hasAccountsToAct: false,
    })
    renderWithRouter(
      <OnboardingRestitutionCard
        restitution={restitution}
        onNotMyContext={vi.fn()}
        onRefineWithLaura={vi.fn()}
        onStartFirstWorksite={vi.fn()}
      />,
    )
    expect(screen.queryByText('Ton principal maillon faible')).toBeNull()
    expect(screen.queryByText(/Confiance :/)).toBeNull()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })
})
