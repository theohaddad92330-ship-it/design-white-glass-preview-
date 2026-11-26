import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_BRAND_NAME, DEFAULT_COPILOT_NAME, resolveBrand, type OnboardingStateResponse } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { applyBrandToI18n } from '@/i18n'
import { BrandContext } from '@/features/brand/brand-context'
import { OnboardingWizard } from './OnboardingWizard'

/**
 * #2021.5 — « boutons Retour / Continuer toujours au même endroit ».
 *
 * Ce que le rapport a vu, et que le code confirmait : « Continuer » n'était pas
 * DÉSACTIVÉ quand la réponse manquait, il était ABSENT — et un second bouton,
 * lui désactivé, apparaissait en BAS de la colonne. Répondre à la question
 * faisait donc disparaître un bouton du bas de l'écran pour en faire apparaître
 * un autre en haut : la cible bouge au moment exact où l'utilisateur la
 * cherche. « Retour », lui, vivait dans la colonne de gauche, au-dessus du
 * stepper — donc à un troisième endroit, et sous le pli sur mobile.
 *
 * La règle tenue ici : UNE barre d'actions, les deux boutons dedans, toujours
 * rendus, actif/inactif plutôt que présent/absent.
 */

const { mockState, mockNav, skipMock, navigateMock } = vi.hoisted(() => ({
  mockState: vi.fn(),
  mockNav: vi.fn(),
  skipMock: vi.fn(),
  navigateMock: vi.fn(),
}))

vi.mock('@/features/onboarding/hooks/useOnboarding', () => ({
  useOnboardingState: () => mockState(),
  useSkipOnboarding: () => ({ mutateAsync: skipMock, isPending: false }),
}))

vi.mock('@/features/onboarding/hooks/useOnboardingNavigation', () => ({
  useOnboardingNavigation: () => mockNav(),
}))

vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigateMock,
}))

function state(answers: Record<string, string | string[]>): OnboardingStateResponse {
  return {
    id: '0a3c1861-840d-4606-8324-5fbea19bafff',
    status: 'in_progress',
    current_stage_code: 'company_info',
    stages: [],
    answers,
    inherited_answer_keys: [],
  } as unknown as OnboardingStateResponse
}

beforeEach(() => {
  useOnboardingStore.getState().reset()
  mockNav.mockReset()
  mockNav.mockReturnValue({ pending: false, onContinue: vi.fn(), onBack: vi.fn() })
  mockState.mockReset()
  skipMock.mockReset()
  skipMock.mockResolvedValue(undefined)
  navigateMock.mockReset()
})

/** Sub-step 1 (`equipe-commerciale`) : pas le premier écran, donc « Retour » existe. */
async function renderWizard(answers: Record<string, string | string[]> = {}): Promise<void> {
  mockState.mockReturnValue({ data: state(answers), isLoading: false })
  renderWithRouter(
    <>
      <OnboardingWizard stageCode="company_info" slug="equipe-commerciale" />
      <div data-testid="sentinel" />
    </>,
  )
  // Le harnais de router monte de façon ASYNCHRONE — sans cette attente, le
  // corps du document est encore vide.
  await screen.findByTestId('sentinel')
}

describe('#2084.15 — état « réseau coupé »', () => {
  let originalOnLine: boolean

  beforeEach(() => {
    originalOnLine = window.navigator.onLine
  })

  afterEach(() => {
    Object.defineProperty(window.navigator, 'onLine', { value: originalOnLine, configurable: true })
  })

  it('stays silent while the connection is up', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true })
    await renderWizard()

    expect(screen.queryByText(/Ta connexion est coupée/)).toBeNull()
  })

  it('names the outage instead of leaving the form looking merely stuck', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true })
    await renderWizard()

    expect(screen.getByText(/Ta connexion est coupée/)).toBeInTheDocument()
  })
})

