import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompanySuggestion, EsnPrefillResponse, PrefillCandidate } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { OnboardingCompanyPage } from './OnboardingCompanyPage'

const {
  mockPrefill,
  mockUseOnboardingState,
  mockUseCompanySearch,
  navigateMock,
  searchMock,
  clearSuggestionsMock,
  avatarProps,
} = vi.hoisted(() => ({
  mockPrefill: vi.fn(),
  mockUseOnboardingState: vi.fn(),
  mockUseCompanySearch: vi.fn(),
  navigateMock: vi.fn(),
  searchMock: vi.fn(),
  clearSuggestionsMock: vi.fn(),
  avatarProps: [] as Array<{ name: string; website: string | null }>,
}))

vi.mock('@/features/onboarding/api', () => ({
  onboardingApi: { prefill: (...args: unknown[]) => mockPrefill(...args) },
  onboardingKeys: { state: ['onboarding', 'state'], activation: ['onboarding', 'activation'] },
}))

// #2015.2 — la carte de confirmation doit afficher le VRAI logo (favicon du
// site connu), pas une icône générique. `CompanyAvatar` gère déjà la
// résolution (logo Apollo puis favicon puis initiale) ; on capture ses props
// plutôt que d'affirmer un `<img src>` — Radix `AvatarImage` ne rend rien de
// synchrone en jsdom (pas d'évènement de chargement d'image).
vi.mock('@/components/ui/CompanyAvatar', () => ({
  CompanyAvatar: (props: { name: string; website?: string | null }) => {
    avatarProps.push({ name: props.name, website: props.website ?? null })
    return null
  },
}))

vi.mock('@/features/onboarding/hooks/useOnboarding', () => ({
  useOnboardingState: () => mockUseOnboardingState(),
}))

vi.mock('@/features/search/hooks/useCompanySearch', () => ({
  useCompanySearch: (...args: unknown[]) => mockUseCompanySearch(...args),
}))

// #2017.1 — le sous-écran « Toute l'entreprise ou un périmètre ? » vit
// maintenant entre la confirmation ci-dessus et le questionnaire : ce fichier
// ne teste QUE la navigation, donc les deux hooks du sous-écran sont réduits
// à des valeurs fixes (aucune BU, rôle `owner`) — son propre comportement est
// couvert par `OnboardingBusinessUnitStep.test.tsx`.
vi.mock('@/features/business-units/hooks/useMyBusinessUnits', () => ({
  useMyBusinessUnits: () => ({
    data: { businessUnits: [], viewerAccess: 'workspace' },
    isLoading: false,
    isError: false,
    join: vi.fn(),
    requestAccess: vi.fn(),
    create: vi.fn(),
    creating: false,
    pendingId: null,
  }),
}))

vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({ team: { workspace: { role: 'owner' } } }),
}))

vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigateMock,
}))

const ONBOARDING_ID = '11111111-2222-3333-4444-555555555555'

/** The first sub-step of the existing 8-step wizard — where every path lands. */
const FIRST_SUBSTEP = {
  to: '/onboarding/$id/$stage/$slug',
  params: { id: ONBOARDING_ID, stage: 'company_info', slug: 'entreprise' },
  replace: true,
}

const MATCHED: EsnPrefillResponse = {
  matched: true,
  company: {
    name: 'KICKLOX',
    legal_name: null,
    commercial_name: null,
    siren: '812345678',
    city: 'Paris',
    country: null,
    naf_code: '6202A',
    naf_label: 'Conseil en systèmes et logiciels informatiques',
    is_esn_naf: true,
    website: 'https://kicklox.com',
    headcount_label: '20 à 49 salariés',
    is_active: null,
    group: null,
  },
  fields: {
    esn_name: {
      value: 'Kicklox',
      confidence: 'high',
      source: 'registry',
      rationale: 'Dénomination au registre',
      as_of: null,
    },
    consultant_size: { value: '10-30', confidence: 'medium', source: 'pappers', as_of: null },
  },
  candidates: [],
  ambiguous: false,
}

const NO_MATCH: EsnPrefillResponse = {
  matched: false,
  company: null,
  fields: {},
  candidates: [],
  ambiguous: false,
}

function candidate(overrides: Partial<PrefillCandidate> = {}): PrefillCandidate {
  return {
    siren: '812345678',
    name: 'KICKLOX',
    city: 'Paris',
    department: '75',
    naf_code: '6202A',
    naf_label: 'Conseil en systèmes et logiciels informatiques',
    is_esn_naf: true,
    headcount_label: '20 à 49 salariés',
    establishment_count: 2,
    creation_date: '2015-03-01',
    score: 0.94,
    ...overrides,
  }
}

