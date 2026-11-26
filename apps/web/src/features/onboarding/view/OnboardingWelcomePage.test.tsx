import { fireEvent, screen, waitFor, within, type RenderResult } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TEMPS1_REQUIRED_KEYS, type EsnAnswers, type OnboardingStateResponse } from '@bellum/contracts'
import type { UserCredits } from '@/features/credits/api'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { reconfigurationPlan } from '@/features/onboarding/lib/onboarding-gate'
import { firstPendingQuestion } from '@/features/onboarding/lib/pending-steps'
import { TEMPS1_QUESTION_KEYS, TEMPS1_SUBSTEPS } from '@/features/onboarding/lib/questions'
import { OnboardingWelcomePage } from './OnboardingWelcomePage'

// La barre haute du cadrage porte la bascule clair/sombre : le thème est simulé, pas monté.
vi.mock('@/features/theme/theme-provider', () => ({
  useTheme: () => ({ theme: 'dark', resolvedTheme: 'dark', setTheme: vi.fn(), toggleTheme: vi.fn() }),
}))

const { mockUseOnboardingState, mockUseCredits, navigateMock, skipMock, joinOverviewMock, joinMutateMock } = vi.hoisted(
  () => ({
    mockUseOnboardingState: vi.fn(),
    mockUseCredits: vi.fn(),
    navigateMock: vi.fn(),
    skipMock: vi.fn(),
    joinOverviewMock: vi.fn(),
    joinMutateMock: vi.fn(),
  }),
)

// #2016 — par défaut, aucun espace détecté : le parcours d'avant, à l'octet près.
vi.mock('@/features/onboarding/hooks/useWorkspaceJoin', () => ({
  useWorkspaceJoinOverview: () => joinOverviewMock(),
  useWorkspaceJoinGesture: () => ({ mutate: joinMutateMock, isPending: false, variables: undefined }),
}))

vi.mock('@/features/onboarding/hooks/useOnboarding', () => ({
  useOnboardingState: () => mockUseOnboardingState(),
  useSkipOnboarding: () => ({ mutateAsync: skipMock, isPending: false }),
}))

// #2014 — l'origine du compte (bêta provisionné, retour après paiement) se lit
// sur `credits.plan` : non mocké = crédits inconnus, donc `self_service`
// (jamais une origine devinée pendant le chargement).
vi.mock('@/features/credits/hooks/useCredits', () => ({ useCredits: () => mockUseCredits() }))

vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigateMock,
}))

const ONBOARDING_ID = '11111111-2222-3333-4444-555555555555'

const LIST_KEYS: readonly string[] = ['expertise_areas', 'target_sectors', 'target_company_types', 'geo_zones']

/** R15N-9 — les 19 clés que le PARCOURS pose réellement, pas seulement les
 *  dix de la porte de complétion serveur : voir `onboarding-gate.test.ts`. */
function answers(over: Partial<EsnAnswers> = {}): EsnAnswers {
  const blank = Object.fromEntries(TEMPS1_QUESTION_KEYS.map(key => [key, LIST_KEYS.includes(key) ? [] : null]))
  return { ...blank, ...over } as EsnAnswers
}

function state(over: Partial<OnboardingStateResponse> = {}): OnboardingStateResponse {
  return {
    id: ONBOARDING_ID,
    status: 'in_progress',
    current_stage_code: null,
    stages: [],
    answers: answers(),
    skipped_at: null,
    inherited_answer_keys: [],
    // #2014.3/.7 — par défaut, aucun espace rejoint (compte self-service).
    joined_workspace: null,
    ...over,
  } as OnboardingStateResponse
}

/** #2014 — crédits par défaut d'un compte de signup self-service. */
function credits(over: Partial<UserCredits> = {}): UserCredits {
  return {
    user_id: 'u-1',
    plan: 'decouverte',
    accounts_limit: 1,
    accounts_used: 0,
    enrichment_credits: 5,
    ...over,
  } as UserCredits
}

/** Monte l'écran à côté d'un témoin : `renderWithRouter` rend de façon ASYNCHRONE
 *  (le routeur résout sa route), donc interroger tout de suite lit un corps vide.
 *  Rend le `RenderResult` (dont `container`) — #2086.17 en a besoin pour MESURER
 *  la composition de la grille éditoriale, pas seulement le texte qu'elle porte. */
async function show(
  over: Partial<OnboardingStateResponse> = {},
  creditsOver?: Partial<UserCredits> | null,
): Promise<RenderResult> {
  mockUseOnboardingState.mockReturnValue({ data: state(over), isLoading: false })
  mockUseCredits.mockReturnValue({ data: creditsOver === null ? undefined : credits(creditsOver), isLoading: false })
  const result = renderWithRouter(
    <>
      <OnboardingWelcomePage />
      <div data-testid="sentinel" />
    </>,
  )
  await screen.findByTestId('sentinel')
  return result
}

beforeEach(() => {
  vi.clearAllMocks()
  skipMock.mockResolvedValue(state())
  joinOverviewMock.mockReturnValue({ data: undefined })
})

