import { fireEvent, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { OnboardingActivation, OnboardingStateResponse } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { onboardingApi } from '../api'
import { ActivationChecklist } from './ActivationChecklist'

const { mockUseActivation, navigateMock } = vi.hoisted(() => ({
  mockUseActivation: vi.fn(),
  navigateMock: vi.fn(),
}))

vi.mock('../hooks/useActivation', () => ({ useActivation: () => mockUseActivation() }))

// Keep the real router (renderWithRouter needs it) but observe `useNavigate`.
vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigateMock,
}))

/** #2077.9 — `colleague_invited` par défaut à `not_applicable` : préserve le
 *  dénominateur à 7 pour tous les tests qui ne s'y intéressent pas — le jalon
 *  tri-état a ses propres tests, plus bas. */
function activation(overrides: Partial<OnboardingActivation> = {}): OnboardingActivation {
  const steps = {
    profile_completed: false,
    analysis_launched: false,
    dossier_viewed: false,
    contact_enriched: false,
    message_prepared: false,
    tool_connected: false,
    correction_made: false,
    colleague_invited: 'not_applicable' as const,
    ...overrides,
  }
  const booleanDone = [
    steps.profile_completed,
    steps.analysis_launched,
    steps.dossier_viewed,
    steps.contact_enriched,
    steps.message_prepared,
    steps.tool_connected,
    steps.correction_made,
  ].filter(Boolean).length
  const completed = booleanDone + (steps.colleague_invited === 'done' ? 1 : 0)
  const applicable = 7 + (steps.colleague_invited === 'not_applicable' ? 0 : 1)
  return { ...steps, completed_count: completed, is_complete: completed === applicable }
}

const STEP_LABELS = [
  'Valide ton profil commercial',
  'Lance ta première analyse',
  'Ouvre ton premier dossier',
  'Enrichis un contact clé',
  'Copie ou envoie un premier message',
  'Connecte un premier outil (messagerie, agenda ou CRM)',
  // #2077.6 — le 7e jalon.
  'Corrige ce qui est faux dans un dossier',
]

/** #2077.11 — le bénéfice attendu SOUS chaque étape restante, un par étape. */
const STEP_BENEFITS = [
  "Tes analyses parlent de TON offre, pas d'une ESN générique.",
  "Un nom d'entreprise devient un dossier : contacts, angles, plan d'action.",
  "C'est là que la première valeur se voit — une page au lieu de dix onglets.",
  'Tu obtiens de quoi joindre le bon interlocuteur, pas un formulaire de contact.',
  'Un message prêt à partir, écrit avec ce que le dossier a trouvé.',
  'Tes échanges et ton agenda nourrissent les dossiers, sans ressaisie.',
  "Ce que tu corriges revient corrigé à l'analyse suivante : le dossier devient la mémoire de ton équipe.",
]

/**
 * #2077.11 — le nom accessible d'une étape est « libellé + bénéfice » depuis que
 * chaque rangée dit ce qu'elle fait gagner. Les requêtes visent donc le
 * PRÉFIXE : elles restent exactes sur le libellé, sans recopier la phrase.
 */
function stepName(label: string): { name: RegExp } {
  return { name: new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }
}

beforeEach(() => {
  mockUseActivation.mockReset()
  navigateMock.mockReset()
  window.localStorage.removeItem('bellum_activation_collapsed')
  window.localStorage.removeItem('bellum_activation_hidden')
})

function allDone(): OnboardingActivation {
  return activation({
    profile_completed: true,
    analysis_launched: true,
    dossier_viewed: true,
    contact_enriched: true,
    message_prepared: true,
    tool_connected: true,
    correction_made: true,
  })
}

/** Mounts the widget next to a sentinel so tests can await the router resolving
 *  the route even when the widget itself renders nothing. */
/** The widget starts COLLAPSED by default: a test that needs the steps visible
 *  says so, the way a returning user's stored preference does. */
function withExpandedPreference() {
  window.localStorage.setItem('bellum_activation_collapsed', '0')
}