/** « Alan » : le garage de Mougins et l'entreprise réelle, aucune ne domine. */
const AMBIGUOUS: EsnPrefillResponse = {
  matched: false,
  company: null,
  fields: {},
  ambiguous: true,
  candidates: [
    candidate({
      siren: '815056807',
      name: 'ALAN',
      naf_code: '65.12Z',
      naf_label: 'Autres assurances',
      is_esn_naf: false,
      headcount_label: '250 à 499 salariés',
    }),
    candidate({
      siren: '400000002',
      name: 'GARAGE ALAN',
      city: 'Mougins',
      naf_code: '45.20A',
      naf_label: 'Entretien et réparation de véhicules',
      is_esn_naf: false,
      headcount_label: '1 à 2 salariés',
    }),
  ],
}

const SUGGESTION: CompanySuggestion = {
  name: 'KICKLOX',
  siren: '812345678',
  city: 'Paris',
  sector: 'Conseil informatique',
}

function setSuggestions(suggestions: CompanySuggestion[] = [], sourceUnavailable = false): void {
  mockUseCompanySearch.mockReturnValue({
    suggestions,
    loading: false,
    sourceUnavailable,
    search: searchMock,
    clearSuggestions: clearSuggestionsMock,
  })
}

function typeName(value: string): void {
  fireEvent.change(screen.getByRole('textbox', { name: 'Nom de ton ESN' }), { target: { value } })
}

/** Mounts the screen next to a sentinel so we can await the router resolving
 *  the route before querying (renderWithRouter renders asynchronously). */
async function renderPage(): Promise<void> {
  renderWithRouter(
    <>
      <OnboardingCompanyPage />
      <div data-testid="sentinel" />
    </>,
  )
  await screen.findByTestId('sentinel')
}

beforeEach(() => {
  vi.clearAllMocks()
  useOnboardingStore.getState().reset()
  mockUseOnboardingState.mockReturnValue({ data: { id: ONBOARDING_ID, status: 'not_started' } })
  setSuggestions()
  mockPrefill.mockResolvedValue(MATCHED)
})

describe('OnboardingCompanyPage — saisie', () => {
  it('asks the autocomplete for the ESN ranking, not the raw registry order', async () => {
    // Sans cette lentille, la liste déroulante propose la SCI homonyme avec la
    // même apparence de légitimité — et la choisir ÉPINGLE son SIREN, ce qui
    // court-circuite par construction la désambiguïsation.
    await renderPage()

    expect(mockUseCompanySearch).toHaveBeenCalledWith('FR', 'esn')
  })

  it('asks for the ESN name with a single field and a manual escape hatch', async () => {
    await renderPage()

    expect(screen.getByText('Quelle est ton ESN ?')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Nom de ton ESN' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remplir manuellement' })).toBeInTheDocument()
  })

  it('keeps the submit disabled until the name is long enough', async () => {
    await renderPage()

    expect(screen.getByRole('button', { name: /Continuer/ })).toBeDisabled()
    typeName('K')
    expect(screen.getByRole('button', { name: /Continuer/ })).toBeDisabled()
    typeName('Kicklox')
    expect(screen.getByRole('button', { name: /Continuer/ })).toBeEnabled()
  })

  it('prefills from free text when no suggestion is picked (no SIREN pinned)', async () => {
    await renderPage()

    typeName('Kicklox')
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }))

    await waitFor(() => expect(mockPrefill).toHaveBeenCalledWith({ name: 'Kicklox', siren: null }))
  })

  it('pins the SIREN when the user picks a registry suggestion', async () => {
    setSuggestions([SUGGESTION])
    await renderPage()

    typeName('Kick')
    fireEvent.click(await screen.findByRole('button', { name: /KICKLOX/ }))

    await waitFor(() => expect(mockPrefill).toHaveBeenCalledWith({ name: 'KICKLOX', siren: '812345678' }))
  })

  it('shows the "fetching public info" spinner while the prefill is in flight', async () => {
    let release: (value: EsnPrefillResponse) => void = () => {}
    mockPrefill.mockReturnValue(new Promise<EsnPrefillResponse>(resolve => (release = resolve)))
    await renderPage()

    typeName('Kicklox')
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }))

    expect(await screen.findByText('On récupère les infos publiques de ton ESN…')).toBeInTheDocument()

    release(MATCHED)
    await screen.findByText("C'est bien ton entreprise ?")
  })
})