describe("#2021.5 — la barre d'actions du questionnaire", () => {
  it('rend « Continuer » même quand la réponse manque, `aria-disabled` plutôt qu’absent (#2577.2)', async () => {
    // #2577.2 — un `disabled` NATIF ne reçoit aucun `click` : c'est
    // exactement pourquoi le bouton ne produisait rien en production
    // (#2577). Il reste ACTIONNABLE (`toBeEnabled`), l'état passe par
    // `aria-disabled` — voir `handleContinueClick` dans OnboardingWizard.
    await renderWizard({})
    const cta = screen.getByRole('button', { name: /Continuer/ })
    expect(cta).toBeEnabled()
    expect(cta).toHaveAttribute('aria-disabled', 'true')
  })

  it('rend « Continuer » actif dès que la réponse est valide, sans `aria-disabled` (témoin du cas voisin)', async () => {
    await renderWizard({ sales_team_size: '2-3 personnes' })
    const cta = screen.getByRole('button', { name: /Continuer/ })
    expect(cta).toBeEnabled()
    expect(cta).not.toHaveAttribute('aria-disabled')
  })

  it("n'a qu'UN seul bouton Continuer à l'écran, dans les deux états", async () => {
    await renderWizard({})
    expect(screen.getAllByRole('button', { name: /Continuer/ })).toHaveLength(1)
  })

  it('tient Retour et Continuer dans la MÊME barre, quel que soit l’état', async () => {
    await renderWizard({})
    const bar = screen.getByTestId('onboarding-actions')
    expect(bar).toContainElement(screen.getByRole('button', { name: /Retour/ }))
    expect(bar).toContainElement(screen.getByRole('button', { name: /Continuer/ }))
  })

  /**
   * #2021 — recette écran du 26/09 à 900px (prod `058db2c5`) : la rangée de
   * boutons (`Quitter`/`Retour`/`Continuer`) chevauchait la carte « Laura
   * t'accompagne » de 158,8px, `[data-testid=onboarding-actions] >
   * div.flex.items-center.gap-2` étant en `flex-wrap: nowrap`. Passer cette
   * rangée en `wrap` supprime le chevauchement (constaté en recette) : elle
   * peut désormais passer à la ligne plutôt que déborder de sa colonne de
   * grille entre 768 et 1024px.
   */
  it("laisse la rangée Quitter/Retour/Continuer passer à la ligne plutôt que chevaucher la colonne d'aide", async () => {
    await renderWizard({})
    const cta = screen.getByRole('button', { name: /Continuer/ })
    const buttonRow = cta.parentElement
    expect(buttonRow).toHaveClass('flex-wrap')
  })
})

/**
 * R15N-10 → Théo O onboarding-couverture (22/10/2026) — la V23 RETIRE le plafond de sélection : « Continuer » se
 * désactivait par dépassement sur `offer_expertise/domaines` (`expertise_areas`, plafond 5). Plus de plafond, donc plus
 * de dépassement : sept domaines cochés, « Continuer » reste actionnable et rien n'est tronqué.
 */
describe('V23 — plus de plafond de sélection : « Continuer » ne se désactive plus par dépassement', () => {
  it('reste actionnable avec sept domaines cochés', async () => {
    mockState.mockReturnValue({
      data: state({
        expertise_areas: [
          'Cloud & Infrastructure (AWS, Azure, GCP, Hosting)',
          'Data & Intelligence Artificielle',
          'Cybersécurité & Conformité',
          'DevOps, SRE & Automatisation',
          'Développement applicatif (Web, Mobile, API)',
          'Réseau & Télécom',
          'Testing & Assurance qualité',
        ],
      }),
      isLoading: false,
    })
    renderWithRouter(
      <>
        <OnboardingWizard stageCode="offer_expertise" slug="domaines" />
        <div data-testid="sentinel" />
      </>,
    )
    await screen.findByTestId('sentinel')
    // #2087.19 — `domaines` ouvre l'étape « Ton offre » : sa transition passe d'un clic.
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))

    const cta = screen.getByRole('button', { name: /Continuer/ })
    expect(cta).toBeEnabled()
    expect(cta).not.toHaveAttribute('aria-disabled', 'true')
    expect(cta.getAttribute('aria-describedby')).not.toBe('expertise_areas-selected-count')
  })
})

describe('#2026.2 — l’horodatage de l’autosauvegarde visible', () => {
  it("affiche l'heure d'enregistrement dès qu'une réponse a été saisie", async () => {
    useOnboardingStore.getState().setAnswer('sales_team_size', '2-3 personnes')
    await renderWizard({ sales_team_size: '2-3 personnes' })
    expect(screen.getByTestId('onboarding-saved-at')).toBeInTheDocument()
  })

  it("n'affiche rien tant qu'aucune réponse n'a été saisie dans cette session — pas d'heure inventée", async () => {
    await renderWizard({})
    expect(screen.queryByTestId('onboarding-saved-at')).not.toBeInTheDocument()
  })
})

