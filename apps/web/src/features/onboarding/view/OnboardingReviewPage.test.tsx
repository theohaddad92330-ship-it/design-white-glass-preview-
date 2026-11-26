import userEvent from '@testing-library/user-event'
import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACTIVITY_MEASURES,
  DOSSIER_CONTINUITY_BREAKS,
  ESN_ANSWER_OPTIONS,
  TEMPS1_REQUIRED_KEYS,
  WEEKLY_SALES_TIME_BANDS,
  type EsnAnswers,
  type OnboardingStateResponse,
} from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { OnboardingReviewPage } from './OnboardingReviewPage'

// La barre haute du cadrage porte la bascule clair/sombre : le thème est simulé, pas monté.
vi.mock('@/features/theme/theme-provider', () => ({
  useTheme: () => ({ theme: 'dark', resolvedTheme: 'dark', setTheme: vi.fn(), toggleTheme: vi.fn() }),
}))

/**
 * #2030 — « RELIRE AVANT DE GÉNÉRER L'AUDIT » : les huit blocs, le renvoi
 * « Modifier » vers la bonne sous-étape, le CTA qui déclenche VRAIMENT la
 * génération (#2030.16), coût/durée/aucune action externe (#2030.17/.18).
 */

const ONBOARDING_ID = '0a3c1861-840d-4606-8324-5fbea19bafff'

const { mockNavigate, mockUseOnboardingState, mockUseFirstSelection, mockUseProfileContext } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseOnboardingState: vi.fn(),
  mockUseFirstSelection: vi.fn(),
  mockUseProfileContext: vi.fn(),
}))

vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => mockNavigate,
  useParams: () => ({ id: ONBOARDING_ID }),
}))