describe('OnboardingCompanyPage — recherche indisponible', () => {
  // #2086 — critère de recette : « toutes les actions disposent d'un état
  // loading et error explicite ». `useCompanySearch` distingue déjà « rien
  // trouvé » de « la source n'a pas répondu » (`sourceUnavailable`), mais cet
  // écran jetait le signal : une panne réseau se lisait comme un registre
  // vide de résultats, jamais comme une panne.
  it('names the outage instead of looking like an empty registry', async () => {
    setSuggestions([], true)
    await renderPage()

    expect(
      screen.getByText(
        "La recherche d'entreprises n'a pas répondu — réessaie dans un instant. Ça ne veut pas dire que cette entreprise n'existe pas.",
      ),
    ).toBeInTheDocument()
  })

  it('stays silent once the source answers normally', async () => {
    setSuggestions([], false)
    await renderPage()

    expect(screen.queryByText(/La recherche d'entreprises n'a pas répondu/)).toBeNull()
  })
})

describe('OnboardingCompanyPage — confirmation du match', () => {
  async function reachConfirmation(): Promise<void> {
    await renderPage()
    typeName('Kicklox')
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }))
    await screen.findByText("C'est bien ton entreprise ?")
  }

  // #2086.36 — la transition nomme le moment : la recherche vient d'ABOUTIR.
  it('announces the transition with the exact wording', async () => {
    await reachConfirmation()

    expect(screen.getByText('Parfait. Voici ce que Bellum sait déjà.')).toBeInTheDocument()
  })

  it('displays the resolved legal identity', async () => {
    await reachConfirmation()

    expect(screen.getByText('KICKLOX')).toBeInTheDocument()
    expect(screen.getByText('812345678')).toBeInTheDocument()
    expect(screen.getByText('Paris')).toBeInTheDocument()
    expect(screen.getByText('Conseil en systèmes et logiciels informatiques')).toBeInTheDocument()
    expect(screen.getByText('20 à 49 salariés')).toBeInTheDocument()
  })

  it('#2015.2 — shows the real company logo via CompanyAvatar, never a generic icon', async () => {
    await reachConfirmation()

    expect(avatarProps).toContainEqual({ name: 'KICKLOX', website: 'https://kicklox.com' })
  })

  it('seeds the wizard with the prefilled answers AND their provenance, then routes to sub-step 1', async () => {
    await reachConfirmation()

    fireEvent.click(screen.getByRole('button', { name: /Oui, c'est bien nous/ }))

    const { answers, prefillMeta } = useOnboardingStore.getState()
    expect(answers.esn_name).toBe('Kicklox')
    expect(answers.consultant_size).toBe('10-30')
    expect(prefillMeta.esn_name).toEqual({
      confidence: 'high',
      source: 'registry',
      rationale: 'Dénomination au registre',
      asOf: null,
    })
    // Never prefilled by contract — these two screens stay blank on purpose.
    expect(answers.sales_team_size).toBeUndefined()
    expect(answers.main_sales_pain).toBeUndefined()

    // #2017.1 — la confirmation ouvre désormais « Toute l'entreprise ou un
    // périmètre ? » ; choisir de rester sur « Toute l'entreprise » (le
    // défaut, 2017.19) et continuer reproduit la navigation d'avant, à
    // l'octet près.
    fireEvent.click(await screen.findByTestId('business-unit-scope-continue'))
    expect(navigateMock).toHaveBeenCalledWith(FIRST_SUBSTEP)
  })

  // #4425.2 — la carte montrait le site et l'effectif sans pouvoir les corriger :
  // une erreur du registre repartait telle quelle dans le questionnaire.
  it('#4425.2 — le site web corrigé sur la carte est celui qui entre dans le questionnaire', async () => {
    await reachConfirmation()

    fireEvent.click(screen.getByRole('button', { name: /Modifier — Site web/ }))
    fireEvent.change(screen.getByLabelText('Site web'), { target: { value: 'https://kicklox.fr' } })
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }))
    await waitFor(() => expect(screen.queryByLabelText('Site web')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: /Oui, c'est bien nous/ }))

    expect(useOnboardingStore.getState().answers.esn_website).toBe('https://kicklox.fr')
  })

  it('#4425.2 — le nombre de consultants saisi entre dans le questionnaire (consultant_count)', async () => {
    await reachConfirmation()

    fireEvent.click(screen.getByRole('button', { name: /Modifier — Consultants/ }))
    fireEvent.change(screen.getByLabelText('Consultants'), { target: { value: '42' } })
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }))
    await waitFor(() => expect(screen.queryByLabelText('Consultants')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: /Oui, c'est bien nous/ }))

    expect(useOnboardingStore.getState().answers.consultant_count).toBe('42')
  })

  it('#4425.2 — sans correction, la valeur du registre passe telle quelle (aucune écriture neuve)', async () => {
    await reachConfirmation()
    fireEvent.click(screen.getByRole('button', { name: /Oui, c'est bien nous/ }))
    expect(useOnboardingStore.getState().answers.consultant_count).toBeUndefined()
  })

  it("« Ce n'est pas ma société » returns to a clean input without seeding anything", async () => {
    await reachConfirmation()

    fireEvent.click(screen.getByRole('button', { name: "Ce n'est pas ma société" }))

    expect(screen.getByRole('textbox', { name: 'Nom de ton ESN' })).toHaveValue('')
    expect(screen.queryByText("C'est bien ton entreprise ?")).toBeNull()
    expect(useOnboardingStore.getState().answers).toEqual({})
    expect(navigateMock).not.toHaveBeenCalled()
  })

  // #2086.28 — nomme le bloc de faits trouvés, distinct des réponses du
  // questionnaire lui-même.
  it('names what was found before asking to confirm it', async () => {
    await reachConfirmation()

    expect(screen.getByText('Ce que Bellum a déjà trouvé')).toBeInTheDocument()
  })

  // #2086.29 — vrai, pas rassurant par convention : `applyPrefill` n'écrit
  // qu'en store local tant que le questionnaire n'est pas rempli.
  it('says nothing is saved yet and everything stays correctable', async () => {
    await reachConfirmation()

    expect(screen.getByText("Rien n'est encore enregistré. Tu pourras tout corriger.")).toBeInTheDocument()
  })
})

describe('OnboardingCompanyPage — désambiguïsation des homonymes', () => {
  async function reachList(): Promise<void> {
    mockPrefill.mockResolvedValue(AMBIGUOUS)
    await renderPage()
    typeName('Alan')
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }))
    await screen.findByText(/Plusieurs entreprises correspondent/)
  }

  it('lists the homonyms with the facts needed to tell them apart', async () => {
    await reachList()

    // Aucune carte de confirmation : rien n'a été choisi à la place de l'utilisateur.
    expect(screen.queryByText("C'est bien ton entreprise ?")).toBeNull()
    expect(screen.getByRole('button', { name: /^ALAN /u })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^GARAGE ALAN /u })).toBeInTheDocument()
    expect(screen.getByText(/815056807/)).toBeInTheDocument()
    expect(screen.getByText(/Mougins/)).toBeInTheDocument()
    expect(screen.getByText(/Autres assurances/)).toBeInTheDocument()
  })

  it('#2015.9 — explains WHY the choice matters, not just that several entities exist', async () => {
    await reachList()

    // Le texte doit dire la CONSÉQUENCE d'un mauvais choix, pas seulement le
    // fait qu'il y a plusieurs entités — sinon l'arbitrage ressemble à un
    // détail administratif plutôt qu'à une décision qui compte.
    expect(screen.getByText(/mauvaise identité/)).toBeInTheDocument()
  })

  it('flags a candidate whose sector is not that of an ESN', async () => {
    await reachList()

    expect(screen.getAllByText('Ne semble pas être une ESN')).toHaveLength(2)
  })

  // #2086.31/.32 — met en évidence les faits qui DISTINGUENT réellement les
  // homonymes, jamais ceux qu'ils partagent (un fait partagé n'aide pas à
  // choisir). « Alan » et « Garage Alan » diffèrent de ville, de secteur et
  // d'effectif — ils partagent le même statut ESN (tous deux `false`), qui ne
  // doit donc PAS être nommé comme distinction.
  it('names what actually tells the homonyms apart, never a fact they share', async () => {
    await reachList()

    expect(screen.getByText(/Ce qui les distingue/)).toHaveTextContent('Ville, Secteur (NAF), Effectif')
    expect(screen.queryByText(/Statut ESN/)).toBeNull()
  })

  // #2086.26 — cartes, jamais une liste de texte à chevrons.
  it('renders candidates as cards, never a chevron list', async () => {
    await reachList()

    const list = screen.getByRole('button', { name: /^ALAN /u }).closest('ul')
    expect(list?.textContent ?? '').not.toMatch(/[›»❯]/u)
    expect(list?.querySelector('svg')).toBeNull()
  })

  // #2086.21 — une vraie carte porte un avatar (logo si connu, sinon
  // l'initiale du nom réel — jamais une icône générique) : `CandidateChoice`
  // n'affichait qu'une ligne de texte, sans repère visuel par candidat.
  it('#2086.21 — each candidate card carries a real avatar, one per homonym', async () => {
    await reachList()

    expect(avatarProps).toContainEqual({ name: 'ALAN', website: null })
    expect(avatarProps).toContainEqual({ name: 'GARAGE ALAN', website: null })
  })

  it('names nothing when every candidate shares the same facts', async () => {
    mockPrefill.mockResolvedValue({
      ...AMBIGUOUS,
      candidates: [candidate({ siren: '111111111' }), candidate({ siren: '222222222', name: 'AUTRE ALAN' })],
    })
    await renderPage()
    typeName('Alan')
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }))
    await screen.findByText(/Plusieurs entreprises correspondent/)

    expect(screen.queryByText(/Ce qui les distingue/)).toBeNull()
  })

  it('re-runs the prefill with the picked SIREN pinned', async () => {
    await reachList()
    mockPrefill.mockResolvedValue(MATCHED)

    fireEvent.click(screen.getByRole('button', { name: /^GARAGE ALAN /u }))

    await waitFor(() => expect(mockPrefill).toHaveBeenLastCalledWith({ name: 'GARAGE ALAN', siren: '400000002' }))
    // Le second passage est non ambigu → carte de confirmation.
    await screen.findByText("C'est bien ton entreprise ?")
  })

  it('seeds NOTHING while the identity is unresolved', async () => {
    await reachList()

    expect(useOnboardingStore.getState().answers).toEqual({})
    expect(useOnboardingStore.getState().prefillMeta).toEqual({})
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('« Aucune de ces entreprises » falls back to the manual questionnaire', async () => {
    await reachList()

    fireEvent.click(screen.getByRole('button', { name: 'Aucune de ces entreprises' }))

    // Le nom tapé est conservé, sans badge : c'est la saisie de l'utilisateur.
    expect(useOnboardingStore.getState().answers.esn_name).toBe('Alan')
    expect(useOnboardingStore.getState().prefillMeta.esn_name).toBeUndefined()
    // #2017.1 — la confirmation ouvre désormais « Toute l'entreprise ou un
    // périmètre ? » ; choisir de rester sur « Toute l'entreprise » (le
    // défaut, 2017.19) et continuer reproduit la navigation d'avant, à
    // l'octet près.
    fireEvent.click(await screen.findByTestId('business-unit-scope-continue'))
    expect(navigateMock).toHaveBeenCalledWith(FIRST_SUBSTEP)
  })

  it('« Modifier le nom » returns to a clean input', async () => {
    await reachList()

    fireEvent.click(screen.getByRole('button', { name: 'Modifier le nom' }))

    expect(screen.getByRole('textbox', { name: 'Nom de ton ESN' })).toHaveValue('')
    expect(useOnboardingStore.getState().answers).toEqual({})
  })

  it('an ambiguous verdict with no candidate degrades to the no-match screen', async () => {
    // Sinon l'utilisateur resterait bloqué sur une liste vide.
    mockPrefill.mockResolvedValue({ ...AMBIGUOUS, candidates: [] })
    await renderPage()

    typeName('Alan')
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }))

    expect(await screen.findByText(/Aucune fiche publique trouvée pour/)).toBeInTheDocument()
  })
})

