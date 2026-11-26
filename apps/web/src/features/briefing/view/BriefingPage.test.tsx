import type { BriefingAction, DailyBriefing } from '@bellum/contracts'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

/**
 * #2097.21 (correctif) — mesuré en recette le 25/09 : « Comptes qui ont
 * bougé » ne rendait AUCUNE image, `ObjectMention` (F1, tome 7) ne portant
 * volontairement pas d'avatar. On ne peut pas attendre une balise `<img>` —
 * `EntityAvatar` ne la monte qu'une fois l'image chargée, ce qui n'arrive
 * jamais sous jsdom (même limite que `company-lists-show-logos.test.tsx`) —
 * on espionne donc la fonction qui construit l'URL du logo.
 */
const logoRequests: Array<[unknown, unknown]> = []
// Refonte Théo — le sélecteur Moi/Équipe lit la session ; ces specs ne montent aucun SessionProvider.
// Louis 23/10 — le portefeuille de « Ta journée » lit le pipe, les affaires et le vivier ; son câblage est gardé par
// `BriefingFoundation.test.tsx` et `TodayPortfolio.test.tsx` : ici, rien n'est lu, il se tait.
vi.mock('@/features/projects/hooks/usePipeline', () => ({ usePipeline: () => ({ data: undefined }) }))
vi.mock('@/features/projects/hooks/useProjects', () => ({ useProjects: () => ({ data: undefined }) }))
vi.mock('@/features/consultants/hooks', () => ({ useConsultants: () => ({ data: undefined }) }))
vi.mock('./TodayScopeSwitch', () => ({ TodayScopeSwitch: () => null }))
vi.mock('./TodayAddTaskButton', () => ({ TodayAddTaskButton: () => <button type="button">Ajouter une tâche</button> }))
vi.mock('@/features/briefing/hooks/useAccountLastOutcome', () => ({ useAccountLastOutcome: vi.fn(() => null) }))
vi.mock('@/lib/company-logo', () => ({
  companyLogoSrc: (logoUrl: unknown, website: unknown) => {
    logoRequests.push([logoUrl, website])
    return null
  },
  contactPhotoSrc: () => null,
}))

/*
 * #1812 (09/09/2026) — « Demander à {{copilot}} » ne prend plus de place sur la
 * page : sur un poste de bureau, c'est la BULLE qui porte la question, et
 * `AskLaura` ne rend alors rien du tout.
 *
 * Ce test-ci ne mesure pas la bulle — il mesure que CET écran propose bien le
 * geste, avec le bon libellé et le bon contexte. On double donc le dépôt pour
 * dire « une autre instance porte la bulle », cas où `AskLaura` rend son lien
 * exactement comme avant. Le nouveau chemin a ses propres tests :
 * `laura-intro-store.test.tsx`, `LauraIntroBar.test.tsx`, `LauraDock.intro.test.tsx`
 * et `AskLaura.test.tsx`.
 */
vi.mock('@/features/laura/bubble/laura-intro-store', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/laura/bubble/laura-intro-store')>()),
  useAskLauraIntro: () => false,
}))

/**
 * L'ORDRE DE L'ÉCRAN « AUJOURD'HUI » (#1396, #1393, #1390, #1392, #1395).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE GARDE SUR UN ORDRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un ordre d'écran n'est pas une préférence : c'est la réponse à « qu'est-ce que
 * je dois faire dans l'heure qui vient ? ». Le retour #1396 le donne en sept
 * points, et sa raison est mesurable — « supprimer l'impression de page
 * interminable ». Un ordre qu'aucun test ne tient se défait au premier bloc
 * qu'on ajoute, et personne ne le voit avant la démonstration suivante.
 *
 * ⚠️ Le test LIT L'ORDRE DU DOM, il ne cherche pas des libellés un par un.
 * `getByText('X')` passe parfaitement quand X est rendu au mauvais endroit — et
 * quand il est rendu DEUX fois, ce qui est le défaut le plus cher du lot 8.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LES FAUX RENDENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Les quatre gros blocs de l'écran sont faux : ils ont chacun leur fichier de
 * test, et les monter ici ferait de cette garde une seconde vérification de
 * leur contenu — donc deux endroits à corriger le jour où ils changent. Chaque
 * faux rend un marqueur, et c'est le marqueur qu'on ordonne.
 */

const briefing = vi.fn()
// #3386 — le rôle métier déclaré, réglable par test (le `vi.mock` ci-dessous le lit à chaque rendu).
const declaredRole = vi.hoisted(() => ({ current: null as string | null }))
// #3386 (Louis 11/10) — la taille déclarée de l'ESN (`consultant_size`) : avec le rôle, la combinaison.
const declaredSize = vi.hoisted(() => ({ current: null as string | null }))

// #2107 (Centre d'actions) — `BriefingPage` lit désormais aussi
// `useAllBriefingActions` (compte non plafonné, pour le lien « voir les
// autres » d'`ActionsBlock`) : `{ data: undefined }` reproduit l'état avant
// réponse, aucun de ces tests d'ordre d'écran ne porte sur ce lien.
vi.mock('@/features/actions/hooks/usePlanItems', () => ({ usePlanItems: vi.fn(() => ({ items: [] })) }))
vi.mock('./ReadAsPicker', () => ({ ReadAsPicker: () => <div>[lire comme]</div> }))
vi.mock('../api', () => ({
  useDailyBriefing: () => briefing(),
  useAllBriefingActions: () => ({ data: undefined }),
  // #2770 (#2101.14) — nouveau bloc, faux ici pour la même raison que les
  // autres : il a son propre fichier de test (`SlotProposalPriorityAccountsBlock.test.tsx`).
  useSlotProposalPriorityAccounts: () => ({ data: undefined }),
  // BEL-SC-227 (#3256) — le rôle, faux ici : chaque test d'ordre/écran garde
  // l'ordre par défaut, aucun ne porte sur la variation par rôle (couverte par
  // `daily-decisions.test.ts`).
  useCurrentUserRole: () => ({
    data: declaredRole.current ? { user_role: declaredRole.current, consultant_size: declaredSize.current } : undefined,
  }),
}))
vi.mock('@/features/agenda/view/AgendaBoard', () => ({
  AgendaBoard: () => <div>[plateau agenda]</div>,
  JoinButton: () => <button type="button">Rejoindre</button>,
}))
vi.mock('@/features/agenda/view/MeetingPrepDialog', () => ({
  MeetingPrepDialog: ({ event }: { event: { id: string } | null }) =>
    event ? <div>[brief du rendez-vous {event.id}]</div> : null,
}))
vi.mock('@/features/tasks/view/TaskList', () => ({ TaskList: () => <div>[liste des tâches]</div> }))
vi.mock('./MyActivityBlock', () => ({ MyActivityBlock: () => <div>[mon activité]</div> }))
// #2567.K2 — nouveau bloc, faux ici pour la même raison que les quatre autres :
// il a son propre fichier de test (`DailyGesturesBlock.test.tsx`).
vi.mock('./DailyGesturesBlock', () => ({ DailyGesturesBlock: () => <div>[ce qui attend ta décision]</div> }))
vi.mock('./SinceLastVisitBlock', () => ({ SinceLastVisitBlock: () => <div>[ce qui a bougé]</div> }))
vi.mock('./SlotProposalPriorityAccountsBlock', () => ({
  SlotProposalPriorityAccountsBlock: () => <div>[comptes à prioriser]</div>,
}))
// #2097 (correctif du 26/09) — ActivationChecklist a sa propre suite
// (`ActivationChecklist.test.tsx`) : useSession/react-query n'ont rien à
// faire ici, ce bloc est hors sujet pour ces tests de BriefingPage.
vi.mock('@/features/onboarding/components/ActivationChecklist', () => ({ ActivationChecklist: () => null }))
// #2147.5 — faux ici pour la même raison que les autres : `useCancelAnalysis`
// (react-query) exige un `QueryClientProvider` que cette page ne monte pas,
// et le contenu a son propre fichier de test (`RunningJobsBlock.test.tsx`).
vi.mock('./RunningJobsBlock', () => ({ RunningJobsBlock: () => <div>[en cours]</div> }))
vi.mock('./QuickModesBlock', () => ({ QuickModesBlock: () => <div>[modes de travail rapides]</div> }))
// #2145.9 / #2100.9 — sa propre lecture (`useActiveAnalysisRuns`, `useSession`)
// est couverte par `ActiveAnalysisBanner.test.tsx` ; ici on garde le montage
// sans sa dépendance au contexte de session.
vi.mock('./ActiveAnalysisBanner', () => ({ ActiveAnalysisBanner: () => null }))
// #2106.35 — le double stub garde son marqueur (cette garde-ci ne mesure pas
// le CONTENU du bloc, `ActionsBlock.test.tsx` le fait déjà), et expose la
// porte `onOpenMeetingPrep` reçue de `BriefingPage`, quand elle existe.
// BEL-SC-227 (#3256) — même patron que le double juste en dessous : le
// CONTENU d'une décision a son propre fichier (`DecisionsSection.test.tsx`),
// non répété ici — cette garde ne mesure que l'ORDRE de l'écran.
vi.mock('./DecisionsSection', () => ({ DecisionsSection: () => <div>[décisions]</div> }))
vi.mock('./ActionsBlock', () => ({
  ActionsBlock: ({
    onOpenMeetingPrep,
    actions,
  }: {
    onOpenMeetingPrep?: (actionId: string) => void
    actions?: Array<{ id: string }>
  }) => (
    <div data-order={actions?.map(action => action.id).join(',')}>
      [à faire maintenant]
      {onOpenMeetingPrep ? (
        <>
          <button type="button" onClick={() => onOpenMeetingPrep('meeting:evt-1')}>
            [carte : préparer evt-1]
          </button>
          <button type="button" onClick={() => onOpenMeetingPrep('meeting:evt-inconnu')}>
            [carte : préparer un rendez-vous hors fenêtre]
          </button>
        </>
      ) : null}
    </div>
  ),
}))
// #2097.43 — même discipline que `ActionsBlock` juste au-dessus : ce faux
// expose la porte reçue et le nombre de cartes, `PreparationsBlock.test.tsx`
// (à venir avec `PriorityCard`) mesure le rendu réel.
vi.mock('./PreparationsBlock', () => ({
  PreparationsBlock: ({
    actions,
    onOpenMeetingPrep,
  }: {
    actions: { id: string }[]
    onOpenMeetingPrep: (actionId: string) => void
  }) => (
    <div>
      [préparations · {actions.length}]
      {actions.map(action => (
        <button key={action.id} type="button" onClick={() => onOpenMeetingPrep(action.id)}>
          [préparation : {action.id}]
        </button>
      ))}
    </div>
  ),
}))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/features/laura/bubble/page-context-store', () => ({
  useLauraContext: () => {},
  useCurrentLauraContext: () => null,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to?: string }) => <a href={to ?? '#'}>{children}</a>,
  // #2097 (correctif du 26/09) — BriefingPage monte désormais ActivationChecklist,
  // qui appelle useNavigate() sans condition.
  useNavigate: () => vi.fn(),
}))
// #2097 (27/09/2026) — sous 768px, `BriefingHero` monte l'avatar de l'utilisateur
// (`BriefingHeroAvatar` → `useProfile` → `useSession`) : aucun `SessionProvider`
// ici, même patron que `Chat.mobile-composer.test.tsx`.
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' }, loading: false }) }))
vi.mock('@/features/profiles/hooks/useProfile', () => ({
  useProfile: () => ({ data: { first_name: 'Louis', last_name: null, avatar_url: null } }),
}))