vi.mock('@/features/onboarding/hooks/useOnboarding', () => ({
  useOnboardingState: () => mockUseOnboardingState(),
  // #2626.2 — inerte par défaut ici : la carte a ses propres tests
  // (`FirstSelectionCard.test.tsx`), ce fichier vérifie seulement qu'elle EST
  // montée sur l'écran de relecture.
  useFirstSelection: () => mockUseFirstSelection(),
  // Théo O onboarding-relecture — le bloc de validation clôt l'onboarding après avoir validé le cadrage.
  useCompleteOnboarding: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

// Théo O onboarding-relecture.N1/N2 — décisions par orientation et validation : inertes par défaut,
// leurs propres tests sont plus bas.
const { mockFraming, mockSaveDecision, mockValidate } = vi.hoisted(() => ({
  mockFraming: vi.fn(),
  mockSaveDecision: vi.fn(),
  mockValidate: vi.fn(),
}))
vi.mock('@/features/onboarding/hooks/useFraming', () => ({
  useFraming: () => mockFraming(),
  useSaveFramingDecision: () => ({ mutate: mockSaveDecision, isPending: false }),
  useValidateFraming: () => ({ mutateAsync: mockValidate, isPending: false }),
}))

// #2088.34 — la lecture de Laura vient de `profile_context.contradiction`
// (le profileur), distincte des huit détecteurs déterministes testés plus
// bas : par défaut, aucune donnée (comme un profil pas encore généré).
vi.mock('@/features/profile-context/hooks/useProfileContext', () => ({
  useProfileContext: () => mockUseProfileContext(),
}))

const state: OnboardingStateResponse = {
  id: ONBOARDING_ID,
  status: 'in_progress',
  current_stage_code: 'target_market',
  stages: [],
  answers: {},
} as unknown as OnboardingStateResponse

/**
 * #4875.3 — une relecture qui NOMME un manque interdit de valider : les tests qui
 * valident partent donc d'un cadrage COMPLET (les dix réponses exigées du contrat).
 */
function fillRequiredAnswers(): void {
  const lists = new Set<string>(['expertise_areas', 'target_sectors', 'target_company_types', 'geo_zones'])
  for (const key of TEMPS1_REQUIRED_KEYS) {
    const options = ESN_ANSWER_OPTIONS[key as keyof typeof ESN_ANSWER_OPTIONS] as readonly string[] | undefined
    const first = options?.[0] ?? 'renseigné'
    useOnboardingStore.getState().setAnswer(key, lists.has(key) ? [first] : first)
  }
}

beforeEach(() => {
  useOnboardingStore.getState().reset()
  mockNavigate.mockClear()
  mockUseOnboardingState.mockReset()
  mockUseOnboardingState.mockReturnValue({ data: state, isLoading: false })
  mockUseFirstSelection.mockReset()
  mockUseFirstSelection.mockReturnValue({ data: { suggestions: [] }, isLoading: false })
  mockUseProfileContext.mockReset()
  mockUseProfileContext.mockReturnValue({ data: undefined, isLoading: false })
  mockFraming.mockReset()
  mockFraming.mockReturnValue({ data: { decisions: {}, validated_at: null, validated_digest: null } })
  mockSaveDecision.mockReset()
  mockValidate.mockReset()
})

describe('#2030.1-.8 — les huit blocs du récapitulatif', () => {
  it('rend les huit titres, dont les six sections #2089.3-.9', async () => {
    renderWithRouter(<OnboardingReviewPage />)
    expect(await screen.findByText('Organisation')).toBeInTheDocument()
    for (const title of [
      'BU',
      'Rôle',
      'Offre',
      'Marché',
      'Système commercial',
      'Objectifs',
      'Informations à vérifier',
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument()
    }
  })
})

describe('#2626.2 — la première sélection de comptes (Théo O : déplacée au lancement, une fois le cadrage relu)', () => {
  it('affiche la carte dans le bloc « premier échange » quand la découverte a trouvé des comptes et que le cadrage est relu', async () => {
    fillRequiredAnswers()
    mockUseFirstSelection.mockReturnValue({
      data: { suggestions: [{ name: 'BPCE', siren: '493455042', city: 'Paris', sector: 'Banque' }] },
      isLoading: false,
    })

    renderWithRouter(<OnboardingReviewPage />)

    // Avant la validation : aucun compte n'est montré (Théo : rien avant le lancement).
    expect(await screen.findByText('Organisation')).toBeInTheDocument()
    expect(screen.queryByText('BPCE')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.queryByText('BPCE')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Valider et préparer mon premier travail' }))
    expect(await screen.findByText('BPCE')).toBeInTheDocument()
  })

  it('ne casse rien quand la découverte n’a rien trouvé', async () => {
    renderWithRouter(<OnboardingReviewPage />)
    expect(await screen.findByText('Organisation')).toBeInTheDocument()
  })
})

describe('#2041.1 — la relance « plus de deux secteurs prioritaires » ATTEINT l’écran', () => {
  const SECTEURS = ['Banque de détail & Banque privée', 'Aéronautique & Défense', 'Santé & Medtech']

  function answerPrioritySectors(values: string[]): void {
    useOnboardingStore.getState().setAnswer('target_sectors', values)
    useOnboardingStore.getState().setAnswer('priority_sectors', values)
  }

  it('nomme la tension quand TROIS secteurs sont déclarés prioritaires', async () => {
    // L'appelant, c'est tout l'objet de ce test : le détecteur et son
    // compositeur de phrase existaient sans qu'aucun écran ne les lise.
    answerPrioritySectors(SECTEURS)
    renderWithRouter(<OnboardingReviewPage />)
    expect(await screen.findByText('Deux réponses qui tirent en sens opposé')).toBeInTheDocument()
    expect(screen.getByText(/3 secteurs déclarés prioritaires/)).toBeInTheDocument()
    expect(screen.getByText(/2 secteurs au-delà desquels/)).toBeInTheDocument()
    // ⚠️ Ce test ne dit RIEN de l'hypothèse d'audit, à dessein. Ce qu'il tient
    // est le détecteur : la tension est NOMMÉE avec les deux réponses réelles.
    // Le MOMENT où l'hypothèse se lit (d'emblée, ou révélée au clic sur
    // « Expliquer », #2029.11) est une décision d'écran qui vit dans son propre
    // lot ; l'affirmer ici ferait rougir cette suite au premier changement de
    // présentation, pour un fait que ce test n'a pas pour rôle de garder.
  })

  it('renvoie vers la sous-étape des secteurs, et n’écrit rien', async () => {
    answerPrioritySectors(SECTEURS)
    renderWithRouter(<OnboardingReviewPage />)
    const corriger = await screen.findByRole('button', { name: 'Corriger' })
    fireEvent.click(corriger)
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/onboarding/$id/$stage/$slug',
      params: { id: ONBOARDING_ID, stage: 'target_market', slug: 'secteurs' },
    })
  })

  it('se tait À DEUX — le seuil n’est pas un dépassement', async () => {
    answerPrioritySectors(SECTEURS.slice(0, 2))
    renderWithRouter(<OnboardingReviewPage />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Voici ton contexte.' })).toBeInTheDocument()
    expect(screen.queryByText('Deux réponses qui tirent en sens opposé')).not.toBeInTheDocument()
  })

  it('se tait quand la question n’a pas été répondue — non mesuré n’est pas zéro', async () => {
    // Témoin voisin légitime : vingt secteurs VISÉS, aucun déclaré prioritaire.
    useOnboardingStore.getState().setAnswer('target_sectors', SECTEURS)
    renderWithRouter(<OnboardingReviewPage />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Voici ton contexte.' })).toBeInTheDocument()
    expect(screen.queryByText(/secteurs déclarés prioritaires/)).not.toBeInTheDocument()
  })
})

describe('#2089.1/.2 — titre et sous-titre (Théo O V23 : « Relire avant d’appliquer »)', () => {
  it('affiche le surtitre, le titre et la phrase de la maquette, sans jamais compter zéro repère', async () => {
    renderWithRouter(<OnboardingReviewPage />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Voici ton contexte.' })).toBeInTheDocument()
    expect(screen.getByText('Relire avant d’appliquer')).toBeInTheDocument()
    expect(screen.getByText(/Tu n’as encore renseigné aucun repère/)).toBeInTheDocument()
    expect(screen.queryByText(/\b0 repère/)).toBeNull()
  })

  it('nomme la personne par son prénom déclaré', async () => {
    useOnboardingStore.getState().setAnswer('first_name', 'Claire')
    renderWithRouter(<OnboardingReviewPage />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Claire, voici ton contexte.' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Claire, voici le cap que je te propose.' }),
    ).toBeInTheDocument()
  })
})

// Théo O V23 (contrôle 23/10) — l'ordre de la maquette : ton contexte (grille), « tu peux aussi », toutes les
// réponses, « Ce que Laura a compris », puis les deux colonnes et la validation.
describe('Théo O onboarding-relecture — la structure de la maquette', () => {
  it('les blocs se suivent dans l’ordre de la maquette', async () => {
    useOnboardingStore.getState().setAnswer('reference_accounts', ['Société Générale'])
    renderWithRouter(<OnboardingReviewPage />)
    await screen.findByRole('heading', { level: 1 })
    const ids = Array.from(document.querySelectorAll('[data-testid]'))
      .map(node => node.getAttribute('data-testid') ?? '')
      .filter(id => id.startsWith('review-') || id === 'framing-heading')
      .filter(id => !['review-points-to-decide'].includes(id))
    expect(ids).toEqual([
      'framing-heading',
      'review-context-grid',
      'review-also',
      'review-all-answers',
      'review-understood',
      'review-orientations',
      'review-clarify',
      'review-changes',
      'review-validation',
    ])
  })

  it('relue SEULE (rechargement, autre appareil), elle lit les réponses enregistrées — jamais une grille vide', async () => {
    mockUseOnboardingState.mockReturnValue({
      data: { ...state, answers: { ...state.answers, esn_name: 'Altimance' } },
      isLoading: false,
    })
    renderWithRouter(<OnboardingReviewPage />)
    const grid = await screen.findByTestId('review-context-grid')
    expect(await within(grid).findByText('Altimance')).toBeInTheDocument()
  })

  it('la grille « Ton contexte » a huit cases, chacune corrigeable', async () => {
    renderWithRouter(<OnboardingReviewPage />)
    const grid = await screen.findByTestId('review-context-grid')
    expect(within(grid).getAllByRole('listitem')).toHaveLength(8)
    expect(within(grid).getAllByRole('link', { name: /^Corriger : / })).toHaveLength(8)
  })

  it('« Valider et préparer mon premier travail » ouvre le lancement sur la même adresse, « Retour » revient', async () => {
    fillRequiredAnswers()
    mockValidate.mockResolvedValue({ decisions: {}, validated_at: '2026-10-22T10:00:00.000Z', validated_digest: 'x' })
    renderWithRouter(<OnboardingReviewPage />)
    await screen.findByRole('heading', { level: 1, name: 'Voici ton contexte.' })
    expect(screen.queryByTestId('framing-launch')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox'))
    const cta = screen.getByRole('button', { name: 'Valider et préparer mon premier travail' })
    await vi.waitFor(() => expect(cta).toBeEnabled())
    fireEvent.click(cta)
    // L'écran de lancement REMPLACE la relecture : son en-tête, la demande, la sélection, les prochains pas.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ton premier travail est prêt à être formulé.' }),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('review-context-grid')).toBeNull()
    const order = Array.from(document.querySelectorAll('[data-testid]'))
      .map(node => node.getAttribute('data-testid') ?? '')
      .filter(id => ['framing-heading', 'launch-draft', 'launch-next', 'framing-footer'].includes(id))
    expect(order).toEqual(['framing-heading', 'launch-draft', 'launch-next', 'framing-footer'])
    fireEvent.click(within(screen.getByTestId('framing-footer')).getByRole('button', { name: 'Retour' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Voici ton contexte.' })).toBeInTheDocument()
  })
})

describe('#2089.27 — possibilité de quitter (Théo O : « Reprendre plus tard » remplace « Quitter »)', () => {
  it('propose « Reprendre plus tard », qui renvoie vers Laura — les réponses sont déjà enregistrées', async () => {
    renderWithRouter(<OnboardingReviewPage />)
    const later = await screen.findByRole('link', { name: /Reprendre plus tard/ })
    expect(later).toHaveAttribute('href', '/chat')
  })
})

describe('#2089.20 — bloc orange, informations manquantes', () => {
  it('affiche le bloc d’avertissement quand des données manquent', async () => {
    renderWithRouter(<OnboardingReviewPage />)
    expect(await screen.findByText('Ces informations limiteront certaines recommandations')).toBeInTheDocument()
  })
})

describe('#2089.21/.22 — trois points d’attention', () => {
  it('affiche le bloc « Trois points » avec au moins une tension et une action', async () => {
    renderWithRouter(<OnboardingReviewPage />)
    expect(await screen.findByText("Trois points méritent ton attention avant l'audit")).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Répondre' }).length).toBeGreaterThan(0)
  })
})

describe('#2030.9 — Modifier renvoie vers la bonne sous-étape', () => {
  it('navigue vers la première sous-étape « Entreprise » au clic', async () => {
    renderWithRouter(<OnboardingReviewPage />)
    const modifyButtons = await screen.findAllByRole('button', { name: 'Modifier' })
    fireEvent.click(modifyButtons[0])
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/onboarding/$id/$stage/$slug',
      params: { id: ONBOARDING_ID, stage: 'company_info', slug: 'entreprise' },
    })
  })
})

describe('#2030.16/.17/.18/#2089.28 — CTA, coût, durée, aucune action externe', () => {
  it('ouvre l’écran de génération dédié au clic sur « Générer mon audit »', async () => {
    renderWithRouter(<OnboardingReviewPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Générer mon audit' }))
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/onboarding/$id/generating',
      params: { id: ONBOARDING_ID },
    })
  })

  it('affiche « Gratuit », la durée et l’absence d’action externe — sans mention de crédit (#4463)', async () => {
    renderWithRouter(<OnboardingReviewPage />)
    expect(await screen.findByText('Gratuit')).toBeInTheDocument()
    expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument()
    expect(screen.getByText(/environ 3 à 6 minutes/i)).toBeInTheDocument()
    expect(screen.getByText("Aucune action externe n'est déclenchée")).toBeInTheDocument()
  })
})

/**
 * #2008.10 — le déclencheur autorisé 2 (« Générer mon audit », #2008.5) est
 * aussi le moment où on VALIDE des réponses éditées : la relecture doit dire
 * que l'audit ne s'actualise pas tout seul pendant l'édition, seulement au
 * clic sur ce bouton — la même doctrine que #2008.3 (une sauvegarde ne
 * relance pas le modèle), mais lue depuis l'écran plutôt que dans le code.
 */
describe('#2008.10 — le message d’actualisation avant validation', () => {
  it('dit que l’audit sera actualisé au clic sur « Générer mon audit »', async () => {
    renderWithRouter(<OnboardingReviewPage />)
    expect(
      await screen.findByText('Ton audit sera actualisé lorsque tu valideras ces changements.'),
    ).toBeInTheDocument()
  })
})

/**
 * #2030.13 — « mettre en évidence les contradictions ».
 *
 * `buildQuestionnaireContradictions` (#2029) calculait déjà la phrase exacte et
 * le renvoi « Corriger », et N'AVAIT AUCUN APPELANT : du code juste, testé, que
 * personne n'appelait — le motif n°1 du dépôt. Ces trois tests tiennent les
 * trois bords : il sait dire OUI (une vraie tension est listée), il sait dire
 * NON (un espace sans tension n'affiche rien), et il ne se contente pas
 * d'exister (le bouton « Corriger » renvoie sur la sous-étape réelle).
 */
describe('#2030.13 — les contradictions sont mises en évidence, avec de quoi corriger', () => {
  /** #2029.3 — « niche » annoncée + six domaines d'expertise cochés. */
  const NICHE_OFFRE_LARGE = {
    positioning: ESN_ANSWER_OPTIONS.positioning[0],
    expertise_areas: ESN_ANSWER_OPTIONS.expertise_areas.slice(0, 6),
  } as unknown as EsnAnswers

  it('liste la tension avec la phrase « Tu m’as indiqué X et Y… » et son hypothèse', async () => {
    useOnboardingStore.getState().hydrate(NICHE_OFFRE_LARGE)
    renderWithRouter(<OnboardingReviewPage />)

    expect(await screen.findByText('Deux réponses qui tirent en sens opposé')).toBeInTheDocument()
    expect(screen.getByText(/Tu m'as indiqué .+ et 6 domaines d'expertise cochés/)).toBeInTheDocument()

    // #2029.11 — l'HYPOTHÈSE se révèle au clic sur « Expliquer », elle ne
    // s'affiche pas d'emblée : c'est une question à se poser, jamais une faute
    // constatée, et l'écran de relecture ne met pas huit reproches sous les
    // yeux. La décision vit dans l'en-tête d'`OnboardingContradictionCard` ;
    // ce test la TIENT plutôt que de la contredire — et il dit toujours NON,
    // puisque l'hypothèse doit apparaître APRÈS le clic.
    expect(screen.queryByText(/cette largeur d'expertise reste une spécialisation/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Expliquer' }))
    expect(screen.getByText(/cette largeur d'expertise reste une spécialisation/)).toBeInTheDocument()
  })

  it('LE TÉMOIN — un espace sans tension détectée n’affiche AUCUNE carte', async () => {
    renderWithRouter(<OnboardingReviewPage />)
    await screen.findByText('Organisation')
    expect(screen.queryByText('Deux réponses qui tirent en sens opposé')).toBeNull()
  })

  it('« Corriger » renvoie sur la sous-étape qui porte la réponse en tension', async () => {
    useOnboardingStore.getState().hydrate(NICHE_OFFRE_LARGE)
    renderWithRouter(<OnboardingReviewPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Corriger' }))
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/onboarding/$id/$stage/$slug',
      params: { id: ONBOARDING_ID, stage: 'offer_expertise', slug: 'positionnement' },
    })
  })
})

/**
 * #2042.15 · #2043.10 · #2049.15 · #2050.14 · #2051.16 — la lecture d'audit.
 *
 * Les cinq dérivations sont testées une par une côté contrat
 * (`packages/contracts/src/schemas/onboarding/audit-readout.test.ts` ; le nombre
 * de fronts, depuis #2067, par `frontsBudget` — le MÊME calcul que l'audit).
 * Ce qui se prouve ICI est ce qu'un test de contrat ne peut pas voir : qu'un
 * ÉCRAN les affiche, qu'il NOMME ce qui n'est pas mesurable plutôt que de
 * l'écrire « 0 », et qu'aucun pourcentage n'apparaît nulle part.
 */
describe('la lecture d’audit dit ce qu’elle sait ET ce qu’elle ne sait pas', () => {
  it('affiche les cinq lignes quand les réponses le permettent, et CITE la rupture', async () => {
    useOnboardingStore.getState().hydrate({
      weekly_sales_time_protected: WEEKLY_SALES_TIME_BANDS[2], // 2 à 5 h → 1 front
      dossier_continuity_breaks: [DOSSIER_CONTINUITY_BREAKS[3]],
      ideal_client_accessibility: 'Hors réseau actuel, prospection à froid nécessaire',
      real_response_level: 'Niveau opérationnel',
      budget_validator: 'Un niveau direction générale (COMEX)',
      activity_measures_tracked: [ACTIVITY_MEASURES[0].value],
    } as unknown as EsnAnswers)
    renderWithRouter(<OnboardingReviewPage />)

    expect(await screen.findByText("Ce que l'audit sait déjà dire de tes réponses")).toBeInTheDocument()
    // #2050.14 — MOINS de fronts, et le texte refuse explicitement l'outil de plus.
    expect(screen.getByText(/l'audit visera 1 front à la fois — pas un outil de plus/)).toBeInTheDocument()
    // #2051.16 — la routine CITE la rupture, elle ne la compte pas seulement.
    expect(screen.getByText(/1 routine se configure/)).toBeInTheDocument()
    // (la même phrase figure aussi dans « Relire toutes mes réponses » : on la cherche dans la lecture d'audit)
    const readout = screen.getByText("Ce que l'audit sait déjà dire de tes réponses").parentElement as HTMLElement
    expect(within(readout).getByText(new RegExp(DOSSIER_CONTINUITY_BREAKS[3]))).toBeInTheDocument()
    // #2042.15 — le point de départ diffère de l'ambition.
    expect(screen.getByText(/Ton point de départ n'est pas ton ambition/)).toBeInTheDocument()
    // #2043.10 — l'axe est NOMMÉ.
    expect(screen.getByText(/plusieurs fils en parallèle/)).toBeInTheDocument()
    // #2049.15 — la rupture est localisée, sans conversion inventée.
    expect(screen.getByText(/cesse d'être mesurée à/)).toBeInTheDocument()
    expect(screen.getByText(/n'invente aucune conversion/)).toBeInTheDocument()
  })

  it('NOMME les cinq axes non mesurables plutôt que de les écrire « 0 »', async () => {
    renderWithRouter(<OnboardingReviewPage />)

    expect(await screen.findByText("Ce que l'audit ne peut pas encore dire")).toBeInTheDocument()
    expect(screen.getByText(/le temps commercial n'est pas déclaré/)).toBeInTheDocument()
    expect(screen.getByText(/aucune rupture de continuité n'est nommée/)).toBeInTheDocument()
    expect(screen.getByText(/rien n'est déclaré sur l'accès à ton client idéal/)).toBeInTheDocument()
    expect(screen.getByText(/le niveau auquel tes réponses arrivent n'est pas déclaré/)).toBeInTheDocument()
    expect(screen.getByText(/aucune unité suivie n'est déclarée/)).toBeInTheDocument()
    // LE BORD : aucun « 0 » n'est affiché à la place d'un axe non mesuré.
    expect(screen.queryByText(/0 front|0 routine/)).toBeNull()
  })
})

describe('chargement', () => {
  it("n'affiche pas le CTA tant que l'état n'est pas chargé", () => {
    mockUseOnboardingState.mockReturnValue({ data: undefined, isLoading: true })
    renderWithRouter(<OnboardingReviewPage />)
    expect(screen.queryByRole('button', { name: 'Générer mon audit' })).not.toBeInTheDocument()
  })
})

/**
 * #2030.13 — LES CONTRADICTIONS SONT MISES EN ÉVIDENCE.
 *
 * Les huit détecteurs (#2029) étaient écrits, testés et bilingues, et
 * `buildQuestionnaireContradictions` n'avait AUCUN appelant. Ces tests gardent
 * l'appelant, pas le calcul — c'est lui qui manquait.
 *
 * Le cas choisi est `distant_zones_no_reach` (#2029.7) : deux zones aux
 * extrémités opposées, sans couverture nationale déclarée.
 */
describe('#2030.13 — les contradictions, mises en évidence', () => {
  const NORTH = 'Lille & Hauts-de-France'
  const SOUTH = 'Toulouse & Occitanie'

  it('sans tension, AUCUN bloc de contradiction — jamais « aucune contradiction »', async () => {
    renderWithRouter(<OnboardingReviewPage />)
    await screen.findByText('Organisation')
    expect(screen.queryByText('Deux réponses qui tirent en sens opposé')).not.toBeInTheDocument()
  })

  it('nomme les DEUX réponses qui tirent en sens opposé, sans juger', async () => {
    useOnboardingStore.getState().setAnswer('geo_zones', [NORTH, SOUTH])
    renderWithRouter(<OnboardingReviewPage />)
    expect(await screen.findByText('Deux réponses qui tirent en sens opposé')).toBeInTheDocument()
    expect(screen.getByText(`Tu m'as indiqué ${NORTH} et ${SOUTH}…`)).toBeInTheDocument()
  })

  it('« Expliquer » révèle l’HYPOTHÈSE d’audit, jamais une faute (#2029.11)', async () => {
    useOnboardingStore.getState().setAnswer('geo_zones', [NORTH, SOUTH])
    renderWithRouter(<OnboardingReviewPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Expliquer' }))
    expect(screen.getByText(/Vaut-il vérifier/)).toBeInTheDocument()
  })

  it('« Corriger » renvoie à la sous-étape de la question en tension (#2030.9)', async () => {
    useOnboardingStore.getState().setAnswer('geo_zones', [NORTH, SOUTH])
    renderWithRouter(<OnboardingReviewPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Corriger' }))
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/onboarding/$id/$stage/$slug',
      params: { id: ONBOARDING_ID, stage: expect.any(String), slug: expect.any(String) },
    })
  })

  it('« Maintenir les deux » est une réponse LÉGITIME, et elle se confirme (#2029.10)', async () => {
    useOnboardingStore.getState().setAnswer('geo_zones', [NORTH, SOUTH])
    renderWithRouter(<OnboardingReviewPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Maintenir les deux' }))
    expect(screen.getByText('Tu as confirmé vouloir garder les deux réponses.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Corriger' })).not.toBeInTheDocument()
  })

  // #2088.34 — la carte porte désormais le nom de Laura (D82 : le copilote
  // s'appelle Laura, partout), en plus de la phrase déjà tenue par les tests
  // ci-dessus. Non bloquante et non répétée : elle ne s'affiche qu'une fois
  // par tension, jamais en boucle (les boutons Expliquer/Corriger/Maintenir
  // restent inchangés, testés plus haut).
  it("nomme Laura dans l'en-tête de la carte de contradiction (#2088.34)", async () => {
    useOnboardingStore.getState().setAnswer('geo_zones', [NORTH, SOUTH])
    renderWithRouter(<OnboardingReviewPage />)
    expect(await screen.findByText('Laura a repéré une tension')).toBeInTheDocument()
  })
})

/**
 * #2088.34 — LA LECTURE DE LAURA (le profileur), distincte des huit
 * détecteurs déterministes ci-dessus (`buildQuestionnaireContradictions`).
 *
 * Doctrine tranchée le 18/09/2026 : une hypothèse du modèle sort avec son
 * `reasoning`, affichée COMME une hypothèse, jamais comme un fait établi —
 * non bloquante, trois choix, et AUCUNE ligne quand le profileur n'en repère
 * aucune (décision Louis 20/09 : une absence ne fait aucune ligne).
 */
describe('#2088.34 — la carte de lecture de Laura (profil, non bloquante)', () => {
  const CONTRADICTION = {
    statement: 'Tu as sélectionné dix secteurs prioritaires alors que ton équipe commerciale compte deux personnes.',
    reasoning: 'Ça vient de tes réponses priority_sectors (10 valeurs) et sales_team_size (2-3 personnes).',
  }

  function withContradiction(contradiction: { statement: string; reasoning: string } | null = CONTRADICTION) {
    mockUseProfileContext.mockReturnValue({
      data: { profile_context: { esnArchetype: 'boutiqueExpert', sellingPosture: 'expertiseRare', contradiction } },
      isLoading: false,
    })
  }

  it('sans contradiction côté profileur, AUCUNE carte — jamais une ligne muette', async () => {
    renderWithRouter(<OnboardingReviewPage />)
    await screen.findByText('Organisation')
    expect(screen.queryByText('Une hypothèse de Laura')).not.toBeInTheDocument()
  })

  it('profile_context.contradiction explicitement null : toujours aucune carte', async () => {
    withContradiction(null)
    renderWithRouter(<OnboardingReviewPage />)
    await screen.findByText('Organisation')
    expect(screen.queryByText('Une hypothèse de Laura')).not.toBeInTheDocument()
  })

  it('affiche la phrase de Laura, cadrée COMME une hypothèse', async () => {
    withContradiction()
    renderWithRouter(<OnboardingReviewPage />)
    expect(await screen.findByText('Une hypothèse de Laura')).toBeInTheDocument()
    expect(screen.getByText(CONTRADICTION.statement)).toBeInTheDocument()
  })

  it('le reasoning reste CONSULTABLE, pas affiché d’emblée', async () => {
    withContradiction()
    renderWithRouter(<OnboardingReviewPage />)
    await screen.findByText(CONTRADICTION.statement)
    expect(screen.queryByText(CONTRADICTION.reasoning)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Comprendre pourquoi' }))
    expect(screen.getByText(CONTRADICTION.reasoning)).toBeInTheDocument()
  })

  it('NON BLOQUANTE : le CTA de génération reste actif', async () => {
    withContradiction()
    renderWithRouter(<OnboardingReviewPage />)
    await screen.findByText(CONTRADICTION.statement)
    expect(screen.getByRole('button', { name: 'Générer mon audit' })).toBeEnabled()
  })

  it('« Garder mes réponses » confirme SANS bloquer, et retire les boutons', async () => {
    withContradiction()
    renderWithRouter(<OnboardingReviewPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Garder mes réponses' }))
    expect(screen.getByText('Tu as confirmé vouloir garder tes réponses.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Comprendre pourquoi' })).not.toBeInTheDocument()
  })

  it('« Revoir mes réponses » renvoie vers une sous-étape modifiable', async () => {
    withContradiction()
    renderWithRouter(<OnboardingReviewPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Revoir mes réponses' }))
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/onboarding/$id/$stage/$slug',
      params: { id: ONBOARDING_ID, stage: expect.any(String), slug: expect.any(String) },
    })
  })
})

// import-contexte Je.4 — l'APPELANT : la zone « Dépose tes documents » est montée sur l'étape finale, juste avant
// le CTA qui ouvre `/onboarding/$id/generating` — un composant que personne ne monte n'existe pas.
describe('Je.4 — le pack de contexte est monté sur l’étape avant la génération', () => {
  it('affiche la zone de dépôt AVANT le CTA de génération, sans rien importer seule', async () => {
    renderWithRouter(<OnboardingReviewPage />)
    const zone = await screen.findByTestId('context-pack-dropzone')
    expect(zone).toHaveTextContent('Dépose tes documents')
    const cta = screen.getByRole('button', { name: /audit/i })
    expect(zone.compareDocumentPosition(cta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('Théo O onboarding-relecture — « Ce que Laura a compris », orientations, validation', () => {
  it('nomme les huit cases ; sans réponse, « À préciser » — jamais une valeur inventée', async () => {
    renderWithRouter(<OnboardingReviewPage />)
    expect(await screen.findByText('Ce que Laura a compris')).toBeInTheDocument()
    const grid = screen.getByTestId('review-context-grid')
    for (const label of [
      'Ton périmètre',
      'Ton activité',
      'Ton rôle',
      'Ton offre',
      'Ta priorité',
      'Ton territoire',
      'Ton horizon',
      'Tes limites',
    ]) {
      expect(within(grid).getByText(label)).toBeInTheDocument()
    }
    expect(within(grid).getAllByText('À préciser').length).toBe(8)
  })

  it('une réponse donnée remplace « À préciser » sur sa case', async () => {
    useOnboardingStore.getState().setAnswer('esn_name', 'Altimance')
    renderWithRouter(<OnboardingReviewPage />)
    const grid = await screen.findByTestId('review-context-grid')
    expect(within(grid).getByText('Altimance')).toBeInTheDocument()
    expect(within(grid).getAllByText('À préciser').length).toBe(7)
  })

  it('n’invente aucune orientation sans réponse qui la motive', async () => {
    renderWithRouter(<OnboardingReviewPage />)
    await screen.findByText('Ce que Laura a compris')
    expect(screen.queryByText('Trois orientations à décider')).toBeNull()
  })

  it('propose les trois décisions sur une orientation et enregistre celle qu’on choisit', async () => {
    useOnboardingStore.getState().setAnswer('reference_accounts', ['Société Générale'])
    renderWithRouter(<OnboardingReviewPage />)
    expect(await screen.findByText('Préparer une approche fondée sur une preuve')).toBeInTheDocument()
    const decision = screen.getByRole('combobox', {
      name: /Ta décision pour « Préparer une approche fondée sur une preuve »/,
    })
    expect(decision).toHaveTextContent('À discuter')
    await userEvent.click(decision)
    expect(await screen.findByRole('option', { name: 'À travailler plus tard' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Ne pas retenir' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('option', { name: 'Je retiens cette stratégie' }))
    expect(mockSaveDecision).toHaveBeenCalledWith({ orientation: 'proof', decision: 'retain' })
  })

  it('montre la décision déjà prise, appuyée', async () => {
    useOnboardingStore.getState().setAnswer('reference_accounts', ['Société Générale'])
    mockFraming.mockReturnValue({ data: { decisions: { proof: 'later' }, validated_at: null, validated_digest: null } })
    renderWithRouter(<OnboardingReviewPage />)
    const decision = await screen.findByRole('combobox', { name: /Ta décision pour/ })
    expect(decision).toHaveTextContent('À travailler plus tard')
  })

  it('nomme « Les points à trancher » : l’audit reste valable avec des inconnues', async () => {
    renderWithRouter(<OnboardingReviewPage />)
    expect(await screen.findByText('Les points à trancher')).toBeInTheDocument()
    expect(screen.getByText('L’expertise reste ouverte')).toBeInTheDocument()
  })

  it('le bouton de validation reste inactif tant que la case n’est pas cochée, et dit ce que la validation ne touche pas', async () => {
    fillRequiredAnswers()
    renderWithRouter(<OnboardingReviewPage />)
    const cta = await screen.findByRole('button', { name: 'Valider et préparer mon premier travail' })
    expect(cta).toBeDisabled()
    expect(
      screen.getByText(
        'Les réponses restent modifiables. Aucune donnée d’un autre membre de l’équipe ni aucune permission n’est modifiée.',
      ),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(cta).toBeEnabled()
  })

  it('valide avec l’empreinte des réponses puis ouvre Laura sur un brouillon, sans rien envoyer', async () => {
    fillRequiredAnswers()
    useOnboardingStore.getState().setAnswer('esn_name', 'Altimance')
    mockValidate.mockResolvedValue({ decisions: {}, validated_at: '2026-10-22T10:00:00.000Z', validated_digest: 'x' })
    renderWithRouter(<OnboardingReviewPage />)
    fireEvent.click(await screen.findByRole('checkbox'))
    const cta = screen.getByRole('button', { name: 'Valider et préparer mon premier travail' })
    await vi.waitFor(() => expect(cta).toBeEnabled())
    fireEvent.click(cta)
    await vi.waitFor(() => expect(mockValidate).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f]{64}$/)))
    // Le lancement s'ouvre sous la validation : le brouillon est prêt, rien n'est parti.
    const draft = await screen.findByLabelText('Premier message à modifier')
    expect((draft as HTMLTextAreaElement).value).toContain('Altimance')
    expect(mockNavigate).not.toHaveBeenCalledWith(expect.objectContaining({ to: '/chat' }))
    fireEvent.click(screen.getByRole('button', { name: /^Ouvrir ce brouillon dans/ }))
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/chat',
      search: { fresh: '1', prompt: expect.stringContaining('Altimance') },
    })
  })

  it('le brouillon se modifie, « Recomposer » le rédige de nouveau, et le lancement ne montre aucun crédit', async () => {
    fillRequiredAnswers()
    useOnboardingStore.getState().setAnswer('esn_name', 'Altimance')
    mockValidate.mockResolvedValue({ decisions: {}, validated_at: '2026-10-22T10:00:00.000Z', validated_digest: 'x' })
    renderWithRouter(<OnboardingReviewPage />)
    fireEvent.click(await screen.findByRole('checkbox'))
    const cta = screen.getByRole('button', { name: 'Valider et préparer mon premier travail' })
    await vi.waitFor(() => expect(cta).toBeEnabled())
    fireEvent.click(cta)
    const draft = (await screen.findByLabelText('Premier message à modifier')) as HTMLTextAreaElement
    fireEvent.change(draft, { target: { value: 'Mon texte' } })
    expect(draft.value).toBe('Mon texte')
    fireEvent.click(screen.getByRole('button', { name: 'Recomposer depuis le cadrage validé' }))
    expect(draft.value).toContain('Altimance')
    const next = screen.getByTestId('launch-next')
    expect(next.textContent).not.toMatch(/crédit|enrichissement|analyses/i)
    expect(screen.getByRole('link', { name: 'Facturation' })).toHaveAttribute('href', '/billing')
    expect(screen.getByRole('link', { name: 'Équipe' })).toHaveAttribute('href', '/settings/team')
  })

  it('l’audit approfondi reste accessible : lancer la génération et voir l’audit', async () => {
    renderWithRouter(<OnboardingReviewPage />)
    expect(await screen.findByRole('button', { name: 'Générer mon audit' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ouvrir le diagnostic' })).toHaveAttribute(
      'href',
      '/settings/profile/audit',
    )
  })

  it('range toutes les réponses par thème, avec « Modifier » vers leur question', async () => {
    useOnboardingStore.getState().setAnswer('esn_name', 'Altimance')
    renderWithRouter(<OnboardingReviewPage />)
    expect(await screen.findByText('Relire toutes mes réponses renseignées ou reportées')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /^Modifier : / }).length).toBeGreaterThan(0)
  })
})

describe('Théo O onboarding-relecture.A6 — des outils déclarés renvoient vers les connecteurs', () => {
  it('propose « Brancher mes outils » seulement quand un outil est déclaré, en disant que déclarer ne connecte rien', async () => {
    renderWithRouter(<OnboardingReviewPage />)
    await screen.findByText('Ce que Laura a compris')
    expect(screen.queryByRole('link', { name: 'Brancher mes outils' })).toBeNull()
  })

  it('le renvoi apparaît avec un outil déclaré', async () => {
    useOnboardingStore.getState().setAnswer('tooling_bi', ['Metabase'])
    renderWithRouter(<OnboardingReviewPage />)
    expect(await screen.findByRole('link', { name: 'Brancher mes outils' })).toHaveAttribute('href', '/integrations')
    expect(screen.getByText(/ne sont pas connectés/)).toBeInTheDocument()
  })
})