describe('OnboardingCompanyPage — doute signalé sur le match retenu', () => {
  async function reachConfirmationWith(company: EsnPrefillResponse['company']): Promise<void> {
    mockPrefill.mockResolvedValue({ ...MATCHED, company })
    await renderPage()
    typeName('Carrefour')
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }))
    await screen.findByText("C'est bien ton entreprise ?")
  }

  const WARNING = /n'est pas celui d'une ESN/

  it('warns when the registry sector contradicts an ESN activity', async () => {
    await reachConfirmationWith({
      ...MATCHED.company!,
      naf_code: '68.20A',
      naf_label: 'Location de terrains',
      is_esn_naf: false,
    })

    expect(screen.getByText(WARNING)).toBeInTheDocument()
    // L'utilisateur garde la main : on l'avertit, on ne le bloque pas.
    expect(screen.getByRole('button', { name: /Oui, c'est bien nous/ })).toBeEnabled()
  })

  it('stays silent when the sector is coherent', async () => {
    await reachConfirmationWith(MATCHED.company)
    expect(screen.queryByText(WARNING)).toBeNull()
  })

  it('stays silent when the registry gives no sector at all', async () => {
    // « On ne sait pas » n'est pas « ce n'est pas une ESN ».
    await reachConfirmationWith({ ...MATCHED.company!, naf_code: null, naf_label: null, is_esn_naf: null })
    expect(screen.queryByText(WARNING)).toBeNull()
  })
})

describe('OnboardingCompanyPage — identité complète du match (#2015.3, #2015.5, #2015.8)', () => {
  async function reachConfirmationWith(company: EsnPrefillResponse['company']): Promise<void> {
    mockPrefill.mockResolvedValue({ ...MATCHED, company })
    await renderPage()
    typeName('Kicklox')
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }))
    await screen.findByText("C'est bien ton entreprise ?")
  }

  it('#2015.3 — shows the legal name under the displayed name when they differ', async () => {
    await reachConfirmationWith({ ...MATCHED.company!, name: 'Kicklox', legal_name: 'KICKLOX FRANCE SAS' })

    expect(screen.getByText('KICKLOX FRANCE SAS')).toBeInTheDocument()
  })

  it('#2015.3 — shows nothing extra when the legal name equals the displayed name (never a fake duplicate)', async () => {
    await reachConfirmationWith({ ...MATCHED.company!, name: 'KICKLOX', legal_name: 'KICKLOX' })

    expect(screen.queryAllByText('KICKLOX')).toHaveLength(1)
  })

  it('#2015.5 — shows the registered country when known', async () => {
    await reachConfirmationWith({ ...MATCHED.company!, country: 'France' })

    expect(screen.getByText('France')).toBeInTheDocument()
  })

  it('#2015.5 — shows no country row when unknown, never a guessed "France"', async () => {
    await reachConfirmationWith({ ...MATCHED.company!, country: null })

    expect(screen.queryByText('France')).toBeNull()
  })

  it('#2015.8 — states the company is active when the registry says so', async () => {
    await reachConfirmationWith({ ...MATCHED.company!, is_active: true })

    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('#2015.8 — warns when the registry says the company has ceased', async () => {
    await reachConfirmationWith({ ...MATCHED.company!, is_active: false })

    expect(screen.getByText(/déclarée cessée/)).toBeInTheDocument()
    // On avertit, on ne bloque pas — l'utilisateur garde la main.
    expect(screen.getByRole('button', { name: /Oui, c'est bien nous/ })).toBeEnabled()
  })

  it('#2015.8 — stays silent on activity status when the registry has no Pappers data', async () => {
    await reachConfirmationWith({ ...MATCHED.company!, is_active: null })

    expect(screen.queryByText('Active')).toBeNull()
    expect(screen.queryByText(/déclarée cessée/)).toBeNull()
  })
})

// #2086.25 — DÉCISION Louis 17/09 : groupe/filiale s'affiche APRÈS
// confirmation (cette même carte), jamais sur la liste d'homonymes.
describe('OnboardingCompanyPage — groupe ou filiale (#2086.25)', () => {
  async function reachConfirmationWith(company: EsnPrefillResponse['company']): Promise<void> {
    mockPrefill.mockResolvedValue({ ...MATCHED, company })
    await renderPage()
    typeName('Kicklox')
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }))
    await screen.findByText("C'est bien ton entreprise ?")
  }

  it('names the parent company when the cartography found one', async () => {
    await reachConfirmationWith({
      ...MATCHED.company!,
      group: { parentCompanies: ['ALPHABET HOLDINGS'], subsidiaryCount: 0 },
    })

    expect(screen.getByText('ALPHABET HOLDINGS')).toBeInTheDocument()
  })

  it('counts the subsidiaries when the cartography found some', async () => {
    await reachConfirmationWith({
      ...MATCHED.company!,
      group: { parentCompanies: [], subsidiaryCount: 3 },
    })

    expect(screen.getByText('3 filiales')).toBeInTheDocument()
  })

  it('shows no group row when `group` is null, never an empty block', async () => {
    await reachConfirmationWith({ ...MATCHED.company!, group: null })

    expect(screen.queryByText('ALPHABET HOLDINGS')).toBeNull()
    expect(screen.queryByText(/filiale/i)).toBeNull()
  })
})