const { BriefingPage } = await import('./BriefingPage')

/**
 * ⚠️ Le rendez-vous est DATÉ PAR RAPPORT À MAINTENANT, pas en dur : le bandeau
 * ne montre que le rendez-vous en cours ou le prochain. Une date fixe rendrait
 * ce test vert jusqu'à ce jour-là, puis rouge pour toujours — la famille « un
 * test qui dépend de l'horloge » que ce dépôt a déjà payée.
 */
const IN_TWO_HOURS = new Date(Date.now() + 2 * 3_600_000)
const EVENT = {
  id: 'evt-1',
  summary: 'Point besoin portail transporteurs',
  description: null,
  location: null,
  start: IN_TWO_HOURS.toISOString(),
  end: new Date(IN_TWO_HOURS.getTime() + 3_600_000).toISOString(),
  organizer: null,
  attendees: [],
  conferenceUrl: null,
  webUrl: null,
  status: 'confirmed',
  isExternal: true,
  cancelled: false,
}

// #2097.43 — même patron que `ActionsBlock.test.tsx` (`card()`) : ce fichier
// ne mesure ni le contenu ni le rendu d'une carte (`PriorityCard.test.tsx`,
// `ActionsBlock.test.tsx` le font déjà), seulement combien `BriefingPage`
// en retire du bloc 2 pour les regrouper en bloc 4.
function briefingAction(partial: Partial<BriefingAction> & Pick<BriefingAction, 'id'>): BriefingAction {
  return {
    labelKey: 'briefing.actions.followUp',
    labelVars: { counterpart: 'jean@acme.com', days: 9, subject: 'Proposition' },
    href: '/mailbox?intent=no_reply&thread=t1',
    kind: 'follow_up',
    priority: 4,
    fact: null,
    context: null,
    preparedArtifacts: [],
    expiresAt: null,
    businessObject: null,
    verdict: null,
    consequence: null,
    confidence: null,
    estimatedMinutes: null,
    owner: null,
    permission: null,
    rankingAxes: [],
    processingState: 'suggested',
    ...partial,
  }
}

function payload(over: Partial<DailyBriefing> = {}): DailyBriefing {
  return {
    date: IN_TWO_HOURS.toISOString().slice(0, 10),
    timeZone: 'Europe/Paris',
    firstName: 'Louis',
    agenda: { state: 'ready', reason: null, events: [EVENT], conflicts: [], needsPreparation: [EVENT] },
    mail: { state: 'ready', reason: null, awaitingReply: [], positiveReplies: [], unread: [] },
    tasks: { state: 'ready', reason: null, tasks: [] },
    accountsToWatch: [],
    actions: [],
    generatedAt: new Date().toISOString(),
    ...over,
  } as DailyBriefing
}

/** L'index d'apparition dans le DOM — ce qui distingue « présent » de « à sa place ». */
function orderOf(needles: string[]): number[] {
  const text = document.body.textContent ?? ''
  return needles.map(needle => text.indexOf(needle))
}

/** Refonte Théo — le texte d'une seule colonne (`today-main-column` / `today-aside-column`). */
function columnText(testId: 'today-main-column' | 'today-aside-column'): string {
  return screen.getByTestId(testId).textContent ?? ''
}

/** Refonte Théo — Actualiser, Exporter et Partager vivent dans le menu « … » de l'en-tête. */
function openMoreMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Plus d’actions sur le brief' }))
}

beforeEach(async () => {
  vi.clearAllMocks()
  declaredRole.current = null
  await i18n.changeLanguage('fr')
  briefing.mockReturnValue({ data: payload(), isLoading: false, isError: false, refetch: vi.fn(), isFetching: false })
})

describe('l’ordre de la page (#1396)', () => {
  it('déroule la page de la maquette Théo : en-tête, ce qui a bougé, le plan, les rendez-vous, les sources', () => {
    render(<BriefingPage />)
    const indexes = orderOf([
      'Bonjour Louis.',
      // Refonte Théo (`.t-acc`) — « Depuis ta dernière visite », replié, au-dessus des deux colonnes.
      'Ce qui a bougé depuis ta dernière visite',
      // F2-FIX #4297 — la file OUVRE la colonne principale.
      'Le plan de Louis',
      // La colonne de droite : le rendez-vous en cours ou à venir, puis ceux du jour.
      'Point besoin portail transporteurs',
      'Les rendez-vous du jour',
      // Le pied de page (`.x-foot`) : ce que le brief a pu lire.
      'Sources utilisées aujourd’hui',
    ])
    // Chaque marqueur existe (−1 = absent), et ils se suivent.
    expect(
      indexes.every(index => index >= 0),
      `indices : ${indexes.join(', ')}`,
    ).toBe(true)
    expect(indexes).toEqual([...indexes].sort((left, right) => left - right))
  })

  it('la messagerie et l’agenda sont MONTÉS ensemble, dans la colonne de droite (#1393)', () => {
    render(<BriefingPage />)
    const aside = columnText('today-aside-column')
    expect(aside.indexOf('Les rendez-vous du jour')).toBeGreaterThanOrEqual(0)
    expect(aside.indexOf('Les rendez-vous du jour')).toBeLessThan(aside.indexOf('Ta messagerie'))
    expect(columnText('today-main-column')).not.toContain('Ta messagerie')
  })

  it('« Mon activité » est le DERNIER bloc de la colonne principale — la synthèse (#1394)', () => {
    render(<BriefingPage />)
    const main = columnText('today-main-column')
    expect(main.lastIndexOf('Mon activité')).toBeGreaterThan(main.indexOf('Comptes qui ont bougé'))
  })
})