describe('#2026.3 — Quitter, à côté de Retour et Continuer', () => {
  it('rend un bouton « Quitter » dans la même barre d’actions', async () => {
    await renderWizard({})
    const bar = screen.getByTestId('onboarding-actions')
    const quit = screen.getByRole('button', { name: /Quitter/ })
    expect(bar).toContainElement(quit)
  })
})

/**
 * #2579.2 — Ludovic Marx paie depuis un mois sans avoir jamais atteint le
 * produit : « Reprendre plus tard » (#2579.1, la carte d'accueil) appelle
 * `skip.mutateAsync()` avant de renvoyer vers /dashboard — ce bouton-ci, le
 * « Quitter » de la barre du questionnaire, ne l'a JAMAIS fait : un
 * `<Link to="/briefing">` nu. Sur un compte `refresh_required` avec
 * `skipped_at: null`, `needsOnboarding` (`onboarding-gate.ts`) renvoie
 * aussitôt vers /onboarding — la boucle mesurée le 18/09 au soir sur le
 * compte de Louis lui-même.
 *
 * Le test qui sait dire NON : sans l'appel à `skip`, `navigate` serait déjà
 * survenu avant même que la promesse ne soit posée — c'est très exactement
 * ce que faisait l'ancien `<Link>` nu, il n'attendait rien.
 */
describe('#2579.2 — « Quitter » rend la main, comme « Plus tard »', () => {
  it('appelle le MÊME geste que « Plus tard » (skip.mutateAsync), pas un second', async () => {
    await renderWizard({})
    fireEvent.click(screen.getByRole('button', { name: /Quitter/ }))

    await Promise.resolve()
    expect(skipMock).toHaveBeenCalledTimes(1)
  })

  it('ne rend la main (navigate vers /dashboard) qu’APRÈS que le report est enregistré — jamais avant', async () => {
    let resolveSkip: (() => void) | undefined
    skipMock.mockReturnValueOnce(
      new Promise<undefined>(resolve => {
        resolveSkip = () => resolve(undefined)
      }),
    )
    await renderWizard({})
    fireEvent.click(screen.getByRole('button', { name: /Quitter/ }))

    // La mutation est en vol : naviguer maintenant recréerait la boucle,
    // exactement le défaut mesuré (`skipped_at` encore `null` en cache au
    // moment où /dashboard relit l'état).
    await Promise.resolve()
    expect(navigateMock).not.toHaveBeenCalled()

    resolveSkip?.()
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: '/briefing' }))
  })

  it('rend quand même la main si le report échoue — un report qui rate ne doit jamais enfermer', async () => {
    skipMock.mockRejectedValueOnce(new Error('network'))
    await renderWizard({})
    fireEvent.click(screen.getByRole('button', { name: /Quitter/ }))

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: '/briefing' }))
  })
})

describe('#2021.1 — la largeur de lecture de la colonne de questions', () => {
  /**
   * ⚠️ jsdom ne met RIEN en page : ce test prouve que la borne est POSÉE, pas
   * qu'elle mesure 70 caractères. La mesure se fait dans le navigateur, et le
   * défaut mesuré en lecture de code est entre 768 px et 1 024 px, là où la
   * grille repasse à une colonne et où la colonne de questions occupait toute
   * la largeur de `max-w-6xl` (~1 100 px, soit ~138 caractères).
   */
  it('borne la colonne de questions au lieu de la laisser occuper la page', async () => {
    await renderWizard({})
    expect(screen.getByRole('main').className).toMatch(/(?<![a-z:])max-w-/)
  })
})

describe('#2021.19 — desktop, tablette et mobile gardent la même logique (GA-28)', () => {
  /**
   * #2021.19 — contradiction mesurée le 15/09 : le wizard ne portait qu'une
   * seule borne `lg` (1 024 px, grille + stepper + carte d'aide), quand la
   * règle du dépôt en pose une seule, à 768 px (GA-28, CLAUDE.md « le mobile
   * est le produit, pas un repli »). Entre 768 et 1 024 px, desktop et
   * tablette n'observaient donc pas la même logique de rupture — tranché par
   * Claude sur la doctrine déjà écrite (Louis 15/09 : « prends-les tous, ne
   * me redemande rien »).
   */
  it("n'utilise plus la borne `lg` (1 024 px) nulle part dans l'arbre du wizard", async () => {
    await renderWizard({})
    const classes = [...document.body.querySelectorAll('*')].map(el => el.getAttribute('class') ?? '')
    expect(classes.filter(cls => /(?<![a-z:])lg:/.test(cls))).toEqual([])
  })

  it('bascule la grille sur la borne `md` (768 px) à la place', async () => {
    await renderWizard({})
    const classes = [...document.body.querySelectorAll('*')].map(el => el.getAttribute('class') ?? '')
    expect(classes.some(cls => cls.includes('md:grid-cols-[220px_1fr_300px]'))).toBe(true)
  })
})