async function renderChecklist() {
  const result = renderWithRouter(
    <>
      <ActivationChecklist />
      <div data-testid="sentinel" />
    </>,
  )
  await screen.findByTestId('sentinel')
  return result
}

describe('ActivationChecklist', () => {
  it('renders nothing while the real state is unknown (loading/error) — never a fake 0/6', async () => {
    mockUseActivation.mockReturnValue({ data: undefined })
    await renderChecklist()
    expect(screen.queryByText('Bien démarrer avec Bellum')).toBeNull()
  })

  // #3490 (vu en passant, recette 02/10) — la barre arrivait après le chargement et
  // poussait le contenu de ~60 px : pendant le chargement, sa HAUTEUR est réservée.
  it('reserves the collapsed bar height while loading, shows nothing in it (no fake 0/7)', async () => {
    mockUseActivation.mockReturnValue({ data: undefined, isLoading: true })
    await renderChecklist()
    expect(screen.getByTestId('activation-checklist-placeholder')).toBeInTheDocument()
    expect(screen.queryByText(/\d+\/\d+/)).toBeNull()
  })

  it('reserves nothing once the load has failed — no empty hole for an error', async () => {
    mockUseActivation.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    await renderChecklist()
    expect(screen.queryByTestId('activation-checklist-placeholder')).toBeNull()
  })

  it('starts collapsed — header and progress only, no step list', async () => {
    mockUseActivation.mockReturnValue({ data: activation() })
    await renderChecklist()

    expect(screen.getByText('Bien démarrer avec Bellum')).toBeInTheDocument()
    expect(screen.getByText('0/7')).toBeInTheDocument()
    expect(screen.queryByRole('button', stepName('Lance ta première analyse'))).toBeNull()
    expect(screen.getByRole('button', { name: 'Déployer la checklist de démarrage' })).toBeInTheDocument()
  })

  it('reopens on demand and persists that the user wants it open', async () => {
    mockUseActivation.mockReturnValue({ data: activation() })
    await renderChecklist()

    fireEvent.click(screen.getByRole('button', { name: 'Déployer la checklist de démarrage' }))

    expect(screen.getByRole('button', stepName('Lance ta première analyse'))).toBeInTheDocument()
    expect(window.localStorage.getItem('bellum_activation_collapsed')).toBe('0')
  })

  it('stays open for a user who already opened it', async () => {
    withExpandedPreference()
    mockUseActivation.mockReturnValue({ data: activation() })
    await renderChecklist()

    expect(screen.getByRole('button', stepName('Lance ta première analyse'))).toBeInTheDocument()
  })

  it('shows the 7 steps as actionable for a brand-new user (0/7)', async () => {
    withExpandedPreference()
    mockUseActivation.mockReturnValue({ data: activation() })
    await renderChecklist()

    expect(screen.getByText('Bien démarrer avec Bellum')).toBeInTheDocument()
    expect(screen.getByText('0/7')).toBeInTheDocument()
    for (const label of STEP_LABELS) {
      expect(screen.getByRole('button', stepName(label))).toBeInTheDocument()
    }
  })

  it('marks reached milestones as done (no longer actionable) and counts them', async () => {
    withExpandedPreference()
    mockUseActivation.mockReturnValue({
      data: activation({ profile_completed: true, analysis_launched: true }),
    })
    await renderChecklist()

    expect(screen.getByText('2/7')).toBeInTheDocument()
    // Done steps render as plain rows, not buttons.
    expect(screen.queryByRole('button', stepName('Valide ton profil commercial'))).toBeNull()
    expect(screen.getByText('Valide ton profil commercial')).toBeInTheDocument()
    // Next step stays actionable.
    expect(screen.getByRole('button', stepName('Ouvre ton premier dossier'))).toBeInTheDocument()
  })

  it('routes each incomplete step to the page where it gets done', async () => {
    withExpandedPreference()
    mockUseActivation.mockReturnValue({ data: activation() })
    await renderChecklist()

    fireEvent.click(screen.getByRole('button', stepName('Lance ta première analyse')))
    expect(navigateMock).toHaveBeenCalledWith({ to: '/search' })

    fireEvent.click(screen.getByRole('button', stepName('Valide ton profil commercial')))
    expect(navigateMock).toHaveBeenCalledWith({ to: '/settings/profile/audit' })
  })

  it('#1810 — le 6e jalon nomme la CAPACITÉ (jamais un éditeur) et renvoie vers Intégrations', async () => {
    withExpandedPreference()
    mockUseActivation.mockReturnValue({ data: activation() })
    await renderChecklist()

    const label = 'Connecte un premier outil (messagerie, agenda ou CRM)'
    expect(screen.getByRole('button', stepName(label))).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', stepName(label)))
    expect(navigateMock).toHaveBeenCalledWith({ to: '/integrations' })
  })

  it('collapses to a compact header and persists the preference', async () => {
    withExpandedPreference()
    mockUseActivation.mockReturnValue({ data: activation() })
    await renderChecklist()

    fireEvent.click(screen.getByRole('button', { name: 'Réduire la checklist de démarrage' }))

    expect(screen.queryByRole('button', stepName('Lance ta première analyse'))).toBeNull()
    expect(screen.getByText('0/7')).toBeInTheDocument() // progress stays visible
    expect(window.localStorage.getItem('bellum_activation_collapsed')).toBe('1')

    fireEvent.click(screen.getByRole('button', { name: 'Déployer la checklist de démarrage' }))
    expect(screen.getByRole('button', stepName('Lance ta première analyse'))).toBeInTheDocument()
  })

  // #1794.2 — remplace l'ancien « disparaît entièrement une fois les 5
  // milestones atteints » : le retour dit explicitement que la barre doit
  // RESTER après l'onboarding fini, pour pouvoir être relancée. La disparition
  // devient un geste EXPLICITE (masquer, testé plus bas), jamais un fait dérivé
  // du serveur.
  it('reste affichée une fois tous les milestones atteints (#1794.2) — elle ne disparaît plus toute seule', async () => {
    mockUseActivation.mockReturnValue({ data: allDone() })
    await renderChecklist()
    expect(screen.getByText('Bien démarrer avec Bellum')).toBeInTheDocument()
    expect(screen.getByText('7/7')).toBeInTheDocument()
  })

  it('replié, il dit la PROCHAINE étape et propose de continuer (#1405)', async () => {
    // Le retour : « le bloc prend beaucoup trop d'espace pour un utilisateur qui
    // a déjà commencé ». Il était DÉJÀ replié par défaut — ce qui manquait est
    // qu'une pastille « 4/5 » n'apprend rien : il fallait déplier pour savoir
    // quoi faire, c'est-à-dire refaire le geste qu'on venait d'annuler.
    mockUseActivation.mockReturnValue({ data: activation({ profile_completed: true }) })
    await renderChecklist()

    expect(screen.getByText('Prochaine étape : Lance ta première analyse')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeInTheDocument()
    // …et la liste complète reste repliée : c'est bien un raccourci, pas un dépliage.
    expect(screen.queryByRole('button', stepName('Lance ta première analyse'))).toBeNull()
  })

  it('la ligne compacte DISPARAÎT une fois déplié — jamais deux fois le même geste', async () => {
    // Loi 4 du tome 7 : la liste dit déjà tout, la répéter en entête serait le
    // même contenu sous la même forme au même écran.
    withExpandedPreference()
    mockUseActivation.mockReturnValue({ data: activation({ profile_completed: true }) })
    await renderChecklist()

    expect(screen.queryByText(/Prochaine étape/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Continuer' })).toBeNull()
    expect(screen.getByRole('button', stepName('Lance ta première analyse'))).toBeInTheDocument()
  })
})

/**
 * #2117.84 — RECETTE IPHONE DU 25/09 : REPLIÉ, LE BANDEAU FAISAIT 4 LIGNES
 * SOUS 768PX.
 *
 * Replié, la ligne portait le titre, la prochaine étape (texte libre, sans
 * borne de longueur) ET le bouton « Continuer » à côté de la pastille de
 * progression et du chevron — six éléments sur une seule rangée `flex`
 * `nowrap` avec deux blocs `min-w-0 flex-1` en concurrence. Sur 375px, les
 * `shrink-0` (bouton, pastille, chevron) prenaient toute la largeur utile et
 * les deux blocs flexibles s'écrasaient à quelques pixels, faisant tenir
 * « Bien démarrer avec Bellum » sur plusieurs lignes.
 *
 * La version demandée : titre court + pastille de progression + chevron, sur
 * UNE ligne — la prochaine étape et « Continuer » restent un geste de
 * BUREAU, où la largeur ne manque pas.
 *
 * Même faux `matchMedia` que `SidebarCollapse.test.tsx` — jsdom ne
 * l'implémente pas.
 */
function stubMatchMedia(narrow: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: narrow && query.includes('max-width'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  )
}

describe('#2117.84 — replié, le bandeau tient sur une ligne sous 768px', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('masque la prochaine étape et « Continuer » sous 768px — titre + progression + chevron seulement', async () => {
    stubMatchMedia(true)
    mockUseActivation.mockReturnValue({ data: activation({ profile_completed: true }) })
    await renderChecklist()

    expect(screen.getByText('Bien démarrer avec Bellum')).toBeInTheDocument()
    expect(screen.getByText('1/7')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Déployer la checklist de démarrage' })).toBeInTheDocument()
    expect(screen.queryByText(/Prochaine étape/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Continuer' })).toBeNull()
  })

  it('le bureau garde la prochaine étape et « Continuer » (non-régression)', async () => {
    stubMatchMedia(false)
    mockUseActivation.mockReturnValue({ data: activation({ profile_completed: true }) })
    await renderChecklist()

    expect(screen.getByText('Prochaine étape : Lance ta première analyse')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeInTheDocument()
  })
})

describe('ActivationChecklist — #1794 le tutoriel se relance', () => {
  it('ne propose pas de masquer tant que l’onboarding n’est pas terminé', async () => {
    mockUseActivation.mockReturnValue({ data: activation() })
    await renderChecklist()
    expect(screen.queryByRole('button', { name: 'Masquer la checklist de démarrage' })).toBeNull()
  })

  it('#1794.1 — se redéploie sans limite une fois terminé : le chevron reste le bouton qui relance le tuto', async () => {
    mockUseActivation.mockReturnValue({ data: allDone() })
    await renderChecklist()

    // Trois allers-retours : rien ne compte les fois, rien ne se bloque.
    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Déployer la checklist de démarrage' }))
      expect(screen.getByText('Valide ton profil commercial')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Réduire la checklist de démarrage' }))
      expect(screen.queryByText('Valide ton profil commercial')).toBeNull()
    }
  })

  it('#1794.2 — une fois terminé, « Masquer » efface la barre et le choix persiste', async () => {
    mockUseActivation.mockReturnValue({ data: allDone() })
    await renderChecklist()

    fireEvent.click(screen.getByRole('button', { name: 'Masquer la checklist de démarrage' }))

    expect(screen.queryByText('Bien démarrer avec Bellum')).toBeNull()
    expect(window.localStorage.getItem('bellum_activation_hidden')).toBe('1')
  })

  it('#1794.3 — reste masquée au remontage : c’est cet état que les Réglages devront pouvoir défaire', async () => {
    window.localStorage.setItem('bellum_activation_hidden', '1')
    mockUseActivation.mockReturnValue({ data: allDone() })
    await renderChecklist()
    expect(screen.queryByText('Bien démarrer avec Bellum')).toBeNull()
  })

  /**
   * ⚠️⚠️ Arbitrage déjà posé : relancer le tuto ne doit JAMAIS redemander à
   * l'utilisateur ce qu'il a déjà répondu. Les réponses du questionnaire
   * (Temps 1 ET Temps 2) vivent côté serveur dans `esn_profiles`, lues par
   * `GET /onboarding/state` et écrites par `PUT /onboarding/answers`
   * (`onboardingApi.getState` / `saveAnswers` / `advanceStage` / `complete`,
   * voir `features/onboarding/api.ts`). La preuve : redéployer, réduire et
   * masquer la barre ne touche AUCUNE de ces quatre fonctions, et ne navigue
   * jamais vers une route `/onboarding/*`.
   */
  it('#1794 ⚠️ — masquer/redéployer ne rejoue jamais le questionnaire (aucune lecture ni écriture de esn_profiles)', async () => {
    // Fixture minimale — même convention que useOnboardingNavigation.test.tsx :
    // seule la FORME du retour compte ici, jamais son contenu (ces fonctions
    // ne doivent de toute façon jamais être appelées).
    const fakeState = { id: 'ob-1', status: 'completed' } as unknown as OnboardingStateResponse
    const getState = vi.spyOn(onboardingApi, 'getState').mockResolvedValue(fakeState)
    const saveAnswers = vi.spyOn(onboardingApi, 'saveAnswers').mockResolvedValue(fakeState)
    const advanceStage = vi.spyOn(onboardingApi, 'advanceStage').mockResolvedValue(fakeState)
    const complete = vi.spyOn(onboardingApi, 'complete').mockResolvedValue(fakeState)

    mockUseActivation.mockReturnValue({ data: allDone() })
    await renderChecklist()

    fireEvent.click(screen.getByRole('button', { name: 'Déployer la checklist de démarrage' }))
    fireEvent.click(screen.getByRole('button', { name: 'Réduire la checklist de démarrage' }))
    fireEvent.click(screen.getByRole('button', { name: 'Masquer la checklist de démarrage' }))

    expect(getState).not.toHaveBeenCalled()
    expect(saveAnswers).not.toHaveBeenCalled()
    expect(advanceStage).not.toHaveBeenCalled()
    expect(complete).not.toHaveBeenCalled()
    for (const call of navigateMock.mock.calls) {
      const target = (call[0] as { to?: string })?.to
      expect(target?.startsWith('/onboarding')).toBe(false)
    }

    getState.mockRestore()
    saveAnswers.mockRestore()
    advanceStage.mockRestore()
    complete.mockRestore()
  })
  /**
   * #2002 (la famille) — la ligne d'étape est le geste le plus pressé du
   * parcours d'entrée, et c'était le seul de ce composant sans plancher
   * tactile : le chevron et la croix portent déjà leurs 44 px, la rangée
   * cliquable tenait dans 36 px (`px-2 py-2` autour d'une puce de 20 px).
   *
   * ⚠️ jsdom ne mesure pas : on lit la classe. Un `<button>` est déjà une
   * boîte inline-block, `min-height` s'y applique sans passage en flex —
   * contrairement aux `<a>` de `/onboarding/plan` et `/welcome`.
   */
  it('#2002 — chaque étape restante atteint 44 px au doigt (GA-30)', async () => {
    withExpandedPreference()
    mockUseActivation.mockReturnValue({ data: activation() })
    await renderChecklist()

    for (const label of STEP_LABELS) {
      const row = screen.getByRole('button', stepName(label))
      expect(row.className).toContain('pointer-coarse:min-h-11')
    }
  })
})

/**
 * #2077.10 / #2077.11 — la checklist n'est pas une liste de devoirs.
 *
 * La garde prouve les trois choses : elle LIT le corpus réel (les 7 étapes
 * rendues, et elle refuse une liste vide), elle SAIT DIRE NON (une étape sans
 * bénéfice ressort nommément) et elle N'ATTRAPE PAS ce qu'elle ne vise pas
 * (une étape DÉJÀ FAITE n'a pas à répéter son bénéfice — il est acquis).
 */
describe('ActivationChecklist — #2077.10/.11 chaque étape dit ce qu’elle fait gagner', () => {
  it('lit un corpus non vide — les 7 étapes restantes sont rendues', async () => {
    withExpandedPreference()
    mockUseActivation.mockReturnValue({ data: activation() })
    await renderChecklist()

    expect(STEP_LABELS).toHaveLength(7)
    for (const label of STEP_LABELS) expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('CHAQUE étape restante porte son bénéfice, et AUCUNE ne manque', async () => {
    withExpandedPreference()
    mockUseActivation.mockReturnValue({ data: activation() })
    await renderChecklist()

    const manquants = STEP_BENEFITS.filter(benefit => screen.queryByText(benefit) === null)
    expect(manquants).toEqual([])
  })

  it('N’ATTRAPE PAS ce qu’elle ne vise pas — une étape FAITE ne répète pas son bénéfice', async () => {
    withExpandedPreference()
    mockUseActivation.mockReturnValue({ data: activation({ profile_completed: true }) })
    await renderChecklist()

    expect(screen.getByText(STEP_LABELS[0] as string)).toBeInTheDocument()
    expect(screen.queryByText(STEP_BENEFITS[0] as string)).toBeNull()
    // Les six autres, elles, portent toujours le leur.
    expect(screen.getByText(STEP_BENEFITS[1] as string)).toBeInTheDocument()
  })

  it('#2077.10 — l’entrée en matière parle de gain et de liberté, jamais d’obligation', async () => {
    withExpandedPreference()
    mockUseActivation.mockReturnValue({ data: activation() })
    await renderChecklist()

    const sousTitre = screen.getByText(/Ce que chacune te fait gagner/)
    expect(sousTitre.textContent ?? '').toMatch(/Rien n'est obligatoire/)
  })
})

// #2077.9 — le jalon tri-état « premier collègue invité ». Un booléen qui ne
// peut jamais passer à vrai (pas de `team:manage`, ou plus de siège) ment :
// `not_applicable` sort de la liste ET du dénominateur, jamais « pas encore ».
describe('ActivationChecklist — #2077.9 colleague_invited (tri-état)', () => {
  it('`not_applicable` n’apparaît PAS dans la liste et ne compte pas dans le dénominateur', async () => {
    withExpandedPreference()
    mockUseActivation.mockReturnValue({ data: activation({ colleague_invited: 'not_applicable' }) })
    await renderChecklist()

    expect(screen.getByText('0/7')).toBeInTheDocument()
    expect(screen.queryByRole('button', stepName('Invite un premier collègue'))).toBeNull()
    expect(screen.queryByText('Invite un premier collègue')).toBeNull()
  })

  it('`pending` apparaît comme une étape actionnable, et compte dans le dénominateur (0/8)', async () => {
    withExpandedPreference()
    mockUseActivation.mockReturnValue({ data: activation({ colleague_invited: 'pending' }) })
    await renderChecklist()

    expect(screen.getByText('0/8')).toBeInTheDocument()
    expect(screen.getByRole('button', stepName('Invite un premier collègue'))).toBeInTheDocument()
  })

  it('route vers l’écran Équipe, jamais un formulaire d’onboarding', async () => {
    withExpandedPreference()
    mockUseActivation.mockReturnValue({ data: activation({ colleague_invited: 'pending' }) })
    await renderChecklist()

    fireEvent.click(screen.getByRole('button', stepName('Invite un premier collègue')))
    expect(navigateMock).toHaveBeenCalledWith({ to: '/settings/team' })
  })

  it('`done` rend l’étape comme faite (plus un bouton) et compte dans le dénominateur (1/8)', async () => {
    withExpandedPreference()
    mockUseActivation.mockReturnValue({ data: activation({ colleague_invited: 'done' }) })
    await renderChecklist()

    expect(screen.getByText('1/8')).toBeInTheDocument()
    expect(screen.queryByRole('button', stepName('Invite un premier collègue'))).toBeNull()
    expect(screen.getByText('Invite un premier collègue')).toBeInTheDocument()
  })

  it('is_complete reste vrai à 7/7 quand le seul jalon manquant est `not_applicable`', async () => {
    mockUseActivation.mockReturnValue({
      data: activation({
        profile_completed: true,
        analysis_launched: true,
        dossier_viewed: true,
        contact_enriched: true,
        message_prepared: true,
        tool_connected: true,
        correction_made: true,
        colleague_invited: 'not_applicable',
      }),
    })
    await renderChecklist()

    expect(screen.getByText('7/7')).toBeInTheDocument()
  })
})