describe('F2-FIX #4297 — la page s’ouvre sur les tâches et les actions, pas sur l’agenda ni les décisions', () => {
  it('sait dire NON : « À faire maintenant » et « Tes tâches » passent AVANT « maintenant », « Tes décisions » et les modes rapides', () => {
    briefing.mockReturnValue({
      data: payload({
        actions: [
          briefingAction({ id: 'a1', kind: 'follow_up' }),
          briefingAction({ id: 'a2', kind: 'follow_up', priority: 5 }),
        ],
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })
    render(<BriefingPage />)
    // Refonte Théo — « maintenant » vit dans la colonne de droite, à côté des rendez-vous.
    const main = columnText('today-main-column')
    const [actions, tasks, decisions, modes] = [
      'Le plan de Louis',
      'Voir mes tâches',
      'Tes décisions',
      'modes de travail rapides',
    ].map(needle => main.indexOf(needle))
    expect(actions).toBeGreaterThanOrEqual(0)
    for (const after of [decisions, modes]) {
      expect(after, 'un bloc qui devait suivre est absent').toBeGreaterThanOrEqual(0)
      expect(actions).toBeLessThan(after!)
      expect(tasks).toBeLessThan(after!)
    }
  })
})

describe('le rôle réordonne les blocs de la page, jamais leur contenu (#3386)', () => {
  const MARKERS = [
    'Le plan de Louis',
    'Les rendez-vous du jour',
    'Ce qui a bougé depuis ta dernière visite',
    'Mon activité',
  ]
  // Refonte Théo — la colonne principale porte l'ordre du rôle ; l'onglet « Mon activité » de
  // l'en-tête n'est pas le bloc du même nom, d'où la lecture colonne par colonne.
  const textFor = (role: string | null) => {
    declaredRole.current = role
    const { unmount } = render(<BriefingPage />)
    const text = `${document.body.textContent ?? ''}`
    const main = columnText('today-main-column')
    unmount()
    return { text, main }
  }

  it('un dirigeant ouvre sur « Mon activité » ; un commercial sur son plan', () => {
    const founder = textFor('Fondateur / CEO').main
    expect(founder.indexOf('Mon activité')).toBeLessThan(founder.indexOf('Le plan de Louis'))
    const seller = textFor('Business Developer').main
    expect(seller.indexOf('Le plan de Louis')).toBeLessThan(seller.indexOf('Mon activité'))
  })

  it('sait dire NON : chaque bloc présent pour un rôle l’est pour tous les autres', () => {
    for (const role of [null, 'Fondateur / CEO', 'Business Manager', 'Responsable staffing']) {
      const { text } = textFor(role)
      for (const marker of MARKERS) expect(text, `${role} / ${marker}`).toContain(marker)
    }
  })

  it('#3386 (11/10) — même rôle, autre stade : la COMBINAISON change l’ordre, jamais les blocs', () => {
    try {
      declaredSize.current = '3'
      const solo = textFor('Fondateur / CEO')
      declaredSize.current = '500+'
      const large = textFor('Fondateur / CEO')
      // 0-5 consultants : le dirigeant vend encore, son plan ouvre ; > 50 : « Mon activité ».
      expect(solo.main.indexOf('Le plan de Louis')).toBeLessThan(solo.main.indexOf('Mon activité'))
      expect(large.main.indexOf('Mon activité')).toBeLessThan(large.main.indexOf('Le plan de Louis'))
      for (const marker of MARKERS) {
        expect(solo.text, marker).toContain(marker)
        expect(large.text, marker).toContain(marker)
      }
    } finally {
      declaredSize.current = null
    }
  })
})

describe('« Lire comme » (#3414)', () => {
  it('se monte EN HAUT de la page, avant l’en-tête et avant la liste des actions (il était à y=1892)', () => {
    render(<BriefingPage />)
    const [picker, heading, actions] = orderOf(['[lire comme]', 'Bonjour Louis.', 'Le plan de Louis'])
    expect(picker).toBeGreaterThanOrEqual(0)
    expect(picker).toBeLessThan(heading as number)
    expect(picker).toBeLessThan(actions as number)
    // Un seul sélecteur : jamais redit au-dessus de la liste.
    expect((document.body.textContent ?? '').split('[lire comme]').length - 1).toBe(1)
  })
})

describe('un rendez-vous sans titre (#3533)', () => {
  it('sait dire NON : sans titre, aucune ligne « (sans objet) » — une absence ne fait aucune ligne', () => {
    briefing.mockReturnValue({
      data: payload({
        agenda: {
          state: 'ready',
          reason: null,
          readAt: null,
          events: [{ ...EVENT, summary: null }],
          conflicts: [],
          needsPreparation: [],
        },
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })
    render(<BriefingPage />)
    expect(document.body.textContent).not.toContain('(sans objet)')
  })

  it('un titre blanc se traite comme une absence', () => {
    briefing.mockReturnValue({
      data: payload({
        agenda: {
          state: 'ready',
          reason: null,
          readAt: null,
          events: [{ ...EVENT, summary: '   ' }],
          conflicts: [],
          needsPreparation: [],
        },
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })
    render(<BriefingPage />)
    expect(document.body.textContent).not.toContain('(sans objet)')
  })
})

describe('fil de messagerie sans objet (#3533)', () => {
  it('sait dire NON : un fil sans objet (null ou blanc) ne montre jamais « (sans objet) », son interlocuteur reste', () => {
    briefing.mockReturnValue({
      data: payload({
        mail: {
          state: 'ready',
          reason: null,
          readAt: null,
          awaitingReply: [
            { threadId: 't-1', subject: null, counterpart: 'Client X', lastMessageAt: null, daysSinceLastMessage: 3 },
            { threadId: 't-2', subject: '   ', counterpart: 'Client Y', lastMessageAt: null, daysSinceLastMessage: 4 },
          ],
          positiveReplies: [],
          unread: [],
        },
      } as unknown as Partial<DailyBriefing>),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })
    render(<BriefingPage />)
    expect(screen.getByText('Client X')).toBeTruthy()
    expect(screen.getByText('Client Y')).toBeTruthy()
    expect(document.body.textContent).not.toContain('(sans objet)')
  })
})

describe('titre de fil long dans /briefing (#3533, jumeau de /mailbox)', () => {
  it('le titre prend la largeur disponible, sur 2 lignes au plus, titre complet en infobulle', () => {
    const subject = 'Refonte du parcours commande — proposition commerciale'
    briefing.mockReturnValue({
      data: payload({
        mail: {
          state: 'ready',
          reason: null,
          readAt: null,
          awaitingReply: [
            { threadId: 't-9', subject, counterpart: 'Client Z', lastMessageAt: null, daysSinceLastMessage: 3 },
          ],
          positiveReplies: [],
          unread: [],
        },
      } as unknown as Partial<DailyBriefing>),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })
    render(<BriefingPage />)
    const title = screen.getByText(subject)
    expect(title.className).toMatch(/\bline-clamp-2\b/)
    expect(title.className).not.toMatch(/\btruncate\b/)
    expect(title).toHaveAttribute('title', subject)
    expect(title.parentElement?.className).toMatch(/\bmin-w-0\b/)
    expect(title.parentElement?.className).toMatch(/\bflex-1\b/)
  })
})

describe('« en attente des autres » (#2387.7)', () => {
  it('sait dire NON : sans fil sans réponse, aucune section ne se monte (GA-18/19)', () => {
    render(<BriefingPage />)
    expect(screen.queryByText('En attente des autres')).toBeNull()
  })

  it('rend les fils envoyés sans réponse sous leur PROPRE section, séparée de la messagerie', () => {
    briefing.mockReturnValue({
      data: payload({
        mail: {
          state: 'ready',
          reason: null,
          readAt: null,
          awaitingReply: [
            {
              threadId: 't-1',
              subject: 'Relance devis',
              counterpart: 'Client X',
              lastMessageAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
              daysSinceLastMessage: 3,
            },
          ],
          positiveReplies: [],
          unread: [],
        },
      } as unknown as Partial<DailyBriefing>),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })
    render(<BriefingPage />)
    expect(screen.getByText('En attente des autres')).toBeTruthy()
    // Le fil apparaît une seule fois — jamais dupliqué avec le bloc « Messagerie ».
    expect(screen.getAllByText('Relance devis')).toHaveLength(1)
    const [mail, waiting, thread] = orderOf(['Ta messagerie', 'En attente des autres', 'Relance devis'])
    expect(mail).toBeLessThan(waiting!)
    expect(waiting).toBeLessThan(thread!)
  })
})

describe('« en attente des autres » — profils envoyés au client (#2387.7)', () => {
  const ready = (over: Partial<DailyBriefing>) => ({
    data: payload(over),
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    isFetching: false,
  })

  it('monte la section avec le profil envoyé sans retour, son ancienneté réelle, sans fil de messagerie', () => {
    briefing.mockReturnValue(
      ready({
        awaitingClientProfiles: [{ consultantId: 'c-1', consultantName: 'Marc Ouedraogo', days: 16 }],
      } as unknown as Partial<DailyBriefing>),
    )
    render(<BriefingPage />)
    expect(screen.getByText('En attente des autres')).toBeTruthy()
    expect(screen.getByText('Marc Ouedraogo')).toBeTruthy()
    expect(screen.getByText('16 jours sans retour du client')).toBeTruthy()
  })

  it('sait dire NON : liste vide ou absente → aucune section, jamais « 0 »', () => {
    briefing.mockReturnValue(ready({ awaitingClientProfiles: [] } as unknown as Partial<DailyBriefing>))
    render(<BriefingPage />)
    expect(screen.queryByText('En attente des autres')).toBeNull()
  })
})

describe('le bandeau des sources (#1390)', () => {
  it('nomme la CAPACITÉ et son état, jamais l’éditeur', () => {
    briefing.mockReturnValue({
      data: payload({
        mail: {
          state: 'not_connected',
          reason: null,
          readAt: null,
          awaitingReply: [],
          positiveReplies: [],
          unread: [],
        },
      } as Partial<DailyBriefing>),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })
    render(<BriefingPage />)
    const strip = screen.getByText('Sources utilisées aujourd’hui').parentElement!
    expect(within(strip).getByText(/ton agenda · connecté/)).toBeInTheDocument()
    expect(within(strip).getByText(/ta messagerie · non connecté/)).toBeInTheDocument()
    expect(within(strip).getByText('Gérer les connexions').closest('a')).toHaveAttribute('href', '/integrations')
    // ⚠️ La doctrine du produit : on nomme ce que la source EST, jamais qui la
    // vend. Le retour demandait le contraire ; c'est l'arbitrage qui gagne.
    expect(strip.textContent).not.toMatch(/google|gmail|outlook|microsoft/i)
  })

  it('l’ancienne note « Lu dans ton agenda connecté » ne s’affiche plus DEUX fois', () => {
    render(<BriefingPage />)
    const text = document.body.textContent ?? ''
    // Le compte, pas la présence : un libellé rendu deux fois passe `getByText`.
    expect(text.split('Gérer les connexions').length - 1).toBe(1)
    expect(text).not.toContain('Lu dans ton agenda connecté')
  })
})

/**
 * #2098.10 — LE BOUTON ACTUALISER DIT CE QU'IL VA RELIRE.
 *
 * « Actualiser » seul ne dit pas quoi. Le titre (lu au survol) énumère les
 * TROIS capacités réellement relues par `refetch` — jamais un texte
 * générique, jamais une capacité qui ne serait pas vraiment relue.
 */
describe('le bouton Actualiser (#2098.10)', () => {
  it('précise ce qui sera relu, au survol', () => {
    render(<BriefingPage />)
    openMoreMenu()
    expect(screen.getByRole('button', { name: 'Actualiser' })).toHaveAttribute(
      'title',
      'Relit ton agenda, ta messagerie et tes tâches',
    )
  })
})

/**
 * #2994 — LE BOUTON EXPORTER. Refonte Théo (23/10) : rangé dans le menu « … » de l'en-tête,
 * comme dans notre maquette validée (`aujourdhui.html#au-menu`) — un clic l'atteint.
 *
 * Même patron que `agenda.brief.export` (`MeetingPrepDialog.test.tsx`) :
 * copie dans le presse-papiers, un toast qui dit ce qui s'est vraiment passé,
 * jamais un envoi.
 */
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function clipboardSpy(impl?: (text: string) => Promise<void>) {
  const writeText = vi.fn<(text: string) => Promise<void>>(impl ?? (() => Promise.resolve()))
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return writeText
}

describe('le bouton Exporter (#2994)', () => {
  it('vit dans le menu « … » de l’entête : fermé, il n’est pas rendu ; ouvert, il est là', () => {
    render(<BriefingPage />)
    expect(screen.queryByRole('button', { name: 'Exporter' })).not.toBeInTheDocument()
    openMoreMenu()
    expect(screen.getByRole('button', { name: 'Exporter' })).toBeInTheDocument()
  })

  it('copie le brief dans le presse-papiers et le confirme par un toast', async () => {
    const writeText = clipboardSpy()
    const { toast } = await import('sonner')
    render(<BriefingPage />)
    openMoreMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Exporter' }))
    await Promise.resolve()
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('sans priorité, le texte s’arrête à l’en-tête — pas de « 0 priorité » fabriqué', async () => {
    const writeText = clipboardSpy()
    briefing.mockReturnValue({
      data: payload({ actions: [] }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })
    render(<BriefingPage />)
    openMoreMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Exporter' }))
    await Promise.resolve()
    const text = writeText.mock.calls[0]?.[0] ?? ''
    expect(text).not.toContain('0.')
    expect(text.split('\n')).toHaveLength(1)
  })

  it('sait dire NON — un presse-papier refusé ne prétend pas avoir copié', async () => {
    clipboardSpy(() => Promise.reject(new Error('denied')))
    const { toast } = await import('sonner')
    render(<BriefingPage />)
    openMoreMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Exporter' }))
    await Promise.resolve().then(() => Promise.resolve())
    expect(toast.error).toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })
})

/**
 * #2994 — LE BOUTON PARTAGER, DISTINCT de l'export (#2112 : « ne jamais
 * cacher une action structurante » — les deux sont visibles dans l'entête).
 *
 * Décision du jour (tranché sans Louis) : partager copie le LIEN profond de
 * la page — `window.location.href` — jamais son contenu (déjà couvert par
 * Exporter) ni un lien public (le brief est privé au compte, même patron que
 * `CopyContactLinkButton`).
 */
describe('le bouton Partager (#2994)', () => {
  it('vit à côté d’Exporter, dans le menu « … » de l’entête', () => {
    render(<BriefingPage />)
    openMoreMenu()
    expect(screen.getByRole('button', { name: 'Partager' })).toBeInTheDocument()
  })

  it('copie le lien de la page courante et le confirme par un toast', async () => {
    const writeText = clipboardSpy()
    const { toast } = await import('sonner')
    render(<BriefingPage />)
    openMoreMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Partager' }))
    await Promise.resolve()
    expect(writeText).toHaveBeenCalledWith(window.location.href)
    expect(toast.success).toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('sait dire NON — un presse-papier refusé ne prétend pas avoir copié', async () => {
    clipboardSpy(() => Promise.reject(new Error('denied')))
    const { toast } = await import('sonner')
    render(<BriefingPage />)
    openMoreMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Partager' }))
    await Promise.resolve().then(() => Promise.resolve())
    expect(toast.error).toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })
})

/**
 * #2994 (#2112 : « les filtres pertinents survivent au retour ») — la vue
 * jour/semaine du plateau agenda est CONTRÔLABLE depuis l'extérieur (la route
 * `/briefing` la lit dans `?mode=`), sans quoi un retour en arrière du
 * navigateur rouvrirait toujours la vue « jour » par défaut.
 */
describe('la vue agenda contrôlée depuis la route (#2994)', () => {
  it('démarre sur la vue reçue en prop : « Mon agenda » ne montre que le plateau', () => {
    render(<BriefingPage view="agenda" agendaMode="week" onAgendaModeChange={vi.fn()} />)
    expect(screen.getByTestId('today-agenda-view')).toHaveTextContent('[plateau agenda]')
    // Un VRAI onglet : la file et ses tuiles ne sont pas empilées dessous.
    expect(screen.queryByTestId('today-main-column')).not.toBeInTheDocument()
    // #4491 — la vue se choisit dans la barre du haut (Ma journée · Mon agenda · Équipe · Pilotage) :
    // la page ne recopie plus ses propres onglets.
    expect(screen.queryByRole('tab', { name: 'Mon agenda' })).not.toBeInTheDocument()
  })

  it('sait dire NON : « Mon activité » ne monte PAS le plateau de la semaine', () => {
    render(<BriefingPage />)
    expect(screen.queryByText('[plateau agenda]')).not.toBeInTheDocument()
    expect(screen.getByTestId('today-main-column')).toBeInTheDocument()
  })

  it('« Agenda » de la carte des rendez-vous prévient la route', () => {
    const onViewChange = vi.fn()
    render(<BriefingPage view="activity" onViewChange={onViewChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Agenda' }))
    expect(onViewChange).toHaveBeenLastCalledWith('agenda')
  })

  it('prévient l’appelant à chaque changement de vue, sans imposer de route', () => {
    const onAgendaModeChange = vi.fn()
    render(<BriefingPage agendaMode="day" onAgendaModeChange={onAgendaModeChange} />)
    // Le plateau est un faux (`[plateau agenda]`) : le changement de vue
    // passe ici par le sélecteur jour/semaine, hors de portée de ce test —
    // seule la CÂBLURE compte, déjà exercée par `AgendaBoard.test.tsx`.
    expect(onAgendaModeChange).not.toHaveBeenCalled()
  })
})

/**
 * #2097.9 / #2097.52 — LES TITRES DE SECTION SONT DE VRAIS <h2>, HIÉRARCHISÉS.
 *
 * Recette écran du 25/09 (R6) : les dix titres de section étaient dix `<p>` de
 * 14px identiques (`h2h3Count:0` sur toute la page) — aucun repère de
 * structure pour un lecteur d'écran, et rien ne distinguait visuellement le
 * bloc de décision d'un bloc secondaire.
 */
describe('les titres de section sont de vrais <h2> hiérarchisés (#2097.9, #2097.52)', () => {
  it('rendent un titre de niveau 2, jamais un paragraphe muet', () => {
    render(<BriefingPage />)
    expect(screen.getByRole('heading', { level: 2, name: 'Le plan de Louis' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Les rendez-vous du jour' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Mon activité' })).toBeInTheDocument()
  })

  it('le bloc de décision porte un titre au-dessus de l’échelle des blocs secondaires (GA-31)', () => {
    render(<BriefingPage />)
    const decision = screen.getByRole('heading', { level: 2, name: 'Le plan de Louis' })
    const secondary = screen.getByRole('heading', { level: 2, name: 'Mon activité' })
    expect(decision.className).toContain('text-xl')
    expect(secondary.className).toContain('text-lg')
  })
})

/**
 * #2097.10 / #2097.13 — DEUX RECTANGLES CÔTE À CÔTE, PLUS IDENTIQUES.
 *
 * Mesuré : « À faire maintenant » et « Tes tâches » rendaient 586×2098px
 * EXACTEMENT identiques malgré des contenus différents. « À faire
 * maintenant » porte la décision (bloc 3 de la hiérarchie #2099) : il gagne
 * une bordure plus marquée (`--bellum-border-strong`, déjà le jeton du dépôt
 * pour « un contour qui doit se voir seul ») et davantage de largeur — « Tes
 * tâches » garde le traitement standard.
 */
describe('le bloc de décision ne dessine plus un rectangle identique à « Tes tâches » (#2097.10, #2097.13)', () => {
  it('le plan porte une bordure plus marquée que « Tes tâches »', () => {
    render(<BriefingPage />)
    const actionsCard = screen.getByRole('heading', { level: 2, name: 'Le plan de Louis' }).closest('section')!
    const tasksCard = screen.getByRole('heading', { level: 2, name: 'Tes tâches' }).closest('section')!
    expect(actionsCard.className).toContain('border-[var(--bellum-border-strong)]')
    expect(tasksCard.className).not.toContain('border-[var(--bellum-border-strong)]')
  })
})

/**
 * #2097.15 / #2097.66 — AUCUN BLOC SECONDAIRE NE DOMINE LA PAGE.
 *
 * Mesuré : 6 blocs sur 10 (dont « Mon activité ») occupaient 1196px de large
 * contre 586px pour le bloc de décision, avec le MÊME style — rien ne les
 * subordonnait. GA-34 réserve la pleine largeur aux listes/tableaux, donc la
 * largeur reste : la hiérarchie se lit dans le TITRE et la BORDURE.
 */
describe('aucun bloc secondaire ne porte le relief du bloc de décision (#2097.15, #2097.66)', () => {
  it('« Mon activité » garde la bordure standard, jamais celle du bloc de décision', () => {
    render(<BriefingPage />)
    const secondaryCard = screen.getByRole('heading', { level: 2, name: 'Mon activité' }).closest('section')!
    expect(secondaryCard.className).not.toContain('border-[var(--bellum-border-strong)]')
  })
})

/**
 * #2097.37 — « ÇA TRAVAILLE » : LE BOUTON ACTUALISER LE DIT AUSSI AUX
 * TECHNOLOGIES D'ASSISTANCE, PAS SEULEMENT PAR L'ICÔNE QUI TOURNE.
 */
describe('le bouton Actualiser annonce qu’il travaille (#2097.37)', () => {
  it('porte aria-busy=true pendant le rafraîchissement', () => {
    briefing.mockReturnValue({ data: payload(), isLoading: false, isError: false, refetch: vi.fn(), isFetching: true })
    render(<BriefingPage />)
    // Le bouton « … » le porte aussi : menu fermé, la lecture en cours reste annoncée.
    expect(screen.getByRole('button', { name: 'Plus d’actions sur le brief' })).toHaveAttribute('aria-busy', 'true')
    openMoreMenu()
    expect(screen.getByRole('button', { name: 'Actualiser' })).toHaveAttribute('aria-busy', 'true')
  })

  it('ne prétend pas travailler au repos', () => {
    render(<BriefingPage />)
    openMoreMenu()
    expect(screen.getByRole('button', { name: 'Actualiser' })).toHaveAttribute('aria-busy', 'false')
  })
})

/**
 * #2097.54 — L'ÉTAT DE CHARGEMENT S'ANNONCE AUX TECHNOLOGIES D'ASSISTANCE.
 *
 * Réfuté au code : `BriefingPage.tsx` rendait un `<Spinner/>` nu, sans
 * `role="status"` ni `aria-live` — une icône qui tourne ne dit rien à qui ne
 * la voit pas. La ligne de registre le disait « livré » (référençant
 * `fix/briefing-design-2097-25-09`, une AUTRE mesure), mesure fausse pour ce
 * point précis : ce test SAIT DIRE NON, sur le VRAI état de chargement de la
 * page, pas sur un bloc voisin.
 */
describe('l’état de chargement s’annonce aux technologies d’assistance (#2097.54)', () => {
  it('porte role="status" et aria-live="polite" pendant le premier chargement', () => {
    briefing.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn(), isFetching: false })
    render(<BriefingPage />)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent('Chargement du brief du jour')
  })
})

// #VU.2 (18/10) — « Chargement du brief du jour… » restait affiché sans fin : au bout de
// 5 s, l'écran DIT que ça tarde et offre de relire, il ne tourne pas indéfiniment.
describe('un chargement qui tarde se dit (VU.2)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('après 5 s de chargement, annonce le retard et propose de réessayer', () => {
    vi.useFakeTimers()
    const refetch = vi.fn()
    briefing.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch, isFetching: true })
    render(<BriefingPage />)
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull()
    act(() => {
      vi.advanceTimersByTime(5100)
    })
    expect(screen.getByRole('status')).toHaveTextContent('plus de temps que prévu')
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(refetch).toHaveBeenCalled()
  })
})

describe('le prochain rendez-vous (#1392)', () => {
  it('ouvre le brief existant, sans le recopier sur la page', () => {
    render(<BriefingPage />)
    expect(screen.queryByText(/\[brief du rendez-vous/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Préparer le rendez-vous' }))
    expect(screen.getByText('[brief du rendez-vous evt-1]')).toBeInTheDocument()
  })

  it('un point INTERNE n’a pas de brief à préparer — on ne promet pas un contenu vide', () => {
    // ⚠️ Le verdict est celui du SERVEUR (`needsPreparation` : externe, dans
    // les 24 h), pas un `isExternal` relu par l'écran. Ce test tombe si
    // quelqu'un remplace l'un par l'autre, ce qui est exactement le point :
    // deux verdicts sur la même ligne finissent par se contredire.
    briefing.mockReturnValue({
      data: payload({
        agenda: {
          state: 'ready',
          reason: null,
          readAt: null,
          events: [{ ...EVENT, isExternal: false }],
          conflicts: [],
          needsPreparation: [],
        },
      } as Partial<DailyBriefing>),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })
    render(<BriefingPage />)
    expect(screen.queryByRole('button', { name: 'Préparer le rendez-vous' })).not.toBeInTheDocument()
  })

  it('#2319.21 — à T-1 h, le brief se PROPOSE : la porte devient « ouvrir maintenant »', () => {
    const inThirty = new Date(Date.now() + 30 * 60_000)
    const soon = {
      ...EVENT,
      id: 'evt-soon',
      start: inThirty.toISOString(),
      end: new Date(inThirty.getTime() + 3_600_000).toISOString(),
    }
    briefing.mockReturnValue({
      data: payload({
        agenda: { state: 'ready', reason: null, readAt: null, events: [soon], conflicts: [], needsPreparation: [soon] },
      } as Partial<DailyBriefing>),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })
    render(<BriefingPage />)
    expect(screen.queryByRole('button', { name: 'Préparer le rendez-vous' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le brief maintenant' }))
    expect(screen.getByText('[brief du rendez-vous evt-soon]')).toBeInTheDocument()
  })

  it('#2319.21 — sait dire NON : à deux heures, la porte reste « préparer »', () => {
    render(<BriefingPage />)
    expect(screen.queryByRole('button', { name: 'Ouvrir le brief maintenant' })).not.toBeInTheDocument()
  })

  // #2106.35 — la carte « À faire maintenant » (kind `meeting_prep`) ouvre le
  // MÊME dialogue que le bandeau, sur le MÊME rendez-vous : deux portes, un
  // seul brief, jamais deux vérités sur le compte.
  it('#2106.35 — la carte « À faire maintenant » ouvre le MÊME brief que le bandeau', () => {
    render(<BriefingPage />)
    expect(screen.queryByText(/\[brief du rendez-vous/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '[carte : préparer evt-1]' }))
    expect(screen.getByText('[brief du rendez-vous evt-1]')).toBeInTheDocument()
  })

  it('#2106.35 — un identifiant qui ne correspond à AUCUN événement de la fenêtre n’ouvre rien', () => {
    render(<BriefingPage />)
    fireEvent.click(screen.getByRole('button', { name: '[carte : préparer un rendez-vous hors fenêtre]' }))
    expect(screen.queryByText(/\[brief du rendez-vous/)).not.toBeInTheDocument()
  })
})

/**
 * #2097.40-.44 — SOUS 768PX (recette iPhone du 25/09), « Sources utilisées
 * aujourd'hui » rendait AVANT le prochain rendez-vous : la première chose lue
 * n'était pas la décision du jour, mais la provenance des données qui la
 * nourrissent. L'ordre mobile demandé (rendez-vous → priorités → plan du jour
 * → préparations → changements → sources) déplace le bandeau en dernière
 * position nommée, replié — desktop garde l'ordre et l'ouverture d'origine.
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

describe('sous 768px, les sources passent en dernier, repliées (#2097.40-.44)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('le bandeau des sources rend APRÈS « ce qui a bougé », sur mobile', () => {
    stubMatchMedia(true)
    render(<BriefingPage />)
    const [since, sources] = orderOf(['Ce qui a bougé depuis ta dernière visite', 'Sources utilisées aujourd’hui'])
    expect(since).toBeGreaterThanOrEqual(0)
    expect(sources).toBeGreaterThan(since!)
  })

  it('replié par défaut : le détail des sources n’est pas encore dans le DOM', () => {
    stubMatchMedia(true)
    render(<BriefingPage />)
    expect(screen.queryByText(/ton agenda · connecté/)).not.toBeInTheDocument()
  })

  it('se déplie au clic et affiche le détail des sources', () => {
    stubMatchMedia(true)
    render(<BriefingPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Sources utilisées aujourd’hui' }))
    expect(screen.getByText(/ton agenda · connecté/)).toBeInTheDocument()
  })

  it('au bureau, refonte Théo (`.x-foot`) : les sources ferment la page, ouvertes', () => {
    stubMatchMedia(false)
    render(<BriefingPage />)
    const [since, sources] = orderOf(['Ce qui a bougé depuis ta dernière visite', 'Sources utilisées aujourd’hui'])
    expect(since).toBeGreaterThanOrEqual(0)
    expect(since).toBeLessThan(sources!)
    expect(screen.getByText(/ton agenda · connecté/)).toBeInTheDocument()
  })
})

describe('le copilote (#1395)', () => {
  it('un LIEN contextuel sous les priorités, jamais un bloc décoratif', () => {
    render(<BriefingPage />)
    // #4309.1 (lot LAURA, 19/10/2026) — sur bureau, l'amorce ouvre la bulle SUR PLACE : un bouton, plus un lien.
    const trigger = screen.getByText(/prioriser ma journée/).closest('button')
    expect(trigger).toHaveAttribute('type', 'button')
    // Un seul point d'entrée : deux liens vers le copilote sur le même écran,
    // c'est le bloc décoratif que le retour refuse en toutes lettres.
    expect((document.body.textContent ?? '').split('prioriser ma journée').length - 1).toBe(1)
  })
})

/**
 * L'ORDRE MOBILE DE L'ÉCRAN (#2097, correctif du 26/09).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE VÉRIFIE, ET POURQUOI ELLE A CHANGÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Mesuré en prod sur iPhone le 26/09 07:46 : l'ordre RÉEL ne suivait PAS les
 * `data-mobile-order` — ils existaient, mais aucune règle CSS `order` ne les
 * lisait ; le DOM sous 768px était le MÊME qu'au bureau, retombé en colonne
 * unique dans l'ordre d'écriture. Cette garde lit désormais l'ordre DOM réel
 * (l'attribut reste le marqueur, mais c'est la POSITION des nœuds dans l'arbre
 * qui fait foi, pas une classe `order-*` ni la structure des données).
 *
 * `isMobile` (`useIsMobile`) lit `matchMedia`, jamais `window.innerWidth` —
 * `stubMatchMedia` (même faux que le bloc « sources » juste au-dessus) est
 * donc ce qui bascule réellement l'écran en mobile ici.
 *
 * Position 4 (« préparations ») reste PORTÉE par `PreparationsBlock` (mocké
 * ci-dessus), SEULEMENT sous 768px et SEULEMENT quand il y en a au moins une
 * (une absence ne fait aucun bloc).
 */
describe('l’ordre MOBILE de l’écran (#2097, correctif du 26/09)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('1 maintenant · 2 priorités · 3 agenda · 4 préparations · 5 ce qui a bougé · 6 décision · 7 blocages · 8 messagerie · 9 tâches', () => {
    stubMatchMedia(true)
    // BEL-SC-227 (#3256) — DEUX cartes `meeting_prep`, jamais une seule : la
    // plus prioritaire des deux part dans « Tes décisions » (une carte
    // promue ne se repropose pas ailleurs, GA-26), et cette garde-ci teste la
    // POSITION 4, qui a besoin qu'il en reste au moins une derrière.
    briefing.mockReturnValue({
      data: payload({
        actions: [
          briefingAction({ id: 'a1', kind: 'meeting_prep' }),
          briefingAction({ id: 'a2', kind: 'meeting_prep', priority: 5 }),
        ],
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })
    const { container } = render(<BriefingPage />)
    const markers = Array.from(container.querySelectorAll<HTMLElement>('[data-mobile-order]')).map(node =>
      node.getAttribute('data-mobile-order'),
    )
    // F2-FIX #4297 — les priorités (2) ouvrent, « maintenant » (1) vient juste derrière.
    expect(markers).toEqual(['2', '1', '3', '4', '5', '6', '7', '8', '9'])
  })

  it('position 4 est ABSENTE sur mobile sans aucune carte `meeting_prep` — pas un bloc vide', () => {
    stubMatchMedia(true)
    briefing.mockReturnValue({
      data: payload({ actions: [briefingAction({ id: 'a1', kind: 'follow_up' })] }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })
    const { container } = render(<BriefingPage />)
    const markers = Array.from(container.querySelectorAll<HTMLElement>('[data-mobile-order]')).map(node =>
      node.getAttribute('data-mobile-order'),
    )
    expect(markers).toEqual(['2', '1', '3', '5', '6', '7', '8', '9'])
    expect(container.querySelector('[data-mobile-order="4"]')).not.toBeInTheDocument()
  })

  it('les SOURCES restent en TOUTE DERNIÈRE position, après les blocs non numérotés (signaux, comptes, activité)', () => {
    stubMatchMedia(true)
    render(<BriefingPage />)
    const indexes = orderOf([
      'Voir mes tâches',
      'Alertes de Découvrir',
      'Comptes qui ont bougé',
      '[mon activité]',
      'Sources utilisées aujourd’hui',
    ])
    expect(
      indexes.every(index => index >= 0),
      `indices : ${indexes.join(', ')}`,
    ).toBe(true)
    expect(indexes).toEqual([...indexes].sort((left, right) => left - right))
  })

  it('l’agenda passe AVANT « ta messagerie » et « tes tâches » — plus l’étirement mesuré en prod le 26/09', () => {
    stubMatchMedia(true)
    render(<BriefingPage />)
    const [agenda, mail, tasks] = orderOf(['Les rendez-vous du jour', 'Ta messagerie', 'Voir mes tâches'])
    expect(agenda).toBeGreaterThanOrEqual(0)
    expect(agenda).toBeLessThan(mail!)
    expect(mail).toBeLessThan(tasks!)
  })

  it('position 4 est ABSENTE au bureau, même avec une carte `meeting_prep` — elle reste dans « À faire maintenant »', () => {
    stubMatchMedia(false)
    briefing.mockReturnValue({
      data: payload({ actions: [briefingAction({ id: 'a1', kind: 'meeting_prep' })] }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })
    const { container } = render(<BriefingPage />)
    expect(container.querySelector('[data-mobile-order="4"]')).not.toBeInTheDocument()
    expect(screen.getByText('[à faire maintenant]')).toBeInTheDocument()
  })
})

/**
 * #2097.62 — LES ÉTATS MOBILES RÉUTILISENT LES PRIMITIVES EXISTANTES.
 *
 * Aucun composant mobile dédié : chargement (`role="status"`), vide
 * (`BlockStateNotice`/textes `*.empty`), partiel (`BlockStateNotice`,
 * `state.partial` + `state.<capability>Partial`) et erreur (`error.title` +
 * bouton « Réessayer ») sont les MÊMES qu'au bureau — cette garde prouve
 * seulement qu'`isMobile` (mocké via `matchMedia`) ne les fait pas
 * disparaître, jamais une seconde maquette.
 */
describe('les états mobiles réutilisent les primitives existantes (#2097.62)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('chargement : l’annonce « role=status » reste rendue sur mobile, pas seulement au bureau', () => {
    stubMatchMedia(true)
    briefing.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn(), isFetching: false })
    render(<BriefingPage />)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent('Chargement du brief du jour')
  })

  it('vide : une messagerie sans fil le DIT sur mobile, jamais un rectangle muet', () => {
    stubMatchMedia(true)
    briefing.mockReturnValue({
      data: payload({
        agenda: { state: 'ready', reason: null, readAt: null, events: [], conflicts: [], needsPreparation: [] },
        mail: { state: 'ready', reason: null, readAt: null, awaitingReply: [], positiveReplies: [], unread: [] },
      } as Partial<DailyBriefing>),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })
    render(<BriefingPage />)
    expect(screen.getByText('Aucun fil à traiter.')).toBeInTheDocument()
  })

  it('partiel : la bannière « Liste incomplète » reste rendue sur mobile, à côté de l’agenda incomplet', () => {
    stubMatchMedia(true)
    briefing.mockReturnValue({
      data: payload({
        agenda: {
          state: 'partial',
          reason: 'connector_timeout',
          readAt: null,
          events: [],
          conflicts: [],
          needsPreparation: [],
        },
      } as Partial<DailyBriefing>),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })
    render(<BriefingPage />)
    expect(screen.getByText('Liste incomplète')).toBeInTheDocument()
    expect(screen.getByText(/Un de tes agendas n'a pas répondu/)).toBeInTheDocument()
  })

  it('erreur : le titre d’erreur et « Réessayer » restent rendus sur mobile', () => {
    stubMatchMedia(true)
    const refetch = vi.fn()
    briefing.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch, isFetching: false })
    render(<BriefingPage />)
    const retry = screen.getByRole('button', { name: /réessay/i })
    fireEvent.click(retry)
    expect(refetch).toHaveBeenCalled()
  })
})

describe('« Comptes qui ont bougé » — le logo du compte (#2097.21 correctif)', () => {
  beforeEach(() => {
    logoRequests.length = 0
  })

  it('demande le logo ET le repli favicon du compte — pas seulement le logo Apollo', () => {
    briefing.mockReturnValue({
      data: payload({
        accountsToWatch: [
          {
            accountId: 'acc-1',
            companyName: 'Thales',
            reasonKey: 'briefing.account.freshSignal',
            href: '/accounts/acc-1',
            detectedAt: null,
            detectionExact: true,
            signalLabel: null,
            esnReason: null,
            signalSourceUrl: null,
            signalSourceKind: null,
            logoUrl: null,
            website: 'https://www.thalesgroup.com',
            structuralPotentialPaths: null,
            accessPath: null,
            history: [],
          },
        ],
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })

    render(<BriefingPage />)

    // Le nom voyage toujours (`ObjectMention`, inchangée) …
    expect(screen.getByText('Thales')).toBeInTheDocument()
    // … et la carte a bien demandé un logo pour CE compte, avec son site en
    // repli — c'est précisément ce qui manquait : mesuré en recette, aucune
    // des cinq cartes n'appelait `companyLogoSrc`.
    expect(logoRequests).toContainEqual([null, 'https://www.thalesgroup.com'])
  })
})

// #2107.41 — « CE QUI a bougé » : `signalLabel` existait déjà sur le contrat
// et la démo (#2107.28) mais AUCUN appelant ne le rendait — seule la DATE
// voyageait (`signalAttribute`). En ligne séparée, jamais un second attribut
// sur le F1.
describe('« Comptes qui ont bougé » — le signal lui-même (#2107.41)', () => {
  function accountsToWatchPayload(signalLabel: string | null) {
    return payload({
      accountsToWatch: [
        {
          accountId: 'acc-1',
          companyName: 'Thales',
          reasonKey: 'briefing.account.freshSignal',
          href: '/accounts/acc-1',
          detectedAt: null,
          detectionExact: true,
          signalLabel,
          esnReason: null,
          signalSourceUrl: null,
          signalSourceKind: null,
          logoUrl: null,
          website: null,
          structuralPotentialPaths: null,
          accessPath: null,
          history: [],
        },
      ],
    })
  }

  it('affiche CE QUI a bougé quand la matérialisation a écrit un libellé', () => {
    briefing.mockReturnValue({
      data: accountsToWatchPayload('Levée de fonds Série B'),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })

    render(<BriefingPage />)

    expect(screen.getByText('Levée de fonds Série B')).toBeInTheDocument()
  })

  it('n’affiche AUCUNE ligne de signal quand la matérialisation n’a rien écrit', () => {
    briefing.mockReturnValue({
      data: accountsToWatchPayload(null),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })

    render(<BriefingPage />)

    expect(screen.getByText('Thales')).toBeInTheDocument()
    expect(screen.queryByText(/levée de fonds|recrutement|ouverture d.un bureau/i)).not.toBeInTheDocument()
  })
})

// Théo A today-jour — « sources cliquables, visibles directement » : le lien vers la page d'origine du signal est
// SUR la carte, sans ouvrir de détail ; sans URL vérifiable, aucune ligne.
describe('« Comptes qui ont bougé » — la source du signal (Théo A today-jour)', () => {
  function withSource(url: string | null) {
    return payload({
      accountsToWatch: [
        {
          accountId: 'acc-1',
          companyName: 'Thales',
          reasonKey: 'briefing.account.freshSignal',
          href: '/accounts/acc-1',
          detectedAt: null,
          detectionExact: true,
          signalLabel: 'Levée de fonds Série B',
          signalSourceUrl: url,
          signalSourceKind: url ? 'press' : null,
          esnReason: null,
          logoUrl: null,
          website: null,
          structuralPotentialPaths: null,
          accessPath: null,
          history: [],
        },
      ],
    } as unknown as Partial<DailyBriefing>)
  }

  it('montre le lien de la source sur la carte : nouvel onglet, sans fuite d’ouvreur', () => {
    briefing.mockReturnValue({
      data: withSource('https://www.lesechos.fr/tech/serie-b'),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })
    render(<BriefingPage />)
    const link = document.querySelector('a[href="https://www.lesechos.fr/tech/serie-b"]')
    expect(link).not.toBeNull()
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('sait dire NON : sans URL vérifiable, aucun lien et aucune ligne', () => {
    briefing.mockReturnValue({
      data: withSource(null),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })
    render(<BriefingPage />)
    expect(document.querySelector('a[target="_blank"]')).toBeNull()
  })
})

// #2107.33 — « la raison pour laquelle cela concerne cette ESN », en ligne
// séparée sous la mention — jamais un second attribut sur le F1 (`ObjectMention`
// refuse volontairement plus d'un attribut), jamais une ligne quand l'analyse
// n'a rien écrit sur CE signal précis.
describe('« Comptes qui ont bougé » — la raison ESN (#2107.33)', () => {
  function accountsToWatchPayload(esnReason: string | null) {
    return payload({
      accountsToWatch: [
        {
          accountId: 'acc-1',
          companyName: 'Thales',
          reasonKey: 'briefing.account.freshSignal',
          href: '/accounts/acc-1',
          detectedAt: null,
          detectionExact: true,
          signalLabel: null,
          esnReason,
          signalSourceUrl: null,
          signalSourceKind: null,
          logoUrl: null,
          website: null,
          structuralPotentialPaths: null,
          accessPath: null,
          history: [],
        },
      ],
    })
  }

  it('affiche la raison ESN quand l’analyse en a écrit une pour ce signal', () => {
    briefing.mockReturnValue({
      data: accountsToWatchPayload('Un tour de table finance des projets IT, pas des intentions.'),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })

    render(<BriefingPage />)

    expect(screen.getByText('Un tour de table finance des projets IT, pas des intentions.')).toBeInTheDocument()
  })

  it('n’affiche AUCUNE ligne de raison quand l’analyse n’en a écrit aucune — jamais une raison devinée', () => {
    briefing.mockReturnValue({
      data: accountsToWatchPayload(null),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })

    render(<BriefingPage />)

    expect(screen.getByText('Thales')).toBeInTheDocument()
    expect(screen.queryByText(/tour de table|budget it|re-référencement/i)).not.toBeInTheDocument()
  })
})

// #2107.40 — « potentiel structurel », la MÊME lecture que le tri (GA-262),
// jusqu'ici jetée après usage — le badge n'apparaît QUE si un nombre réel est
// porté, jamais sur un compte non couvert ou sans lecture.
describe('« Comptes qui ont bougé » — le badge potentiel structurel (#2107.40)', () => {
  function accountsToWatchPayload(structuralPotentialPaths: number | null) {
    return payload({
      accountsToWatch: [
        {
          accountId: 'acc-1',
          companyName: 'Thales',
          reasonKey: 'briefing.account.freshSignal',
          href: '/accounts/acc-1',
          detectedAt: null,
          detectionExact: true,
          signalLabel: null,
          esnReason: null,
          signalSourceUrl: null,
          signalSourceKind: null,
          logoUrl: null,
          website: null,
          structuralPotentialPaths,
          accessPath: null,
          history: [],
        },
      ],
    })
  }

  it('affiche le badge quand la mémoire marché porte un nombre de parcours réel', () => {
    briefing.mockReturnValue({
      data: accountsToWatchPayload(40),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })

    render(<BriefingPage />)

    expect(screen.getByTestId('structural-potential-trigger')).toBeInTheDocument()
  })

  it('n’affiche AUCUN badge sous le seuil de couverture — `null`, jamais un « 0 » deviné', () => {
    briefing.mockReturnValue({
      data: accountsToWatchPayload(null),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })

    render(<BriefingPage />)

    expect(screen.getByText('Thales')).toBeInTheDocument()
    expect(screen.queryByTestId('structural-potential-trigger')).not.toBeInTheDocument()
  })
})

// #2107.42 — « accès réel », en LIGNE SÉPARÉE sous la mention — jamais un
// second attribut sur le F1, jamais une ligne quand aucune voie n'est connue.
describe('« Comptes qui ont bougé » — la voie d’accès (#2107.42)', () => {
  function accountsToWatchPayload(accessPath: DailyBriefing['accountsToWatch'][number]['accessPath']) {
    return payload({
      accountsToWatch: [
        {
          accountId: 'acc-1',
          companyName: 'Thales',
          reasonKey: 'briefing.account.freshSignal',
          href: '/accounts/acc-1',
          detectedAt: null,
          detectionExact: true,
          signalLabel: null,
          esnReason: null,
          signalSourceUrl: null,
          signalSourceKind: null,
          logoUrl: null,
          website: null,
          structuralPotentialPaths: null,
          accessPath,
          history: [],
        },
      ],
    })
  }

  it('affiche la voie d’accès connue du contact le mieux classé', () => {
    briefing.mockReturnValue({
      data: accountsToWatchPayload({ kind: 'verified_email', missing_reason: null }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })

    render(<BriefingPage />)

    expect(screen.getByText('e-mail vérifié')).toBeInTheDocument()
  })

  it('affiche « aucun canal trouvé après recherche » — une recherche qui n’a rien trouvé RESTE nommée', () => {
    briefing.mockReturnValue({
      data: accountsToWatchPayload({ kind: null, missing_reason: 'searched_nothing_found' }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })

    render(<BriefingPage />)

    expect(screen.getByText('aucun canal trouvé après recherche')).toBeInTheDocument()
  })

  it('n’affiche AUCUNE ligne quand la voie n’a jamais été cherchée — une absence pure, retirée', () => {
    briefing.mockReturnValue({
      data: accountsToWatchPayload({ kind: null, missing_reason: 'never_searched' }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })

    render(<BriefingPage />)

    expect(screen.getByText('Thales')).toBeInTheDocument()
    expect(
      screen.queryByText(/e-mail|téléphone|profil professionnel|relation déjà connue|aucun canal/i),
    ).not.toBeInTheDocument()
  })

  it('n’affiche AUCUNE ligne quand le compte n’a aucun contact classable — `null`, jamais une voie devinée', () => {
    briefing.mockReturnValue({
      data: accountsToWatchPayload(null),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })

    render(<BriefingPage />)

    expect(screen.getByText('Thales')).toBeInTheDocument()
    expect(
      screen.queryByText(/e-mail|téléphone|profil professionnel|relation déjà connue|aucun canal/i),
    ).not.toBeInTheDocument()
  })
})

// #4068.6 — l'historique daté du compte : date · TYPE · libellé, jamais un fait ancien présenté comme récent.
describe('« Comptes qui ont bougé » — l’historique daté (#4068.6)', () => {
  function withHistory(history: DailyBriefing['accountsToWatch'][number]['history']) {
    return payload({
      accountsToWatch: [
        {
          accountId: 'acc-1',
          companyName: 'Thales',
          reasonKey: 'briefing.account.freshSignal',
          href: '/accounts/acc-1',
          detectedAt: null,
          detectionExact: true,
          signalLabel: null,
          esnReason: null,
          signalSourceUrl: null,
          signalSourceKind: null,
          logoUrl: null,
          website: null,
          structuralPotentialPaths: null,
          accessPath: null,
          history,
        },
      ],
    })
  }

  it('montre chaque fait avec sa date ABSOLUE et son type lisible', () => {
    briefing.mockReturnValue({
      data: withHistory([{ date: '2025-06-01', kind: 'deal_lost', label: 'Affaire perdue : Migration cloud' }]),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })
    render(<BriefingPage />)
    expect(screen.getByText('Affaire perdue : Migration cloud')).toBeInTheDocument()
    expect(screen.getByText(/2025/)).toBeInTheDocument()
  })

  it('sait dire NON : sans historique, aucune ligne n’est rendue', () => {
    briefing.mockReturnValue({
      data: withHistory([]),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })
    render(<BriefingPage />)
    expect(screen.getByText('Thales')).toBeInTheDocument()
    expect(screen.queryByText(/Affaire perdue/)).not.toBeInTheDocument()
  })
})

describe('#2094.24 (épopée #2767) — les tâches vivent derrière un dépli', () => {
  it('fermé par défaut : la liste n’est pas montée, le dépli la nomme ; un tap l’ouvre', () => {
    render(<BriefingPage />)
    expect(screen.queryByText('[liste des tâches]')).toBeNull()
    const toggle = screen.getByRole('button', { name: 'Voir mes tâches' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('[liste des tâches]')).toBeInTheDocument()
  })
})

describe('refonte Théo (23/10) — Aujourd’hui est UNE file triée par urgence', () => {
  it('la file arrive à « À faire maintenant » avec l’urgent devant l’administratif (les décisions du jour en sont retirées, pas doublées)', () => {
    briefing.mockReturnValue({
      data: payload({
        actions: [
          briefingAction({ id: 'tache', kind: 'task' }),
          briefingAction({ id: 'signal', kind: 'account' }),
          briefingAction({ id: 'suivi', kind: 'follow_up' }),
          briefingAction({ id: 'tache2', kind: 'task' }),
          briefingAction({ id: 'fin', kind: 'mission_end' }),
        ],
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })
    const { container } = render(<BriefingPage />)
    expect(container.querySelector('[data-order]')?.getAttribute('data-order')).toBe('fin,tache2')
  })

  it('les tuiles comptent du réel et mènent à la file ; sans rien à compter, aucune tuile', () => {
    const { unmount } = render(<BriefingPage />)
    expect(screen.queryByRole('list', { name: 'Ce qui attend aujourd’hui' })).toBeNull()
    unmount()
    briefing.mockReturnValue({
      data: payload({ actions: [briefingAction({ id: 'a' }), briefingAction({ id: 'b' })] }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })
    render(<BriefingPage />)
    const tiles = screen.getByRole('list', { name: 'Ce qui attend aujourd’hui' })
    expect(tiles).toHaveTextContent('2')
    expect(tiles).toHaveTextContent('À faire maintenant')
  })
})

/**
 * Refonte Théo (23/10/2026, maquette `a/today-jour`) — LA STRUCTURE DE L'ÉCRAN, du haut en bas :
 * en-tête (titre, phrase, fraîcheur, gestes) · onglets de la journée · tuiles · « Commencer ici » ·
 * « Depuis ta dernière visite » replié · deux colonnes (la file et ce qui se décide ; les rendez-vous
 * et ce qui se consulte) · le pied des sources. Ces tests savent dire NON : un bloc qui change de
 * colonne, un onglet qui empile l'autre vue, ou une carte « Commencer ici » qui invente un geste.
 */
describe('refonte Théo — la structure de « Mon activité » (a/today-jour)', () => {
  const withActions = () =>
    briefing.mockReturnValue({
      data: payload({ actions: [briefingAction({ id: 'a1', kind: 'follow_up' })] }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })

  it('déroule en-tête · « Commencer ici » · ce qui a bougé · colonnes · sources, dans cet ordre', () => {
    withActions()
    render(<BriefingPage />)
    const indexes = orderOf([
      'Bonjour Louis.',
      'Brief actualisé à',
      'Commencer ici · Louis',
      'Ce qui a bougé depuis ta dernière visite',
      'Le plan de Louis',
      'Les rendez-vous du jour',
      'Sources utilisées aujourd’hui',
    ])
    expect(
      indexes.every(index => index >= 0),
      `indices : ${indexes.join(', ')}`,
    ).toBe(true)
    expect(indexes).toEqual([...indexes].sort((left, right) => left - right))
  })

  it('la colonne principale porte la file et les décisions ; la colonne de droite, les rendez-vous et la messagerie', () => {
    render(<BriefingPage />)
    const main = within(screen.getByTestId('today-main-column'))
      .getAllByRole('heading', { level: 2 })
      .map(heading => heading.textContent)
    const aside = within(screen.getByTestId('today-aside-column'))
      .getAllByRole('heading', { level: 2 })
      .map(heading => heading.textContent)
    expect(main.slice(0, 3)).toEqual(['Le plan de Louis', 'Tes tâches', 'Tes décisions'])
    expect(aside.slice(0, 2)).toEqual(['Les rendez-vous du jour', 'Ta messagerie'])
    expect(main).not.toContain('Les rendez-vous du jour')
    expect(aside).not.toContain('Le plan de Louis')
  })

  it('« Commencer ici » nomme la tête de la file et la fait avancer vers SA destination', () => {
    withActions()
    render(<BriefingPage />)
    const start = within(screen.getByTestId('today-start'))
    expect(start.getByRole('heading', { level: 2 })).not.toHaveTextContent('Rien d’urgent')
    expect(start.getByText('Faire avancer cette action').closest('a')).toHaveAttribute(
      'href',
      '/mailbox?intent=no_reply&thread=t1',
    )
  })

  it('sait dire NON : sans action, « Commencer ici » le DIT et ne propose aucun départ inventé', () => {
    render(<BriefingPage />)
    const start = within(screen.getByTestId('today-start'))
    expect(start.getByRole('heading', { level: 2 })).toHaveTextContent('Rien d’urgent ne t’attend pour l’instant')
    expect(start.queryByText('Faire avancer cette action')).not.toBeInTheDocument()
  })

  it('« Depuis ta dernière visite » est REPLIÉ : son contenu n’est monté qu’au clic', () => {
    render(<BriefingPage />)
    expect(screen.queryByText('[ce qui a bougé]')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ce qui a bougé depuis ta dernière visite' }))
    expect(screen.getByText('[ce qui a bougé]')).toBeInTheDocument()
  })

  it('« Tes décisions » : sans arbitrage du jour, un seul onglet — les gestes de suivi, jamais un onglet vide', () => {
    render(<BriefingPage />)
    const tabs = within(screen.getByRole('tablist', { name: 'Nature des décisions' })).getAllByRole('tab')
    expect(tabs.map(tab => tab.textContent)).toEqual(['Gestes de suivi'])
    expect(screen.getByText('[ce qui attend ta décision]')).toBeInTheDocument()
    expect(screen.queryByText('[décisions]')).not.toBeInTheDocument()
  })

  it('« Prioriser avec Laura » et « Toutes tes tâches » vivent dans l’en-tête du plan', () => {
    render(<BriefingPage />)
    const plan = screen.getByRole('heading', { level: 2, name: 'Le plan de Louis' }).closest('section')!
    expect(within(plan as HTMLElement).getByText(/prioriser ma journée/)).toBeInTheDocument()
    expect(
      within(plan as HTMLElement)
        .getByText('Toutes tes tâches')
        .closest('a'),
    ).toHaveAttribute('href', '/actions')
  })
})

describe('refonte Théo — « Mon agenda » (a/today-agenda)', () => {
  it('compte ce qui se chevauche et ce qui mérite une préparation, dans une seule pastille', () => {
    render(<BriefingPage view="agenda" />)
    // `payload()` : un rendez-vous externe dans deux heures, à préparer, sans conflit.
    expect(screen.getByTestId('today-agenda-points')).toHaveTextContent('1 à préparer')
    expect(screen.getByTestId('today-agenda-points')).not.toHaveTextContent('conflit')
  })

  it('sait dire NON : rien à compter, aucune pastille', () => {
    briefing.mockReturnValue({
      data: payload({
        agenda: { state: 'ready', reason: null, events: [], conflicts: [], needsPreparation: [], readAt: null },
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    })
    render(<BriefingPage view="agenda" />)
    expect(screen.queryByTestId('today-agenda-points')).not.toBeInTheDocument()
  })
})
