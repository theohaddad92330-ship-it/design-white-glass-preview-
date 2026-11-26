import { fireEvent, renderHook, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type {
  AuditMoveDecisions,
  CommercialAuditContext,
  EntryStrategy,
  FirstAnalysisSuggestion,
  ProfileContext,
  ProfileContextRevisionSummary,
} from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { resetLauraIntro, useLauraOpenRequest } from '@/features/laura/bubble/laura-intro-store'
import type { useValidateProfileContext } from '@/features/profile-context/hooks/useValidateProfileContext'
import { buildAuditChain } from '../lib/audit-chain'
import { buildCommercialAudit, buildCommercialAuditContext } from '../lib/build-audit'
import { useReconfigureOnboarding } from '@/features/profile/hooks/useReconfigureOnboarding'
import { CommercialAuditScreen } from './CommercialAuditScreen'

const auditMock = vi.fn()
// #2021 — recette écran 27/09 : le lien du mode guidé manquait sur CET écran
// (`/settings/profile/audit`). Même déclencheur que `ProfileStagePage` (GA-26).
vi.mock('@/features/profile/hooks/useReconfigureOnboarding', () => ({
  useReconfigureOnboarding: vi.fn(() => ({
    available: false,
    alreadyRequested: false,
    pending: false,
    trigger: vi.fn(),
  })),
}))
// Épopée #2880 — la carte « Crédibilité par expertise » a son propre test
// (`AuditExpertiseCredibility.test.tsx`) ; ici elle lit une réponse vide.
vi.mock('../hooks/useExpertiseGroundings', () => ({
  useExpertiseGroundings: () => ({
    isLoading: false,
    isError: false,
    data: { groundings: [], audit: [], sourceOptions: [] },
  }),
  useExpertiseGroundingGesture: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('../hooks/useCommercialAudit', () => ({
  useCommercialAudit: () => auditMock(),
}))

// #2075.24/.27/.28 — même niveau d'intégration que `useCommercialAudit`
// ci-dessus : le relais après validation (`ValidateContextStatus`) a déjà
// ses propres preuves (`ValidateContextStatus.test.tsx`) ; ce mock sert
// uniquement à forcer `justValidated` sans dépendre d'un vrai aller-retour
// réseau, pour prouver que CET écran RELAIE les vraies données jusqu'à lui.
type ValidateReturn = ReturnType<typeof useValidateProfileContext>
const validateMock = vi.fn<() => ValidateReturn>()
vi.mock('@/features/profile-context/hooks/useValidateProfileContext', () => ({
  useValidateProfileContext: () => validateMock(),
}))
// #2075.24 — même mock que `ValidateContextStatus.test.tsx` : sans lui,
// `AskLaura` peut céder la place à la bulle flottante (`isActive`) et ne
// rendre AUCUN lien, ce qui n'a rien à voir avec le relais testé ici.
vi.mock('@/features/laura/bubble/laura-intro-store', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/laura/bubble/laura-intro-store')>()),
  useAskLauraIntro: () => false,
}))

// #2075.24 — seuls les champs lus par `ValidateContextStatus` (data, isPending,
// isError, error, mutate) : le reste de `UseMutationResult` (variables, isIdle,
// isSuccess, status…) n'a aucun lecteur ici, d'où le passage par `unknown`
// (TS2352 : les deux formes ne se recouvrent pas assez pour une conversion directe).
const NOT_JUST_VALIDATED: ValidateReturn = {
  data: undefined,
  error: null,
  isPending: false,
  isError: false,
  mutate: vi.fn(),
} as unknown as ValidateReturn
// La réponse de LA mutation dans cette session (`justValidated`), pas un
// `validatedAt` déjà connu au montage (voir `ValidateContextStatus`).
const JUST_VALIDATED: ValidateReturn = {
  data: { profile_context: null, status: 'validated', validatedAt: '2026-09-25T08:00:00.000Z', withheld: null },
  error: null,
  isPending: false,
  isError: false,
  mutate: vi.fn(),
} as unknown as ValidateReturn

const REVISIONS: ProfileContextRevisionSummary[] = [
  { version: 7, schema_version: 1, created_at: '2026-09-14T08:00:00.000Z', was_last_validated: false },
]

const CONTEXT: ProfileContext = {
  esnArchetype: 'boutiqueExpert',
  sellingPosture: 'expertiseRare',
  idealAccountProfile: {
    size: 'eti',
    sectorsPriority: ['Banque'],
    decisionLevel: 'manager',
    entryStrategy: 'bottomUp',
  },
  messagingStyle: {
    tone: 'consultative',
    messageLength: 'concise',
    valuePropositionAngle: 'Reprise de dette technique',
    differentiationPoints: ['Crédibilité technique'],
    avoid: ['Ouvrir dix fronts sans responsable'],
  },
  coachingInsights: {
    mainWeakness: 'Les dossiers avancent sans responsable nommé',
    keyAdvice: 'Rappeler les reprises datées',
    cadenceRecommendation: { analysesPerWeek: 3, messagesPerDay: 5, followUpsPerWeek: 4 },
  },
}

function mountWith(
  context: ProfileContext | null,
  revisions = REVISIONS,
  validatedAt: string | null = null,
  auditContextOverride?: CommercialAuditContext,
  chosenEntryStrategy: EntryStrategy | null = null,
  auditMoveDecisions: AuditMoveDecisions = {},
  // #2075.27/.28 — même lecture que `WelcomeScreen` (GA-26) : `[]` par défaut,
  // jamais une suggestion inventée pour ce montage.
  firstAnalysisSuggestions: readonly FirstAnalysisSuggestion[] = [],
  // #2075.24 — `undefined` = mutation jamais lancée dans cette session
  // (comportement par défaut du vrai hook au montage).
  validateReturn: ValidateReturn = NOT_JUST_VALIDATED,
) {
  auditMock.mockReturnValue({
    audit: buildCommercialAudit(context, revisions, null, chosenEntryStrategy),
    auditContext: auditContextOverride ?? buildCommercialAuditContext(context, revisions),
    chain: buildAuditChain(context),
    isLoading: false,
    hasProfileContext: context !== null,
    isGenerating: false,
    validatedAt,
    chosenEntryStrategy,
    auditMoveDecisions,
    firstAnalysisSuggestions,
  })
  validateMock.mockReturnValue(validateReturn)
  return renderWithRouter(<CommercialAuditScreen />)
}

describe('CommercialAuditScreen', () => {
  it('rend les trois décisions et les six conséquences, avec la version lue', async () => {
    mountWith(CONTEXT)
    expect(await screen.findByText('Arrêter')).toBeInTheDocument()
    expect(screen.getByText('Garder')).toBeInTheDocument()
    expect(screen.getByText('Renforcer')).toBeInTheDocument()
    expect(screen.getByText('Ouvrir dix fronts sans responsable')).toBeInTheDocument()
    expect(screen.getByText(/Version 7/)).toBeInTheDocument()
    expect(screen.getByText('Prioriser les bons comptes')).toBeInTheDocument()
    expect(screen.getByText('Limiter la charge active')).toBeInTheDocument()
  })

  // #4425.1 — L'APPELANT : verdict, chaîne, maturité et plan sont CALCULÉS ; aucun
  // ne s'édite, chacun nomme les étapes du profil d'où il vient, un lien par étape.
  it('#4425.1 — les blocs calculés disent « calculé à partir de » avec un lien vers chaque étape source', async () => {
    mountWith(CONTEXT)
    await screen.findByText('Arrêter')
    const blocks = screen.getAllByTestId('audit-stage-sources')
    expect(blocks.length).toBeGreaterThanOrEqual(4)
    const hrefs = blocks.flatMap(block =>
      within(block)
        .getAllByRole('link')
        .map(link => link.getAttribute('href')),
    )
    expect(new Set(hrefs)).toEqual(
      new Set([
        '/settings/profile/company_info',
        '/settings/profile/offer_expertise',
        '/settings/profile/target_market',
      ]),
    )
  })

  // Épopée #2880 (#2039.14) — L'APPELANT : l'audit à 3 états par expertise
  // est monté là où l'audit d'onboarding s'affiche déjà (décision Louis).
  it('monte la carte « Crédibilité par expertise »', async () => {
    mountWith(CONTEXT)
    await screen.findByText('Arrêter')
    expect(screen.getByRole('region', { name: /crédibilité par expertise/i })).toBeInTheDocument()
  })

  // #2073 — L'APPELANT : AuditStrategyOptions doit être monté par l'écran,
  // pas seulement exister. Sans cette ligne, la section reste du code juste
  // que personne n'appelle (le défaut le plus fréquent du dépôt).
  it('affiche les voies d’entrée possibles, à côté des trois décisions', async () => {
    mountWith(CONTEXT)
    await screen.findByText('Arrêter')
    expect(screen.getByText('Les voies possibles')).toBeInTheDocument()
    expect(screen.getByText('entrée par le terrain')).toBeInTheDocument()
    expect(screen.getByText('Recommandée')).toBeInTheDocument()
  })

  // #2073.8/.11 — L'APPELANT DU CHAMP CHOISI : `useCommercialAudit()` doit
  // faire voyager `chosenEntryStrategy` jusqu'à `AuditStrategyOptions`, ET
  // jusqu'à la conséquence « accounts » (#2073.11, même donnée). Sans cette
  // ligne, un champ juste et testé côté hook resterait du code que l'écran
  // n'appelle pas.
  it('#2073.8/.11 — la stratégie CHOISIE porte son badge et configure la conséquence « accounts »', async () => {
    mountWith(CONTEXT, REVISIONS, null, undefined, 'multiThread')
    await screen.findByText('Arrêter')
    expect(screen.getByText('Stratégie retenue')).toBeInTheDocument()
    // La recommandation initiale reste visible et NOMMÉE séparément —
    // les deux badges ne se confondent pas.
    expect(screen.getByText('Recommandée')).toBeInTheDocument()
    // #2073.11 — la conséquence « accounts » (`AuditConsequences`) lit
    // désormais la stratégie CHOISIE (« entrée sur plusieurs fils »), jamais
    // plus la seule stratégie CALCULÉE du profil (« entrée par le terrain »).
    expect(screen.getByText('Des comptes ETI, en entrée sur plusieurs fils.')).toBeInTheDocument()
  })

  it('mène au questionnaire et au copilote — l’écran n’est pas un cul-de-sac', async () => {
    const { container } = mountWith(CONTEXT)
    await screen.findByText('Arrêter')
    const toProfile = container.querySelectorAll('a[href="/settings/profile"]')
    expect(toProfile.length).toBeGreaterThan(0)
    expect(container.querySelector('a[href^="/chat"]')).not.toBeNull()
    expect(container.querySelector('a[href="/settings/profile/context"]')).not.toBeNull()
  })

  it('n’affiche AUCUN niveau de confiance chiffré, ni pourcentage, ni score sur 100', async () => {
    const { container } = mountWith(CONTEXT)
    await screen.findByText('Arrêter')
    const rendered = container.textContent ?? ''
    expect(rendered).not.toMatch(/\d+\s?%/)
    expect(rendered).not.toMatch(/\/\s?100\b/)
  })

  it('dit « non mesuré » sur un bloc absent — et n’écrit nulle part un zéro de remplissage', async () => {
    const { coachingInsights: _dropped, ...withoutCoaching } = CONTEXT
    const { container } = mountWith(withoutCoaching as ProfileContext)
    await screen.findByText('Arrêter')
    const rendered = container.textContent ?? ''
    expect(screen.getAllByText('non mesuré').length).toBeGreaterThan(0)
    // La cadence n'existe pas : aucune ligne ne doit prétendre un rythme nul.
    expect(rendered).not.toMatch(/0 analyse/)
    expect(rendered).not.toMatch(/0 message/)
    // Et ce qui manque est NOMMÉ, pas seulement absent.
    expect(screen.getAllByText(/la lecture de tes réponses/).length).toBeGreaterThan(0)
  })

  it('affiche un ZÉRO MESURÉ tel quel — un bloc présent qui dit zéro dit zéro', async () => {
    const { container } = mountWith({
      ...CONTEXT,
      coachingInsights: {
        ...CONTEXT.coachingInsights!,
        cadenceRecommendation: { analysesPerWeek: 0, messagesPerDay: 0, followUpsPerWeek: 0 },
      },
    })
    await screen.findByText('Arrêter')
    expect(container.textContent ?? '').toMatch(/0 analyse par semaine/)
  })

  it('ouvre la porte du questionnaire plutôt qu’un écran de cases vides quand rien n’est établi', async () => {
    const { container } = mountWith(null, [])
    expect(
      await screen.findByText(/Ton profil n’a pas encore été établi|Ton profil n'a pas encore été établi/),
    ).toBeInTheDocument()
    expect(container.querySelector('a[href="/settings/profile"]')).not.toBeNull()
    expect(screen.queryByText('Arrêter')).toBeNull()
  })

  // D9 (14/09/2026) — bouton Valider : le clic EST la décision. Preuve que
  // l'écran monte réellement `ValidateContextStatus` (et pas seulement le
  // hook) : sans le câblage dans `AuditHero`, ni le bouton ni le texte
  // « Validé le … » ne rendent jamais, quel que soit `validatedAt`.
  it('porte le bouton « Valider » quand le contexte n’est pas encore validé', async () => {
    mountWith(CONTEXT, REVISIONS, null)
    await screen.findByText('Arrêter')
    expect(screen.getByRole('button', { name: 'Valider' })).toBeInTheDocument()
  })

  it('affiche « Validé le … » et plus de bouton quand le contexte est déjà validé', async () => {
    mountWith(CONTEXT, REVISIONS, '2026-09-10T08:00:00.000Z')
    await screen.findByText('Arrêter')
    expect(screen.getByText(/Validé le/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Valider' })).toBeNull()
  })

  // #2068 — LE CHAÎNON MANQUANT : `buildCommercialAuditContext` calcule le
  // plan à 4 semaines, les paliers et la configuration produit depuis des
  // mois ; avant ce lot, aucun écran ne les rendait. Ces deux tests sont
  // L'APPELANT au sens du registre : sans eux, le contexte reste du code
  // juste que personne n'appelle, comme avant.
  it('rend le plan à 4 semaines et les paliers quand une source les mesure', async () => {
    const withPlan: CommercialAuditContext = {
      ...buildCommercialAuditContext(CONTEXT, REVISIONS),
      thirtyDayPlan: [
        {
          weekNumber: 1,
          priorities: [
            {
              expectedResult: 'Deux comptes prioritaires qualifiés',
              action: 'Ouvrir deux analyses sur les comptes visés',
              owner: null,
              slot: null,
              dependency: null,
              completionProof: null,
              surfaceLink: null,
              replacementCondition: null,
              // #2068.24-.31 — additif au contrat, requis côté TypeScript.
              domain: null,
            },
          ],
        },
        { weekNumber: 2, priorities: [] },
        { weekNumber: 3, priorities: [] },
        { weekNumber: 4, priorities: [] },
      ],
      milestones: [
        {
          horizon: '60d',
          systemObjective: 'Un rythme de prospection tenu sans y penser',
          expectedProof: null,
          passageCondition: null,
          decisionToMake: null,
          correctionIfNotReached: null,
        },
      ],
    }
    mountWith(CONTEXT, REVISIONS, null, withPlan)
    await screen.findByText('Arrêter')
    expect(screen.getByText('Ouvrir deux analyses sur les comptes visés')).toBeInTheDocument()
    expect(screen.getByText('Un rythme de prospection tenu sans y penser')).toBeInTheDocument()
  })

  it('nomme « non mesuré » le plan et les paliers quand aucune source ne les produit encore', async () => {
    mountWith(CONTEXT)
    await screen.findByText('Arrêter')
    expect(screen.getByText('Plan à 4 semaines')).toBeInTheDocument()
    expect(screen.getByText('Paliers')).toBeInTheDocument()
    expect(screen.getAllByText('non mesuré').length).toBeGreaterThanOrEqual(3)
  })

  // #2090.12 / #2090.15 / #2090.16 / #2090.17 / #2090.31, #2066.1-.10 —
  // L'APPELANT : `CONTEXT` n'a pas de `analysisParameters`, donc
  // `acquisitionWithoutRoutine` se déclenche réellement (`tension-
  // detectors.ts`) — classée sous l'étape fine `contact` depuis #2066 (voir
  // `audit-chain.ts`). Sans ces assertions, `AuditVerdict` / `AuditChain` /
  // `AuditWeeklyPriority` resteraient du code juste que l'écran n'exercerait
  // jamais.
  it('#2090 — rend le verdict, la chaîne et sa rupture cliquable, et la priorité de la semaine', async () => {
    const user = userEvent.setup()
    mountWith(CONTEXT)
    await screen.findByText('Arrêter')

    // Le verdict tranche sur la rupture réellement déclenchée.
    expect(
      screen.getByText("Une cadence d'acquisition est recommandée sans routine d'analyse configurée pour la tenir."),
    ).toBeInTheDocument()

    // La chaîne rend ses NEUF étapes (#2066), « Contact » en rupture.
    //
    // ⚠️ Scopé à la section de la chaîne, et ça n'est pas de la prudence
    // gratuite : #2065 ajoute les douze axes de maturité, dont un porte lui
    // aussi le libellé « Capitalisation » — exactement comme l'étape finale de
    // la chaîne. Un `getByText` nu y trouverait DEUX éléments et lèverait. Le
    // point d'ancrage est le titre de la section, qui lui est unique ;
    // « Entrées » ne l'est plus, il appartenait aux six macro-étapes d'avant.
    const chainSection = screen.getByText('La chaîne commerciale').closest('section')
    expect(chainSection).not.toBeNull()
    const chain = within(chainSection as HTMLElement)
    expect(chain.getByText('Contact')).toBeInTheDocument()
    expect(chain.getByText('Capitalisation')).toBeInTheDocument()
    const contactButton = chain.getByRole('button', { name: /Contact/ })
    await user.click(contactButton)
    // #2010.10 — scopé à la section de la chaîne (comme ci-dessus) : depuis
    // que `AuditHypotheses` reprend, lui aussi, le libellé de règle pour la
    // MÊME rupture (elle porte une hypothèse), un `getByText` nu trouverait
    // DEUX éléments.
    expect(chain.getByText("De l'acquisition sans routine")).toBeInTheDocument()

    // La priorité de la semaine reprend la MÊME question à valider que la
    // rupture ouverte — la carte n'invente pas une deuxième action.
    expect(screen.getByText('Prioriser cette semaine')).toBeInTheDocument()
    expect(screen.getByText('Où et quand cette cadence est-elle réellement tenue ?')).toBeInTheDocument()
  })

  // #2075.24/.27/.28 — L'APPELANT MANQUANT : `useCommercialAudit()` calcule déjà
  // `firstAnalysisSuggestions`, et `buildWeeklyPriority(auditContext)` calcule
  // déjà la MÊME action que la carte « Prioriser cette semaine » ci-dessus —
  // mais avant ce lot, `CommercialAuditScreen` ne les relayait pas à `AuditHero`
  // (déstructuration incomplète, deux props jamais passées). `ValidateContextStatus`
  // a déjà ses preuves unitaires (`ValidateContextStatus.test.tsx`) ; ce test
  // vise SEULEMENT le relais, avec les VRAIES données de cet écran.
  it('#2075.24/.27/.28 — relaie la VRAIE suggestion et la VRAIE priorité de la semaine jusqu’au relais post-validation', async () => {
    const suggestion: FirstAnalysisSuggestion = {
      companyName: 'Société Générale',
      sector: 'Banque',
      reason: 'secteur cible déclaré',
    }
    mountWith(CONTEXT, REVISIONS, null, undefined, null, {}, [suggestion], JUST_VALIDATED)
    await screen.findByTestId('validate-handoff')

    // #2075.27/.28 — le compte proposé est LA VRAIE suggestion de cet écran,
    // pas un texte générique ni une carte vide.
    const handoff = within(screen.getByTestId('validate-handoff'))
    expect(handoff.getByTestId('validate-handoff-account')).toHaveTextContent('Société Générale')

    // #2075.24 — la question de Laura porte la MÊME priorité que la carte
    // « Prioriser cette semaine » (ligne au-dessus), jamais une question générique
    // alors qu'une vraie priorité est calculée. Scopé au relais : « Laura » se
    // lit aussi ailleurs sur cet écran (CTA principal, mémoire marché).
    // #4309.1 (lot LAURA, 19/10/2026) — sur bureau, le relais ouvre la bulle SUR PLACE : un bouton
    // qui dépose la question dans le magasin de Laura, lue ici comme la bulle la lit.
    resetLauraIntro()
    fireEvent.click(handoff.getByRole('button', { name: /Laura/ }))
    const request = renderHook(() => useLauraOpenRequest()).result.current
    expect(request?.question).toContain('Où et quand cette cadence est-elle réellement tenue')
  })

  // #2067.2 / .4 / .5 / .6 — L'APPELANT : la section doit être MONTÉE par
  // l'écran, juste après « À partir de maintenant, … va… » (où vivent ses deux
  // frères #2067.1 / #2067.3), pas seulement exister.
  it('#2067 — monte l’arbitrage de la charge active après les conséquences, sans aucun zéro de remplissage', async () => {
    const { container } = mountWith(CONTEXT)
    const title = await screen.findByRole('heading', { name: 'Ta charge active, arbitrée' })
    const consequences = screen.getByRole('heading', { name: /À partir de maintenant/ })
    expect(consequences.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Aucune réponse lue dans ce montage : les quatre grandeurs sont NOMMÉES non établies.
    expect(screen.getAllByText('Non établi.')).toHaveLength(4)
    expect(container.textContent ?? '').not.toMatch(/0 front/)
  })

  it('#2021 — propose le mode guidé depuis l’audit et déclenche le MÊME geste que #2022', async () => {
    const trigger = vi.fn().mockResolvedValue(true)
    vi.mocked(useReconfigureOnboarding).mockReturnValue({
      available: true,
      alreadyRequested: false,
      pending: false,
      trigger,
    })
    mountWith(CONTEXT)
    await userEvent.click(await screen.findByRole('button', { name: /mode guidé/i }))
    expect(trigger).toHaveBeenCalledTimes(1)
  })

  it('#2021 — ne montre pas le lien quand le mode guidé n’est pas disponible (démo, onboarding jamais démarré)', async () => {
    vi.mocked(useReconfigureOnboarding).mockReturnValue({
      available: false,
      alreadyRequested: false,
      pending: false,
      trigger: vi.fn(),
    })
    mountWith(CONTEXT)
    await screen.findByText('Arrêter')
    expect(screen.queryByRole('button', { name: /mode guidé/i })).not.toBeInTheDocument()
  })

  // #4969 — `/settings/profile/audit` restait sur « Lecture de ton profil… » : une lecture qui échoue se DIT.
  it('une lecture du profil en échec le dit, au lieu de rester sur « Lecture de ton profil… »', async () => {
    auditMock.mockReturnValue({ isLoading: false, loadError: true, hasProfileContext: false })
    renderWithRouter(<CommercialAuditScreen />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/n’a pas pu être lu/)
    expect(screen.queryByText(/Lecture de ton profil/)).toBeNull()
    expect(screen.getByRole('alert').textContent).toMatch(/n’a pas pu être lu/)
  })
})