/**
 * #2021.14 — « pas de grands espaces vides », le cas fenêtre courte.
 *
 * Mesuré en prod le 27/09 sur `equipe-commerciale` (861 px de fenêtre) : la
 * colonne centrale finissait à 588 px (32 % vide DESSOUS), l'aside à 516 px
 * (40 %), la nav à 522 px (39 %) — une sous-étape à une seule question est
 * bien plus courte que la fenêtre, et le wizard la laissait collée en HAUT,
 * plutôt que centrée dans l'espace disponible (même geste que
 * `OnboardingStageTransition.tsx`, qui centre déjà son propre écran court
 * avec `min-h-[60dvh] flex-col justify-center`). `min-h-full` (un
 * pourcentage du parent `flex-1`, jamais `vh`, GA-29) laisse le contenu
 * DÉBORDER normalement dès qu'il dépasse la fenêtre — rien n'est coupé en
 * haut, seul le cas court se centre.
 */
describe('#2021.14 — la sous-étape courte se centre verticalement, pas collée en haut', () => {
  it('le conteneur qui porte le fondu centre son contenu sur la hauteur disponible', async () => {
    await renderWizard({})
    const wrapper = screen.getByTestId('onboarding-substep-transition')
    expect(wrapper.className).toContain('min-h-full')
    expect(wrapper.className).toContain('justify-center')
  })

  it('jamais `vh` — seul `dvh` ou un pourcentage sont autorisés (GA-29)', async () => {
    await renderWizard({})
    const wrapper = screen.getByTestId('onboarding-substep-transition')
    expect(wrapper.className).not.toMatch(/(?<!d)vh(?![a-z])/)
  })
})

describe('#2021.10 — animations courtes, MOTION.* seulement (GA-25)', () => {
  /**
   * #2021.10 — mesuré 15/09 : `backdrop-blur` seul, `packages/ui/src/motion.ts`
   * pas importé — la sous-étape changeait d'un bloc, sans transition. Le
   * même vocabulaire que `BrowsableDialog.tsx` (`MOTION.reveal`, un fondu
   * simple, sans glissement ni rebond) : le contenu change, il n'arrive pas
   * d'ailleurs. Le cliquet GA-25 (`motion-grammar.test.ts`) interdit d'écrire
   * une durée ou une courbe à la main à la place.
   */
  it("enveloppe le contenu de la sous-étape d'un fondu `MOTION.reveal`", async () => {
    await renderWizard({})
    const wrapper = screen.getByTestId('onboarding-substep-transition')
    // framer-motion applique l'état `initial` en style inline dès le montage.
    expect(wrapper.style.opacity).not.toBe('')
  })
})

/**
 * #2577.1 — « Continuer » dit ce qui manque au lieu de rester MUET.
 *
 * Mesuré en production : `disabled: true` sur le bouton, `[role="alert"],
 * [aria-live]` → 0 élément, clic → rien. `equipe-commerciale` (le fixture par
 * défaut de `renderWizard`) ne porte qu'UNE question (`sales_team_size`),
 * donc « il reste 1 question ».
 */
describe('#2577.1 — « Continuer » dit ce qui manque, au clic', () => {
  it("n'affiche rien avant le premier clic (le silence AVANT le geste n'est pas le défaut)", async () => {
    await renderWizard({})
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('annonce, dans une région `role="status"`, combien de questions il reste — corpus non vide', async () => {
    await renderWizard({})
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }))

    const status = await screen.findByRole('status')
    // #2577.1 — « prouve qu'il LIT quelque chose » : le corpus annoncé n'est
    // jamais vide, et porte le compte réel de questions manquantes.
    expect(status.textContent).not.toBe('')
    expect(status).toHaveTextContent('Il reste 1 question à répondre avant de continuer')
  })

  it('amène le focus sur la première question sans réponse (defile + tabIndex -1)', async () => {
    await renderWizard({})
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }))

    await screen.findByRole('status')
    const target = document.getElementById('onboarding-question-sales_team_size')
    expect(target).not.toBeNull()
    expect(document.activeElement).toBe(target)
  })

  it('témoin du cas voisin — une réponse déjà VALIDE ne montre jamais ce message, même après un clic', async () => {
    await renderWizard({ sales_team_size: '2-3 personnes' })
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }))

    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByTestId('onboarding-continue-feedback')).toBeNull()
  })
})