describe('OnboardingCompanyPage — échappatoires nommées sur le match (#2015.10)', () => {
  async function reachConfirmation(): Promise<void> {
    await renderPage()
    typeName('Kicklox')
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }))
    await screen.findByText("C'est bien ton entreprise ?")
  }

  it('offers five distinct, named ways out of a wrong match — never one generic skip', async () => {
    await reachConfirmation()

    // #1, déjà existant : "Ce n'est pas ma société" (bouton principal).
    expect(screen.getByRole('button', { name: "Ce n'est pas ma société" })).toBeInTheDocument()
    // #2 à #5 : quatre échappatoires NOMMÉES supplémentaires, chacune un
    // geste distinct — pas un `onSkip` générique unique.
    expect(screen.getByRole('button', { name: "C'est un autre établissement du même groupe" })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: "Mon entreprise n'est pas encore immatriculée" })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Les informations affichées sont fausses' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Je préfère tout remplir moi-même' })).toBeInTheDocument()
  })

  it('"autre établissement du groupe" returns to a clean search, like "ce n\'est pas ma société"', async () => {
    await reachConfirmation()

    fireEvent.click(screen.getByRole('button', { name: "C'est un autre établissement du même groupe" }))

    expect(screen.getByRole('textbox', { name: 'Nom de ton ESN' })).toHaveValue('')
    expect(useOnboardingStore.getState().answers).toEqual({})
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('"pas encore immatriculée" keeps the typed name and goes to the blank wizard, discards the wrong prefill', async () => {
    await reachConfirmation()

    fireEvent.click(screen.getByRole('button', { name: "Mon entreprise n'est pas encore immatriculée" }))

    expect(useOnboardingStore.getState().answers.esn_name).toBe('Kicklox')
    expect(useOnboardingStore.getState().prefillMeta.esn_name).toBeUndefined()
    // #2017.1 — la confirmation ouvre désormais « Toute l'entreprise ou un
    // périmètre ? » ; choisir de rester sur « Toute l'entreprise » (le
    // défaut, 2017.19) et continuer reproduit la navigation d'avant, à
    // l'octet près.
    fireEvent.click(await screen.findByTestId('business-unit-scope-continue'))
    expect(navigateMock).toHaveBeenCalledWith(FIRST_SUBSTEP)
  })

  it('"informations fausses" keeps the typed name and goes to the blank wizard, discards the wrong prefill', async () => {
    await reachConfirmation()

    fireEvent.click(screen.getByRole('button', { name: 'Les informations affichées sont fausses' }))

    expect(useOnboardingStore.getState().answers.esn_name).toBe('Kicklox')
    expect(useOnboardingStore.getState().prefillMeta.esn_name).toBeUndefined()
    // #2017.1 — la confirmation ouvre désormais « Toute l'entreprise ou un
    // périmètre ? » ; choisir de rester sur « Toute l'entreprise » (le
    // défaut, 2017.19) et continuer reproduit la navigation d'avant, à
    // l'octet près.
    fireEvent.click(await screen.findByTestId('business-unit-scope-continue'))
    expect(navigateMock).toHaveBeenCalledWith(FIRST_SUBSTEP)
  })

  it('"je préfère tout remplir moi-même" resets everything, like "Remplir manuellement"', async () => {
    await reachConfirmation()

    fireEvent.click(screen.getByRole('button', { name: 'Je préfère tout remplir moi-même' }))

    expect(useOnboardingStore.getState().answers).toEqual({})
    expect(useOnboardingStore.getState().prefillMeta).toEqual({})
    // #2017.1 — la confirmation ouvre désormais « Toute l'entreprise ou un
    // périmètre ? » ; choisir de rester sur « Toute l'entreprise » (le
    // défaut, 2017.19) et continuer reproduit la navigation d'avant, à
    // l'octet près.
    fireEvent.click(await screen.findByTestId('business-unit-scope-continue'))
    expect(navigateMock).toHaveBeenCalledWith(FIRST_SUBSTEP)
  })
})