describe('#2016 — un espace existe déjà pour ce domaine', () => {
  const COMET = '11111111-1111-4111-8111-111111111111'
  const detected = (canCreateOwnWorkspace: boolean) => ({
    data: {
      candidates: [{ workspaceId: COMET, workspaceName: 'Comet Conseil', admins: [], request: null }],
      canCreateOwnWorkspace,
    },
  })

  it('l’encart remplace le CTA : le parcours propre attend que l’espace soit tranché', async () => {
    joinOverviewMock.mockReturnValue(detected(false))
    await show()

    expect(screen.getByRole('heading', { name: 'Un espace existe déjà pour Comet Conseil' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Commencer' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Créer mon propre espace' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Demander l’accès' }))
    expect(joinMutateMock).toHaveBeenCalledWith({ gesture: 'request', workspaceId: COMET }, expect.any(Object))
  })

  // #2086.34 — l'espace existant se dit avant qu'un doublon naisse : le NOM de
  // l'espace, QUI approuve (administrateurs nommés) et ce qui devient PARTAGÉ
  // vs PERSONNEL doivent être lisibles sur le MÊME écran, pas seulement l'un
  // des trois. `OnboardingPrivacyStep` (#2019) porte la ligne partagé/personnel
  // et co-rend TOUJOURS avec `ExistingWorkspaceNotice` (aucun retour anticipé
  // ne l'exclut, `OnboardingWelcomePage.tsx:363`).
  it('#2086.34 — dit le nom de l’espace, qui approuve, et ce qui devient partagé vs personnel', async () => {
    joinOverviewMock.mockReturnValue({
      data: {
        candidates: [
          {
            workspaceId: COMET,
            workspaceName: 'Comet Conseil',
            admins: [{ firstName: 'Louis', lastInitial: 'S' }],
            request: null,
          },
        ],
        canCreateOwnWorkspace: false,
      },
    })
    await show()

    // « Un espace X existe déjà ».
    expect(screen.getByRole('heading', { name: 'Un espace existe déjà pour Comet Conseil' })).toBeInTheDocument()
    // Qui approuve : les administrateurs, nommés.
    expect(screen.getByText('Administré par Louis S..')).toBeInTheDocument()
    // Ce qui est partagé / ce qui reste personnel — sur le MÊME écran.
    expect(
      screen.getByText(
        'Le profil de l’entreprise appartient à l’espace ; ton rôle, tes objectifs et ta messagerie restent personnels.',
      ),
    ).toBeInTheDocument()
  })

  it('une fois débloqué, « Créer mon propre espace » lance le parcours d’un compte neuf', async () => {
    joinOverviewMock.mockReturnValue(detected(true))
    await show()

    fireEvent.click(screen.getByRole('button', { name: 'Créer mon propre espace' }))
    expect(navigateMock).toHaveBeenCalledWith({ to: '/onboarding/plan' })
  })

  it('la reconfiguration d’un espace installé ne montre jamais l’encart', async () => {
    joinOverviewMock.mockReturnValue(detected(false))
    await show({ status: 'completed', answers: answers({ esn_name: 'Comet' }) })

    expect(screen.queryByRole('heading', { name: 'Un espace existe déjà pour Comet Conseil' })).toBeNull()
  })
})

describe('#2013 — la page 0 dit tout ce qu’il faut savoir AVANT la première question', () => {
  it('affiche la promesse, la durée, la progression et le résultat attendu', async () => {
    await show()

    // #2013.2 — la promesse, mot pour mot celle de l'issue.
    // Théo O onboarding-accueil.R1 — la promesse V23 remplace celle de #2013.2.
    expect(screen.getByText(/donne à Laura les repères qui font la différence/i)).toBeInTheDocument()
    // #2013.3 / #2013.10 — huit à douze minutes, et le nombre d'étapes.
    expect(screen.getByText(/Environ 8 à 12 minutes/)).toBeInTheDocument()
    // #2013.8 — ce qu'on obtient à l'arrivée.
    // Théo O onboarding-accueil.R1 — la frise « ce que tu retrouves à la fin » porte le livrable.
    expect(screen.getByText('Ce que tu retrouves à la fin')).toBeInTheDocument()
  })

  it('dit les quatre choses qui rassurent — modifiable, prérempli, rien d’envoyé, plus tard', async () => {
    await show()

    // Théo O onboarding-accueil.R1 — « Ce que deviennent tes réponses » porte la même promesse en un paragraphe.
    expect(screen.getByText(/corriger à tout moment depuis Réglages › Profil/i)).toBeInTheDocument()
    expect(screen.getByText(/aucune réponse n’autorise un envoi/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reprendre plus tard' })).toBeInTheDocument()
  })

  it('trois bénéfices, et AUCUN catalogue de fonctionnalités (#2013.9/.12)', async () => {
    await show()

    // Théo O onboarding-accueil.R1 — les trois bénéfices deviennent les trois pastilles.
    expect(screen.getByText('Un premier cadrage guidé')).toBeInTheDocument()
    expect(screen.getByText('Des précisions à ton rythme')).toBeInTheDocument()
    expect(screen.getByText('Une stratégie corrigeable')).toBeInTheDocument()
    // Le chemin démo existe, mais il est SECONDAIRE : c'est un lien, pas le
    // bouton primaire — et il n'y a qu'un seul bouton primaire.
    expect(screen.getByRole('link', { name: /Découvrir le produit en démo/i })).toBeInTheDocument()
  })

  // #2086.5/.6 — le hero et le sous-titre exacts de l'issue, Laura nommée
  // (D82 : « Laura » est un NOM, jamais une paraphrase de la catégorie).
  it('#2086.5/.6 — hero exact et sous-titre qui nomme Laura', async () => {
    await show()

    expect(
      screen.getByRole('heading', { level: 1, name: 'Un contexte clair. Des décisions plus utiles.' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/donne à Laura les repères qui font la différence/)).toBeInTheDocument()
  })

  // #2086.13 — un encart Laura qui dit ce qu'elle va faire, pas seulement son
  // visage décoratif dans l'en-tête.
  it('#2086.13 — un encart Laura annonce ce qui va se passer', async () => {
    await show()

    expect(screen.getByText('Laura, l’IA métier de Bellum')).toBeInTheDocument()
  })

  // #2086.12 — le lien RGPD, présent sur ce premier écran et pas seulement
  // dans les réglages.
  // #2019 — le lien vit désormais DANS l'étape de confidentialité, qui est
  // posée dans le parcours (page 0), sur les deux chemins.
  it('#2086.12 / #2019.1 — l’étape de confidentialité et son lien vers le détail', async () => {
    await show()

    expect(screen.getByRole('region', { name: 'Tes données, en clair' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voir le détail de la confidentialité' })).toHaveAttribute(
      'href',
      expect.stringMatching(/\/privacy$/),
    )
  })

  it('#2019.1 — l’étape reste posée en reconfiguration', async () => {
    await show({ status: 'completed', answers: answers({ esn_name: 'Comet' }) })

    expect(screen.getByRole('region', { name: 'Tes données, en clair' })).toBeInTheDocument()
  })

  it('#2013.11 — un CTA unique, et c’est LUI qui mène au questionnaire (par « Comprendre » et Laura, maquette V23)', async () => {
    await show()

    const cta = screen.getByRole('button', { name: 'Commencer' })
    expect(cta).toBeInTheDocument()
    expect(navigateMock).not.toHaveBeenCalled()

    fireEvent.click(cta)
    fireEvent.click(screen.getByRole('button', { name: 'Rencontrer Laura' }))
    expect(navigateMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Renseigner mon contexte' }))
    expect(navigateMock).toHaveBeenCalledWith({ to: '/onboarding/plan' })
  })

  it('#2013.7 — « Plus tard » ÉCRIT le report avant de quitter', async () => {
    await show()

    fireEvent.click(screen.getByRole('button', { name: 'Reprendre plus tard' }))

    // Sans cette écriture, le garde de route ramène ici à la navigation
    // suivante : « plus tard » ne tiendrait qu'un écran.
    await waitFor(() => expect(skipMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(navigateMock).toHaveBeenCalled())
  })
})

describe('#2022 — la reconfiguration guidée d’un espace existant', () => {
  /** Un espace qui a déjà répondu à la PREMIÈRE sous-étape (les deux questions)
   *  et à une question plus loin : sept des dix clés du Temps 1 restent. */
  const EXISTANT = {
    status: 'refresh_required' as const,
    answers: answers({ esn_name: 'Abricot Labs', consultant_size: '30-100', positioning: 'Nearshore' }),
  }

  it('annonce la reconfiguration, le temps estimé, l’impact et ce qui est conservé', async () => {
    await show(EXISTANT)

    expect(screen.getByText(/entièrement repensé la personnalisation/i)).toBeInTheDocument()
    expect(screen.getByText(/manque quelques éléments pour rendre tes résultats plus précis/i)).toBeInTheDocument()
    // #2022.5 — une fourchette MESURÉE sur ce qui reste, pas la durée complète.
    // DÉRIVÉE du plan (GA-26) et non écrite en toutes lettres : le parcours
    // grandit à chaque lot (19 questions le 15/09 au matin, 80 le soir), et un
    // nombre recopié ici redeviendrait faux au lot suivant. Ce que le test
    // tient, c'est la RÈGLE : la fourchette annoncée n'est pas la durée du
    // questionnaire entier.
    const plan = reconfigurationPlan(EXISTANT.answers)
    expect(plan.estimatedMinutes).not.toBeNull()
    // Ce qui se garde ici : la fourchette affichée est celle du PLAN, et le
    // plan porte MOINS que le questionnaire entier. Le prorata lui-même est
    // gardé dans `onboarding-gate.test.ts` — pas deux fois (GA-26).
    expect(plan.keys.length).toBeLessThan(TEMPS1_QUESTION_KEYS.length)
    const { min, max } = plan.estimatedMinutes!
    expect(screen.getByText(new RegExp(`Environ ${min} à ${max} minutes`))).toBeInTheDocument()
    expect(screen.getByText(/affine les comptes proposés/i)).toBeInTheDocument()
    // #2022.2 — la première inquiétude : « vais-je devoir tout retaper ? »
    expect(screen.getByText(/rien n’est effacé|rien n'est effacé/i)).toBeInTheDocument()
  })

  it('#2022.4 — reprend à la première question SANS RÉPONSE, jamais au début', async () => {
    await show(EXISTANT)

    fireEvent.click(screen.getByRole('button', { name: 'Compléter mon profil' }))

    expect(navigateMock).toHaveBeenCalledTimes(1)
    const [[call]] = navigateMock.mock.calls as [[{ params: { slug: string; stage: string } }]]
    // Les deux questions de « entreprise » sont répondues : cette sous-étape ne
    // se repose pas. On atterrit sur la première qui attend encore quelque chose.
    expect(call.params).toMatchObject({ stage: 'company_info', slug: 'equipe-commerciale' })
  })

  /**
   * R15N-9 (conséquence) — la phrase « il nous manque quelques éléments »
   * annonçait un manque même quand `reconfigurationPlan` ne trouvait plus
   * rien à redemander (elle ne dépendait pas de la même mesure que la durée,
   * masquée à raison dans ce cas). Un plan vide ne peut pas annoncer un
   * manque, ni « 0 minute ».
   */
  it("R15N-9 — un plan VIDE n'annonce ni manque ni durée", async () => {
    const toutRempli = Object.fromEntries(
      TEMPS1_QUESTION_KEYS.map(key => [key, LIST_KEYS.includes(key) ? ['rempli'] : 'rempli']),
    ) as Partial<EsnAnswers>
    const complet = { status: 'refresh_required' as const, answers: answers(toutRempli) }
    await show(complet)

    expect(screen.queryByText(/manque quelques éléments pour rendre tes résultats plus précis/i)).toBeNull()
    expect(screen.getByText(/Ton profil est déjà à jour/i)).toBeInTheDocument()
    expect(screen.queryByText(/Environ \d+ à \d+ minutes/)).toBeNull()
  })
})

/**
 * #2013.3 / #2013.11 — CE QUE LE CHEMIN DE RECONFIGURATION DIT D'AUTRE, ET
 * POURQUOI C'EST LÉGITIME.
 *
 * Les deux points ont été relevés en production sur un espace EXISTANT, et le
 * relevé disait « fourchette absente » et « le bouton ne s'appelle pas
 * Commencer mon audit ». Les deux constats sont VRAIS et les deux
 * comportements sont JUSTES — ce sont deux chemins différents, pas un défaut :
 *
 *  - la fourchette « 8 à 12 minutes » est celle du questionnaire COMPLET ; en
 *    reconfiguration c'est le prorata de ce qui reste, et il est MASQUÉ quand
 *    il ne reste rien (`estimatedMinutes: null`) — « 0 minute » n'est pas une
 *    durée ;
 *  - « Commencer » promet un début ; à quelqu'un qui a déjà répondu
 *    on dit « Compléter mon profil », parce que c'est ce que le clic fait.
 *
 * Ce test-ci est la seule chose qui EMPÊCHE la prochaine relecture de
 * re-signaler ces deux écarts comme des bugs : il met les deux chemins côte à
 * côte dans le même `it`, et il échoue si l'un se met à ressembler à l'autre.
 *
 * ⚠️ Reste à MESURER sur un espace NEUF en production (le relevé du 15/09 n'a
 * pu se faire que sur un espace existant) : c'est la raison pour laquelle les
 * deux points restent `livré` et non `recetté` au registre.
 */
describe('#2013.3 / #2013.11 — deux chemins, deux annonces, et le code le DIT', () => {
  const TOUT_REMPLI = Object.fromEntries(
    TEMPS1_QUESTION_KEYS.map(key => [key, LIST_KEYS.includes(key) ? ['rempli'] : 'rempli']),
  ) as Partial<EsnAnswers>

  it('espace NEUF : la fourchette complète ET « Commencer »', async () => {
    await show()

    expect(screen.getByText(/Environ 8 à 12 minutes/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Commencer' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Compléter mon profil' })).toBeNull()
  })

  it('RECONFIGURATION complète : AUCUNE durée (jamais « 0 minute ») et « Compléter mon profil »', async () => {
    await show({ status: 'refresh_required', answers: answers(TOUT_REMPLI) })

    // La fourchette du questionnaire complet ne s'affiche pas sur ce chemin…
    expect(screen.queryByText(/Environ 8 à 12 minutes/)).toBeNull()
    // …et aucune autre durée n'y prend sa place : rien à redemander, donc rien
    // à annoncer. « 0 minute » serait faux, une durée inventée pire encore.
    expect(screen.queryByText(/Environ \d+ à \d+ minutes/)).toBeNull()
    expect(reconfigurationPlan(answers(TOUT_REMPLI)).estimatedMinutes).toBeNull()

    expect(screen.getByRole('button', { name: 'Compléter mon profil' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Commencer' })).toBeNull()
  })

  it('RECONFIGURATION partielle — LE TÉMOIN : dès qu’il reste des questions, une durée REVIENT', async () => {
    const presqueTout = { ...TOUT_REMPLI }
    delete presqueTout.positioning
    delete presqueTout.geo_zones
    await show({ status: 'refresh_required', answers: answers(presqueTout) })

    // Pas la fourchette du questionnaire complet : le prorata de ce qui reste.
    expect(screen.queryByText(/Environ 8 à 12 minutes/)).toBeNull()
    expect(screen.getByText(/Environ \d+ à \d+ minutes? pour ce qui manque/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Compléter mon profil' })).toBeInTheDocument()
  })
})

/**
 * 16/09/2026 — un parcours marqué TERMINÉ dont des sous-étapes n'ont jamais été
 * posées. Mesuré en production : `status: completed` avec
 * `current_stage_code: transition_summary`, plus de soixante réponses à `null`.
 * Cet écran est la PROPOSITION — il n'est atteint que par `/onboarding`, et le
 * questionnaire ne repart qu'au clic.
 */
describe('reprise d’un onboarding marqué terminé trop tôt (16/09/2026)', () => {
  /**
   * La forme de l'espace mesuré. #2626.1 revient sur cette fixture,
   * délibérément — depuis l'arbitrage Temps 2 du 20/09/2026,
   * `TEMPS1_QUESTION_KEYS` s'est réduit à `TEMPS1_REQUIRED_KEYS` : les
   * remplir TOUTES ne distingue plus « récap seul » de « a tout parcouru ».
   * Le mécanisme qui SURVIT à #2626.1 (GA-26) est une clé requise absente
   * sur un compte déjà `completed` — simulé ici en en laissant une (la
   * dernière) sans réponse.
   */
  const ARRETE_AU_RECAP = {
    status: 'completed' as const,
    current_stage_code: 'transition_summary',
    answers: answers(
      Object.fromEntries(
        TEMPS1_REQUIRED_KEYS.slice(0, -1).map(key => [key, LIST_KEYS.includes(key) ? ['rempli'] : 'rempli']),
      ) as Partial<EsnAnswers>,
    ),
  }

  it('dit la VRAIE raison — rien n’a été « repensé », des questions n’ont jamais été posées', async () => {
    await show(ARRETE_AU_RECAP)

    expect(
      screen.getByText(/questions qui ne t’ont jamais été posées|questions qui ne t'ont jamais été posées/i),
    ).toBeInTheDocument()
    // Le texte de la reconfiguration annoncerait un changement de produit qui
    // n'a pas eu lieu pour cet espace : ce serait une donnée fictive.
    expect(screen.queryByText(/entièrement repensé la personnalisation/i)).toBeNull()
    // #2022.2 — la promesse qui vaut aussi ici : rien n'est effacé.
    expect(screen.getByText(/rien n’est effacé|rien n'est effacé/i)).toBeInTheDocument()
  })

  it('ne relance RIEN tout seul : la reprise attend le clic, et vise une sous-étape sans réponse', async () => {
    await show(ARRETE_AU_RECAP)

    expect(navigateMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Compléter mon profil' }))

    expect(navigateMock).toHaveBeenCalledTimes(1)
    const [[call]] = navigateMock.mock.calls as [[{ params: { slug: string; stage: string } }]]
    const cible = TEMPS1_SUBSTEPS.find(s => s.stageCode === call.params.stage && s.slug === call.params.slug)
    // Aucune des questions de l'écran d'arrivée n'a de réponse : la reprise ne
    // repose pas ce qui est déjà rempli, donc elle ne peut rien écraser.
    expect(cible?.questions.every(q => !ARRETE_AU_RECAP.answers[q.key])).toBe(true)
  })

  it('LE TÉMOIN — un espace qui a tout parcouru ne voit AUCUNE proposition de reprise', async () => {
    const toutRempli = Object.fromEntries(
      TEMPS1_QUESTION_KEYS.map(key => [key, LIST_KEYS.includes(key) ? ['rempli'] : 'rempli']),
    ) as Partial<EsnAnswers>
    await show({ status: 'completed', current_stage_code: 'transition_summary', answers: answers(toutRempli) })

    expect(
      screen.queryByText(/questions qui ne t’ont jamais été posées|questions qui ne t'ont jamais été posées/i),
    ).toBeNull()
  })
})

/**
 * #2004.24 — « prochaine étape » + raison d'un BLOCAGE.
 *
 * L'écran disait le nombre de questions restantes et la durée ; il ne disait
 * pas PAR QUOI on reprend. Et quand il n'y a rien à reprendre, il ne disait
 * rien du tout : le bouton menait alors au début du questionnaire sans que
 * personne ne sache pourquoi. Un blocage sans raison nommée se lit comme une
 * panne.
 */
describe('#2004.24 — la prochaine étape, et la raison quand il n’y en a pas', () => {
  // #2626.1 revient sur cette fixture, délibérément — voir le commentaire du
  // describe « reprise » ci-dessus : une clé requise (la dernière) reste sans
  // réponse pour que la porte de reprise ait encore quelque chose à proposer.
  const ARRETE_AU_RECAP = {
    status: 'completed' as const,
    current_stage_code: 'transition_summary',
    answers: answers(
      Object.fromEntries(
        TEMPS1_REQUIRED_KEYS.slice(0, -1).map(key => [key, LIST_KEYS.includes(key) ? ['rempli'] : 'rempli']),
      ) as Partial<EsnAnswers>,
    ),
  }

  it('NOMME la prochaine étape par la question exacte qui reprend', async () => {
    const attendue = firstPendingQuestion(ARRETE_AU_RECAP.answers, [])
    // Le corpus n'est pas vide : sans question en attente, ce test ne
    // prouverait rien.
    expect(attendue).not.toBeNull()

    await show(ARRETE_AU_RECAP)
    expect(screen.getByText(/Prochaine étape/)).toBeInTheDocument()
  })

  it('quand rien n’est à reprendre, DIT la raison au lieu de se taire', async () => {
    const toutRempli = Object.fromEntries(
      TEMPS1_QUESTION_KEYS.map(key => [key, LIST_KEYS.includes(key) ? ['rempli'] : 'rempli']),
    ) as Partial<EsnAnswers>
    expect(firstPendingQuestion(answers(toutRempli), [])).toBeNull()

    await show({ status: 'refresh_required', answers: answers(toutRempli) })

    expect(screen.getByText(/Rien à reprendre/)).toBeInTheDocument()
    // La garde qui sait dire NON : les deux phrases ne s'affichent JAMAIS
    // ensemble — elles se contrediraient.
    expect(screen.queryByText(/Prochaine étape/)).toBeNull()
  })

  it('LE TÉMOIN — un compte neuf (page 0 de bienvenue) ne porte aucune des deux', async () => {
    await show()
    expect(screen.queryByText(/Prochaine étape/)).toBeNull()
    expect(screen.queryByText(/Rien à reprendre/)).toBeNull()
  })
})

/**
 * #2014 — ONBOARDING SELON L'ORIGINE DU COMPTE (page d'accueil uniquement,
 * jamais la reconfiguration ni la reprise, qui ont déjà leur propre message).
 */
describe("#2014 — le message d'accueil dit ce que le compte a déjà, sans le redemander", () => {
  it('#2014.1 — TÉMOIN : un compte self-service voit le message générique, pas une origine inventée', async () => {
    await show({}, { plan: 'decouverte' })

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Un contexte clair.')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('#2014.2 — un compte bêta provisionné voit son accès déjà activé, jamais « configurons »', async () => {
    await show({}, { plan: 'beta' })

    expect(screen.getByText(/Ton accès est déjà activé/)).toBeInTheDocument()
    expect(screen.getByText(/reste à configurer Bellum pour ton activité/)).toBeInTheDocument()
  })

  it('#2014.5 — un compte déjà payant (retour après paiement) est remercié, pas re-vendu', async () => {
    await show({}, { plan: 'growth' })

    expect(screen.getByText(/Merci pour ta confiance/)).toBeInTheDocument()
  })

  it('crédits inconnus (échec réseau) pendant le chargement : jamais une origine devinée', async () => {
    await show({}, null)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Un contexte clair.')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('#2014 — l’origine ne s’affiche que sur la page d’accueil, jamais pendant la reconfiguration', async () => {
    const toutRempli = Object.fromEntries(
      TEMPS1_QUESTION_KEYS.map(key => [key, LIST_KEYS.includes(key) ? ['rempli'] : 'rempli']),
    ) as Partial<EsnAnswers>
    await show({ status: 'refresh_required', answers: answers(toutRempli) }, { plan: 'beta' })

    expect(screen.queryByText(/Ton accès est déjà activé/)).toBeNull()
  })

  it('#2014.3/.7 — un invité (ou transféré) voit l’espace REJOINT et qui l’a invité, quand c’est connu', async () => {
    await show({ joined_workspace: { workspace_name: 'Acme Consulting', invited_by_name: 'Léa Dupont' } })

    expect(screen.getByText(/Léa Dupont t’a invité[^ ]* chez Acme Consulting/)).toBeInTheDocument()
  })

  it('#2014.3/.7 — « si connu » n’invente rien : l’espace se nomme SEUL quand l’inviteur est inconnu', async () => {
    await show({ joined_workspace: { workspace_name: 'Acme Consulting', invited_by_name: null } })

    expect(screen.getByText(/Bienvenue chez Acme Consulting/)).toBeInTheDocument()
    expect(screen.queryByText(/t’a invité/)).toBeNull()
  })

  it('#2014.3/.7 — l’espace rejoint l’emporte même sur un compte bêta ou déjà payant', async () => {
    await show({ joined_workspace: { workspace_name: 'Acme Consulting', invited_by_name: null } }, { plan: 'beta' })

    expect(screen.getByText(/Bienvenue chez Acme Consulting/)).toBeInTheDocument()
    expect(screen.queryByText(/Ton accès est déjà activé/)).toBeNull()
  })

  it('#2014.3/.7 — jamais pendant la reconfiguration ni la reprise, qui gardent leur propre message', async () => {
    const toutRempli = Object.fromEntries(
      TEMPS1_QUESTION_KEYS.map(key => [key, LIST_KEYS.includes(key) ? ['rempli'] : 'rempli']),
    ) as Partial<EsnAnswers>
    await show({
      status: 'refresh_required',
      answers: answers(toutRempli),
      joined_workspace: { workspace_name: 'Acme Consulting', invited_by_name: 'Léa Dupont' },
    })

    expect(screen.queryByText(/Bienvenue chez Acme Consulting/)).toBeNull()
  })
})

/**
 * #2602.1 (lot H5, 18/09/2026) — recette prod : « Découvrir le produit en
 * démo » pointait vers `${WEBSITE_URL}/demo`, la page MARKETING de capture de
 * prospect (`apps/website`), pas la vraie entrée en démonstration de
 * l'application (`/demo`, `routes/demo.tsx` → `DemoEntryPage`). Ce test
 * ROUGIT si le lien repointe un jour vers le site marketing — il vérifie le
 * `href` réel, pas seulement le libellé du bouton.
 */
describe('#2602.1 — « Découvrir le produit en démo » mène à la VRAIE démo', () => {
  it('le lien pointe vers /demo (l’app), jamais vers le site marketing', async () => {
    await show()

    const link = screen.getByRole('link', { name: 'Découvrir le produit en démo' })
    expect(link).toHaveAttribute('href', '/demo')
    expect(link.getAttribute('href')).not.toMatch(/bellum-ai\.com/)
  })

  // Entrer en démo REMPLACE la session en cours (cookies posés côté serveur,
  // `DemoEntryPage`) — ce n'est pas limité à l'onglet (décision Louis,
  // 18/09/2026, #2602.2). Le libellé doit donc le dire AVANT le clic : un
  // bouton qui sonne comme une visite et qui remplace la session n'en est pas
  // une (règle du chantier).
  it('le texte dit la session AVANT le clic : elle est remplacée, il faudra se reconnecter', async () => {
    await show()

    expect(screen.getByText(/remplace ta session|te reconnecter/)).toBeInTheDocument()
  })
})

// #2639.1 — « rendre le bouton de reprise toujours atteignable ». `#app-shell`
// (index.css) est une coque de hauteur FIXE (`100dvh; overflow: hidden`) : tout
// descendant qui dépasse cette hauteur est ROGNÉ, sans barre de défilement,
// sauf si CE descendant porte lui-même un `overflow-y-auto`. La page n'en
// avait aucun — sur Windows à 125/150 % (barre des tâches qui réduit le
// viewport RÉEL) ou un portable 13″, le contenu dépasse `100dvh` et les
// boutons du bas (reprise, « plus tard ») deviennent inatteignables : rien ne
// défile, ils sont juste rognés sous la coque.
describe('#2639.1 — le bouton de reprise reste atteignable même si la page dépasse 100dvh', () => {
  it('le bouton "Commencer" vit dans un ancêtre qui défile, pas dans le corps de la page', async () => {
    await show()

    const bouton = screen.getByRole('button', { name: 'Commencer' })
    const scrollable = bouton.closest('[class*="overflow-y-auto"]')
    // Sans ce wrapper, `#app-shell` (overflow: hidden) rogne tout excédent —
    // le bouton n'a alors AUCUN moyen d'être atteint, même en défilant.
    expect(scrollable).not.toBeNull()
  })
})

/**
 * #2086.17 (retouche 21/09) — « respiration, composition éditoriale, diagramme
 * léger ». La mise en page elle-même est un jugement visuel, laissé à la
 * recette ÉCRAN (registre `registre-2026-09-15-onboarding-audit-welcome.md`,
 * point 2086.17) — mais ce que ce lot change au DOM se mesure : une vraie
 * grille à deux colonnes (pas une classe relue), la borne de lecture de
 * `Text` (D81/GA-34) toujours seule source, et la colonne de texte libre
 * (titre « invité ») qui garde le droit de rétrécir (GA-333).
 */
describe('#2086.17 — la grille éditoriale du hero (mesures)', () => {
  // Théo O onboarding-accueil.R1 — la grille 3fr/2fr du hero disparaît avec le schéma (O1.R4) : un seul couloir.
  it('la largeur de lecture du sous-titre reste celle de `Text` (D81/GA-34) — cette retouche ne la redéclare ni ne la masque', async () => {
    await show()

    const subtitle = screen.getByText(/donne à Laura les repères/)
    expect(subtitle).toHaveClass('max-w-[70ch]')
  })
})

// Théo O onboarding-accueil — la V23 : trois temps (Bienvenue · Comprendre · Laura) sur une même route.
describe('Théo O onboarding-accueil — bienvenue V23', () => {
  it('R1 — le héros, la promesse et le lien vers le thème « tes réponses »', async () => {
    await show()

    expect(
      screen.getByRole('heading', { level: 1, name: 'Un contexte clair. Des décisions plus utiles.' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/donne à Laura les repères qui font la différence/)).toBeInTheDocument()
    expect(screen.getByText('On part de ton travail.')).toBeInTheDocument()
  })

  it('R1 — trois pastilles, la frise 01-03 et « ce que deviennent tes réponses »', async () => {
    await show()

    for (const label of ['Un premier cadrage guidé', 'Des précisions à ton rythme', 'Une stratégie corrigeable'])
      expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.getByText('Ce que deviennent tes réponses')).toBeInTheDocument()
    expect(screen.getByText(/Déclarer un outil ne le connecte pas/)).toBeInTheDocument()
    for (const label of ['Ta situation, reformulée', 'Des orientations à choisir', 'Un travail prêt à démarrer'])
      expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('R1 — « Commencer » ouvre « Comprendre Bellum », et le premier geste ne montre ni « fictif » ni exemple écrit dans le profil', async () => {
    await show()

    expect(screen.queryByText(/exemple/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Commencer' }))
    expect(screen.getByRole('heading', { level: 1, name: 'De l’information au prochain geste.' })).toBeInTheDocument()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('R1 — la maquette dans l’ordre : en-tête, carte « On part de ton travail » | « Ce que tu retrouves à la fin », Laura', async () => {
    await show()
    const card = screen.getByTestId('welcome-card')
    expect(within(card).getByRole('heading', { level: 2, name: /On part de ton travail/ })).toBeInTheDocument()
    const finale = within(card).getByRole('heading', { level: 2, name: 'Ce que tu retrouves à la fin' })
    expect(within(finale.closest('aside')!).getAllByRole('heading', { level: 3 })).toHaveLength(3)
    // « Explorer les thèmes » mène au catalogue, sans route neuve.
    expect(within(card).getByRole('link', { name: 'Explorer les thèmes' })).toHaveAttribute(
      'href',
      '/onboarding/themes',
    )
    // L'en-tête précède la carte, Laura la suit.
    const heading = screen.getByTestId('framing-heading')
    expect(heading.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(
      card.compareDocumentPosition(screen.getByText('Laura, l’IA métier de Bellum')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('A2 — « Ce que deviennent tes réponses » se replie, et garde les six lignes « Tes données, en clair »', async () => {
    await show()
    const answers = screen.getByTestId('welcome-answers')
    expect(answers.tagName).toBe('DETAILS')
    expect(within(answers).getByText('Tes données, en clair')).toBeInTheDocument()
  })

  it('R2 — « Commencer » ouvre le deuxième temps, « Retour » revient, « Rencontrer Laura » ouvre le troisième', async () => {
    await show()

    fireEvent.click(screen.getByRole('button', { name: 'Commencer' }))
    expect(screen.getByText('De l’information au prochain geste.')).toBeInTheDocument()
    expect(screen.getByText('Pourquoi ces questions ?')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { level: 1, name: 'Un contexte clair. Des décisions plus utiles.' }),
    ).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Retour' }))
    expect(
      screen.getByRole('heading', { level: 1, name: 'Un contexte clair. Des décisions plus utiles.' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Commencer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Rencontrer Laura' }))
    expect(screen.getByText('Tu gardes la main.')).toBeInTheDocument()
    expect(screen.getByText(/Aucun choix dans ce questionnaire ne connecte un outil/)).toBeInTheDocument()
    expect(screen.getByText('Tu peux lui parler avec tes mots.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Renseigner mon contexte' }))
    expect(navigateMock).toHaveBeenCalledWith({ to: '/onboarding/plan' })
  })

  it('A1 — un invité garde son bandeau d’accès, sous le titre, sans changer de titre', async () => {
    await show({ joined_workspace: { workspace_name: 'Altimance', invited_by_name: 'Marc Delorme' } })

    expect(
      screen.getByRole('heading', { level: 1, name: 'Un contexte clair. Des décisions plus utiles.' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Marc Delorme t’a invité chez Altimance.')
  })

  it('A1 — un accès bêta déjà activé garde son bandeau, et un compte neuf n’en montre aucun', async () => {
    await show({}, { plan: 'beta' })
    expect(screen.getByRole('status')).toHaveTextContent('Ton accès est déjà activé.')
  })

  it('A1 — un membre qui attend l’administrateur le lit dès l’accueil, avec le nom de l’administrateur', async () => {
    await show({ awaiting_company_admin: { admin_name: 'Marc Delorme' } })

    expect(screen.getByTestId('awaiting-admin-banner')).toHaveTextContent('Marc Delorme')
    expect(screen.getByRole('button', { name: 'Commencer' })).toBeInTheDocument()
  })

  it('N2 — « Reprendre plus tard » est dans la barre haute et écrit le report', async () => {
    await show()
    expect(screen.queryByRole('status')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Reprendre plus tard' }))
    await waitFor(() => expect(skipMock).toHaveBeenCalledTimes(1))
  })

  it('la reconfiguration d’un espace installé garde son écran : aucun des trois temps', async () => {
    await show({ status: 'completed', answers: answers({ esn_name: 'Comet' }) })

    expect(screen.queryByRole('button', { name: 'Comprendre Bellum' })).toBeNull()
    expect(screen.queryByText('Ce que deviennent tes réponses')).toBeNull()
  })
})
