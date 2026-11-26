import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { CompanySuggestion, EsnAnswers } from '@bellum/contracts'
import { describe, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountLaunchSurface } from './AccountLaunchSurface'

beforeAll(() => {
  window.scrollTo = vi.fn()
})

const IDENTIFIED: CompanySuggestion = {
  name: 'TF1',
  siren: '326300159',
  city: 'Paris',
  sector: 'Média',
}

const COMPLETE_ANSWERS: EsnAnswers = {
  esn_name: 'Bellum Consulting',
  consultant_size: '50-100',
  sales_team_size: '5-10',
  expertise_areas: ['Cloud & Infrastructure', 'Data & Intelligence Artificielle'],
  positioning: 'expertiseRare',
  target_sectors: ['Banque de détail & Banque privée'],
  target_company_types: ['ETI (500-5 000 salariés)'],
  staffing_model: 'mixed',
  geo_zones: ['Paris & Île-de-France'],
  remote_and_travel_scope: [],
  zone_capability_status: [],
  main_sales_pain: 'cycle long',
  offer_domain: null,
  offer_domains: [],
  recruits_for_clients: null,
  // Lot 26 — champs additifs, non pertinents pour ce test.
  service_types: [],
  service_types_proven: [],
  service_types_desired: [],
  reference_sectors: [],
  case_study_results: [],
  reference_accounts: [],
  client_testimonials: [],
  expertise_no_concrete_proof: [],
  expertise_client_reference: [],
  expertise_personal_experience: [],
  expertise_partner: [],
  expertise_talent_pool: [],
  staffing_modes: [],
  profile_validation_methods: [],
  contractual_constraints: [],
  priority_sectors: [],
  // #2005.4 (DÉCISION Louis 17/09, lot CP2) — où l'ESN est implantée.
  company_locations: [],
  // #2088.12/.13 (DÉCISION Louis 18/09, point 16) — non pertinents pour ce test.
  consultant_count: null,
  annual_revenue_amount: null,
  annual_revenue_period: null,
  // #2640.2 — non pertinent pour ce test.
  esn_website: null,
}

const h = vi.hoisted(() => ({
  startAnalysis: vi.fn(),
  answers: undefined as EsnAnswers | undefined,
}))

vi.mock('@/features/search/hooks/useAnalysis', () => ({
  useAnalysis: (opts: { onComplete?: (id: string) => void }) => ({
    status: 'idle',
    phase: null,
    percent: null,
    error: null,
    startAnalysis: h.startAnalysis,
    __onComplete: opts?.onComplete,
  }),
}))
vi.mock('@/features/search/hooks/useCompanySearch', () => ({
  useCompanySearch: () => ({
    suggestions: [IDENTIFIED],
    broadenedFrom: undefined,
    sourceUnavailable: false,
    loading: false,
    search: vi.fn(),
    clearSuggestions: vi.fn(),
  }),
}))
vi.mock('@/features/profile/hooks/useEsnProfile', () => ({
  useEsnProfile: () => ({ data: h.answers }),
}))

beforeEach(() => {
  h.startAnalysis.mockClear()
  h.answers = COMPLETE_ANSWERS
})

/** Selects TF1 the way a user would: type the name, pick it from the list. */
async function selectIdentifiedCompany() {
  const input = await screen.findByPlaceholderText(/Recherche une entreprise/)
  fireEvent.change(input, { target: { value: 'TF1' } })
  fireEvent.click(await screen.findByText('TF1'))
}

describe('AccountLaunchSurface — #1584 cadrage express', () => {
  it('affiche « Ce que Bellum va chercher pour toi » avec le profil ESN RÉEL une fois la société choisie', async () => {
    renderWithRouter(<AccountLaunchSurface open onOpenChange={vi.fn()} />)
    await selectIdentifiedCompany()

    expect(await screen.findByText('Ce que Bellum va chercher pour toi')).toBeInTheDocument()
    expect(screen.getByText(/Cloud & Infrastructure/)).toBeInTheDocument()
    expect(screen.getByText(/Paris & Île-de-France/)).toBeInTheDocument()
    expect(screen.getByText(/ETI \(500-5 000 salariés\)/)).toBeInTheDocument()
    expect(screen.getByText(/Banque de détail & Banque privée/)).toBeInTheDocument()
  })

  it('« Modifier le focus » ouvre UN champ facultatif qui alimente user_context au lancement', async () => {
    renderWithRouter(<AccountLaunchSurface open onOpenChange={vi.fn()} />)
    await selectIdentifiedCompany()

    expect(screen.queryByPlaceholderText(/Data & IA, filiales France/)).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier le focus' }))

    const objectiveField = screen.getByPlaceholderText(/Data & IA, filiales France/)
    fireEvent.change(objectiveField, { target: { value: 'Cible la DSI' } })

    fireEvent.click(screen.getByRole('button', { name: 'Analyser' }))

    expect(h.startAnalysis).toHaveBeenCalledTimes(1)
    const [companyName, userContext] = h.startAnalysis.mock.calls[0]
    expect(companyName).toBe('TF1')
    expect(userContext).toEqual({ preset: 'free', notes: 'Cible la DSI' })
  })

  it('sans objectif saisi, user_context reste undefined — comportement inchangé (#1584)', async () => {
    renderWithRouter(<AccountLaunchSurface open onOpenChange={vi.fn()} />)
    await selectIdentifiedCompany()
    fireEvent.click(screen.getByRole('button', { name: 'Analyser' }))

    expect(h.startAnalysis.mock.calls[0]?.[1]).toBeUndefined()
    // Scope reste "groupe" — ce raccourci reste court, pas un second formulaire.
    expect(h.startAnalysis.mock.calls[0]?.[3]).toBe('groupe')
  })

  it('signale un profil ESN incomplet AVANT le débit, sans bloquer le lancement', async () => {
    h.answers = { ...COMPLETE_ANSWERS, target_sectors: [] }
    renderWithRouter(<AccountLaunchSurface open onOpenChange={vi.fn()} />)
    await selectIdentifiedCompany()

    expect(
      await screen.findByText("Ton profil est incomplet : l'analyse sera moins personnalisée."),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Compléter mon profil' })).toBeInTheDocument()
    // L'utilisateur PEUT continuer : le bouton n'est pas désactivé pour cette raison.
    expect(screen.getByRole('button', { name: 'Analyser' })).not.toBeDisabled()
  })

  it('ne signale rien quand le profil ESN est complet', async () => {
    renderWithRouter(<AccountLaunchSurface open onOpenChange={vi.fn()} />)
    await selectIdentifiedCompany()
    await waitFor(() => expect(screen.getByText('Ce que Bellum va chercher pour toi')).toBeInTheDocument())
    expect(screen.queryByText("Ton profil est incomplet : l'analyse sera moins personnalisée.")).not.toBeInTheDocument()
  })

  it("garde le renvoi vers l'analyse complète pour un autre périmètre / une filiale / des exclusions", async () => {
    renderWithRouter(<AccountLaunchSurface open onOpenChange={vi.fn()} />)
    await selectIdentifiedCompany()
    expect(screen.getByText(/filiale/)).toBeInTheDocument()
  })
})