describe('OnboardingCompanyPage — aucun match / échec', () => {
  it('offers to continue manually when the registry has no record', async () => {
    mockPrefill.mockResolvedValue(NO_MATCH)
    await renderPage()

    typeName('ESN Inconnue')
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }))

    expect(await screen.findByText(/Aucune fiche publique trouvée pour/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Continuer quand même' }))

    // The typed name is kept as a plain answer — no badge, it is the user's input.
    expect(useOnboardingStore.getState().answers.esn_name).toBe('ESN Inconnue')
    expect(useOnboardingStore.getState().prefillMeta.esn_name).toBeUndefined()
    // #2017.1 — la confirmation ouvre désormais « Toute l'entreprise ou un
    // périmètre ? » ; choisir de rester sur « Toute l'entreprise » (le
    // défaut, 2017.19) et continuer reproduit la navigation d'avant, à
    // l'octet près.
    fireEvent.click(await screen.findByTestId('business-unit-scope-continue'))
    expect(navigateMock).toHaveBeenCalledWith(FIRST_SUBSTEP)
  })

  // #2086.33 — pas d'erreur sèche : une phrase + QUATRE choix, jamais deux.
  // #2084.21 — un lien de support attaché À CET état, pas seulement l'aide
  // générique ailleurs sur la page.
  it('offers a support link on the no-match screen', async () => {
    mockPrefill.mockResolvedValue(NO_MATCH)
    await renderPage()

    typeName('ESN Inconnue')
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }))
    await screen.findByText(/Aucune fiche publique trouvée pour/)

    expect(screen.getByRole('button', { name: 'Contacte-nous' })).toBeInTheDocument()
  })

  it('offers four ways forward, never a dead end, when nothing matches', async () => {
    mockPrefill.mockResolvedValue(NO_MATCH)
    await renderPage()

    typeName('ESN Inconnue')
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }))
    await screen.findByText(/Aucune fiche publique trouvée pour/)

    expect(screen.getByRole('button', { name: 'Continuer quand même' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Modifier le nom' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Je lance mon activité' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Je suis indépendant' })).toBeInTheDocument()
  })

  it('« Je lance mon activité » pre-answers the maturity question with the same words picked', async () => {
    mockPrefill.mockResolvedValue(NO_MATCH)
    await renderPage()

    typeName('ESN Inconnue')
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }))
    await screen.findByText(/Aucune fiche publique trouvée pour/)

    fireEvent.click(screen.getByRole('button', { name: 'Je lance mon activité' }))

    expect(useOnboardingStore.getState().answers.esn_maturity_situation).toBe('Activité en création')
    // #2017.1 — la confirmation ouvre désormais « Toute l'entreprise ou un
    // périmètre ? » ; choisir de rester sur « Toute l'entreprise » (le
    // défaut, 2017.19) et continuer reproduit la navigation d'avant, à
    // l'octet près.
    fireEvent.click(await screen.findByTestId('business-unit-scope-continue'))
    expect(navigateMock).toHaveBeenCalledWith(FIRST_SUBSTEP)
  })

  it('« Je suis indépendant » pre-answers the sales team size with the same words picked', async () => {
    mockPrefill.mockResolvedValue(NO_MATCH)
    await renderPage()

    typeName('ESN Inconnue')
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }))
    await screen.findByText(/Aucune fiche publique trouvée pour/)

    fireEvent.click(screen.getByRole('button', { name: 'Je suis indépendant' }))

    expect(useOnboardingStore.getState().answers.sales_team_size).toBe('Je suis seul (fondateur / indépendant)')
    // #2017.1 — la confirmation ouvre désormais « Toute l'entreprise ou un
    // périmètre ? » ; choisir de rester sur « Toute l'entreprise » (le
    // défaut, 2017.19) et continuer reproduit la navigation d'avant, à
    // l'octet près.
    fireEvent.click(await screen.findByTestId('business-unit-scope-continue'))
    expect(navigateMock).toHaveBeenCalledWith(FIRST_SUBSTEP)
  })

  // #2084.1 — un 503 n'est PAS un verdict « introuvable » : le registre n'a
  // pas répondu, ce n'est pas la preuve que l'entreprise n'existe pas. Avant
  // ce test, la requête qui échoue AVANT de savoir retombait sur la même
  // copie que « aucune fiche publique trouvée », ce qui affirmait un fait
  // (l'entreprise est inconnue des registres) que la panne ne permet pas de
  // conclure.
  it('never traps the user when the prefill endpoint fails, and never claims the registry knows the answer', async () => {
    mockPrefill.mockRejectedValue(new Error('503'))
    await renderPage()

    typeName('Kicklox')
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }))

    expect(await screen.findByText("Le registre n'a pas répondu")).toBeInTheDocument()
    expect(screen.queryByText(/Aucune fiche publique trouvée pour/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Continuer quand même' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
    // #2084.21 — un lien de support attaché À CET état.
    expect(screen.getByRole('button', { name: 'Contacte-nous' })).toBeInTheDocument()
  })

  it('lets the user retry after a registry outage instead of only continuing manually', async () => {
    mockPrefill.mockRejectedValue(new Error('503'))
    await renderPage()

    typeName('Kicklox')
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }))
    await screen.findByText("Le registre n'a pas répondu")

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))

    expect(screen.getByRole('textbox', { name: 'Nom de ton ESN' })).toHaveValue('')
    expect(screen.queryByText("Le registre n'a pas répondu")).toBeNull()
  })
})