describe('#2021.11 — résumé de la réponse précédente', () => {
  it('affiche la réponse répondue à la sous-étape précédente (entreprise)', async () => {
    await renderWizard({ esn_name: 'Kicklox' })
    expect(screen.getByText(/Ta réponse précédente/)).toHaveTextContent(
      'Comment s’appelle ton entreprise ou ton activité ?',
    )
    expect(screen.getByText(/Ta réponse précédente/)).toHaveTextContent('Kicklox')
  })

  it('rien avant la toute première sous-étape : aucune ligne, jamais un placeholder', async () => {
    mockState.mockReturnValue({ data: state({}), isLoading: false })
    renderWithRouter(
      <>
        <OnboardingWizard stageCode="company_info" slug="entreprise" />
        <div data-testid="sentinel" />
      </>,
    )
    await screen.findByTestId('sentinel')
    expect(screen.queryByText(/Ta réponse précédente/)).toBeNull()
  })
})

/**
 * #2021.14 — « pas de grands espaces vides », le cas marque blanche.
 *
 * Mesuré au code : `OnboardingHelpCard` rend une `<aside>` totalement vide
 * dès qu'un espace est en marque blanche (`isCustom`, la carte de support
 * Bellum est retirée par #1960.20) ET que `OnboardingLauraGuide` n'a rien à
 * dire pour cette sous-étape (#2020.12/.13 : la plupart des écrans). C'est
 * DÉJÀ le comportement testé et voulu du composant (`OnboardingHelpCard.test.tsx`,
 * « la carte … n'est pas rendue »). Le défaut n'est donc pas dans le
 * composant : c'est le WIZARD qui réserve quand même 300px de grille pour
 * cette colonne, vide ou pas — le « grand espace vide » signalé.
 */
describe('#2021.14 — pas de grands espaces vides (marque blanche)', () => {
  const RESUME_FLAG_KEY = 'bellum:onboarding-guide-resumed'

  afterEach(() => {
    sessionStorage.clear()
    window.history.pushState({}, '', '/')
    applyBrandToI18n({ name: DEFAULT_BRAND_NAME, copilotName: DEFAULT_COPILOT_NAME })
  })

  async function renderCustomBrandWizard(): Promise<void> {
    mockState.mockReturnValue({ data: state({}), isLoading: false })
    renderWithRouter(
      <>
        <BrandContext.Provider value={resolveBrand({ copilotName: 'Alice' })}>
          <OnboardingWizard stageCode="company_info" slug="equipe-commerciale" />
        </BrandContext.Provider>
        <div data-testid="sentinel" />
      </>,
    )
    await screen.findByTestId('sentinel')
  }

  it('rien à dire : aucune `<aside>` ni colonne de 300px réservée', async () => {
    sessionStorage.setItem(RESUME_FLAG_KEY, '1') // reprise déjà consommée cet onglet
    window.history.pushState({}, '', '/onboarding/acme/company_info/equipe-commerciale')
    await renderCustomBrandWizard()

    expect(document.querySelector('aside')).toBeNull()
    const classes = [...document.body.querySelectorAll('*')].map(el => el.getAttribute('class') ?? '')
    expect(classes.some(cls => cls.includes('300px'))).toBe(false)
  })

  it('le guide du copilote, quand il a quelque chose à dire, rejoint la colonne des questions plutôt qu’une aside vide', async () => {
    window.history.pushState({}, '', '/onboarding/acme/company_info/equipe-commerciale')
    applyBrandToI18n({ name: 'Alice ESN', copilotName: 'Alice' })
    await renderCustomBrandWizard()

    expect(screen.getByRole('main')).toHaveTextContent(/Alice a gardé tes réponses précédentes/)
    expect(document.querySelector('aside')).toBeNull()
  })

  it('témoin — une marque du produit garde la colonne latérale de 300px', async () => {
    await renderWizard({})
    expect(document.querySelector('aside')).not.toBeNull()
  })
})