describe('OnboardingCompanyPage — skip', () => {
  it('« Remplir manuellement » goes to the blank questionnaire, prefill untouched', async () => {
    await renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Remplir manuellement' }))

    expect(mockPrefill).not.toHaveBeenCalled()
    expect(useOnboardingStore.getState().answers).toEqual({})
    expect(useOnboardingStore.getState().prefillMeta).toEqual({})
    // #2017.1 — la confirmation ouvre désormais « Toute l'entreprise ou un
    // périmètre ? » ; choisir de rester sur « Toute l'entreprise » (le
    // défaut, 2017.19) et continuer reproduit la navigation d'avant, à
    // l'octet près.
    fireEvent.click(await screen.findByTestId('business-unit-scope-continue'))
    expect(navigateMock).toHaveBeenCalledWith(FIRST_SUBSTEP)
  })

  it('clears a previous prefill so the manual path is a truly blank slate', async () => {
    await renderPage()

    typeName('Kicklox')
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }))
    await screen.findByText("C'est bien ton entreprise ?")
    fireEvent.click(screen.getByRole('button', { name: "Ce n'est pas ma société" }))
    fireEvent.click(screen.getByRole('button', { name: 'Remplir manuellement' }))

    expect(useOnboardingStore.getState().answers).toEqual({})
    expect(useOnboardingStore.getState().prefillMeta).toEqual({})
  })
})
