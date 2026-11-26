import type { DailyBriefing } from '@bellum/contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TYPE_SCALE } from '@bellum/ui'
import { i18n } from '@/i18n'

/**
 * LA FONDATION DE « AUJOURD'HUI » — ET SON APPELANT (#2113, #2101, #2099).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER NE MONTE PAS LES PIÈCES UNE PAR UNE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le défaut que ce dépôt paie le plus cher n'est pas du code faux : c'est du
 * code JUSTE que personne n'appelle. Une pièce testée en isolation est verte le
 * jour où on la retire de l'écran — et ce jour-là, plus rien ne rougit.
 *
 * Tous les tests ci-dessous rendent donc `BriefingPage`, l'écran réel, et
 * tombent si la pièce n'y est plus MONTÉE. Le contenu fin de chaque pièce a ses
 * propres tests (contrats côté `@bellum/contracts`, cartes côté
 * `ActionsBlock.test.tsx`) : ici, on garde le câblage et les règles qui
 * traversent l'écran.
 */

// #2097.21 — même câblage que `CandidateRow.test.tsx`/`CandidateCard.test.tsx` :
// verrouille que la carte transmet le logo tel quel, sans rien inventer, sans
// dépendre du délai de montage de `Avatar.Fallback` (Radix) en test.
const avatarProps: Array<{ name: string; logoUrl?: string | null }> = []
// Refonte Théo — le sélecteur Moi/Équipe lit la session ; ces specs ne montent aucun SessionProvider.
vi.mock('./TodayScopeSwitch', () => ({ TodayScopeSwitch: () => null }))
vi.mock('./TodayAddTaskButton', () => ({ TodayAddTaskButton: () => <button type="button">Ajouter une tâche</button> }))
vi.mock('@/features/briefing/hooks/useAccountLastOutcome', () => ({ useAccountLastOutcome: vi.fn(() => null) }))
vi.mock('@/components/ui/CompanyAvatar', () => ({
  CompanyAvatar: (props: { name: string; logoUrl?: string | null }) => {
    avatarProps.push({ name: props.name, logoUrl: props.logoUrl ?? null })
    return <span data-testid="company-avatar">{props.name}</span>
  },
}))

vi.mock('@/features/laura/bubble/laura-intro-store', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/laura/bubble/laura-intro-store')>()),
  useAskLauraIntro: () => false,
}))

const briefing = vi.fn()

// #2397.7 — `PriorityCard` (montée par `BriefingPage`) lit désormais
// `useSetRoleFit` (le geste « prioritaire pour moi ») : ce fichier garde le
// câblage de l'écran, pas ce geste précis (couvert par `PriorityCard.test.tsx`).
// #2107 (Centre d'actions) — `BriefingPage` lit désormais aussi
// `useAllBriefingActions` (compte non plafonné) pour le lien « voir les
// autres » d'`ActionsBlock`, hors du périmètre de ce fichier.
vi.mock('./ReadAsPicker', () => ({ ReadAsPicker: () => null }))
vi.mock('../api', () => ({
  useDailyBriefing: () => briefing(),
  useSetRoleFit: () => ({ mutate: vi.fn(), isPending: false }),
  useSetCardDisposition: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useAllBriefingActions: () => ({ data: undefined }),
  useSlotProposalPriorityAccounts: () => ({ data: undefined }),
  // BEL-SC-227 (#3256) — le rôle, faux ici : chaque test d'ordre/écran garde
  // l'ordre par défaut, aucun ne porte sur la variation par rôle (couverte par
  // `daily-decisions.test.ts`).
  useCurrentUserRole: () => ({ data: undefined }),
}))
// #2105.24/.53 — même raison : la transformation en tâche (`ActionsBlock`)
// lit désormais `useTasks`/`useCreateTask`, qui exigent un `QueryClientProvider`.
// Le geste et sa garde de dédup ont leurs propres tests
// (`ActionsBlock.transform.test.tsx`) ; ici on garde le câblage de l'écran.
// #3265.13 (épopée #3287) — `PriorityCard` lit désormais `usePlanItems`
// (dernier résultat déclaré du compte), même exigence de session que le
// mock `useTasks` juste au-dessous.
vi.mock('@/features/actions/hooks/usePlanItems', () => ({
  usePlanItems: () => ({ items: [] }),
}))
vi.mock('@/features/tasks/hooks/useTasks', () => ({
  useTasks: () => ({ data: [] }),
  useCreateTask: () => ({ mutate: vi.fn(), isPending: false }),
}))
// #3749.2 — même raison : `ActionsBlock` lit désormais `useQualificationSummary`.
vi.mock('@/features/accounts/view/accounts-list/useQualificationSummary', () => ({
  useQualificationSummary: () => ({ data: [] }),
}))
vi.mock('@/features/agenda/view/AgendaBoard', () => ({
  AgendaBoard: () => <div>[plateau agenda]</div>,
  JoinButton: () => <button type="button">Rejoindre</button>,
}))
vi.mock('@/features/agenda/view/MeetingPrepDialog', () => ({ MeetingPrepDialog: () => null }))
vi.mock('@/features/tasks/view/TaskList', () => ({ TaskList: () => <div>[liste des tâches]</div> }))
vi.mock('./MyActivityBlock', () => ({ MyActivityBlock: () => <div>[mon activité]</div> }))
vi.mock('./DailyGesturesBlock', () => ({ DailyGesturesBlock: () => <div>[ce qui attend ta décision]</div> }))
vi.mock('./SinceLastVisitBlock', () => ({ SinceLastVisitBlock: () => <div>[ce qui a bougé]</div> }))
vi.mock('./SlotProposalPriorityAccountsBlock', () => ({
  SlotProposalPriorityAccountsBlock: () => <div>[comptes à prioriser]</div>,
}))
// #2147.5 — `BriefingPage` monte désormais `RunningJobsBlock`, qui lit
// `useCancelAnalysis` (react-query) et exige un `QueryClientProvider` que ce
// fichier ne monte pas — même raison que `useTasks`/`useCreateTask` plus haut.
// Le contenu a sa propre suite (`RunningJobsBlock.test.tsx`).
vi.mock('./RunningJobsBlock', () => ({ RunningJobsBlock: () => <div>[en cours]</div> }))
// #2097 (correctif du 26/09) — ActivationChecklist a sa propre suite
// (`ActivationChecklist.test.tsx`) : useSession/react-query n'ont rien à
// faire ici, ce bloc est hors sujet pour ces tests de BriefingPage.
vi.mock('@/features/onboarding/components/ActivationChecklist', () => ({ ActivationChecklist: () => null }))
// #2918 / #2100.1-.13 — `BriefingPage` monte désormais `QuickModesBlock`, qui
// lit `useTeam` (donc `useSession`, absent de ce rendu) et `useTalentStats`.
// Son propre câblage est couvert par `QuickModesBlock.test.tsx` ; ici on garde
// juste un placeholder inerte, même patron que les blocs voisins ci-dessus.
vi.mock('./QuickModesBlock', () => ({ QuickModesBlock: () => <div>[modes rapides]</div> }))
// #2145.9 / #2100.9 — même raison que `QuickModesBlock` juste au-dessus : sa
// propre lecture est couverte par `ActiveAnalysisBanner.test.tsx`.
vi.mock('./ActiveAnalysisBanner', () => ({ ActiveAnalysisBanner: () => null }))
// Louis 23/10 — le portefeuille de « Ta journée » (tuile « Affaires en cours », affaires à faire avancer, profils
// suivis) lit la session, le pipe, les affaires et le vivier : servis ici pour prouver qu'il est MONTÉ.
const portfolio = vi.hoisted(() => ({
  session: { user: null as { id: string } | null },
  pipeline: { data: undefined as unknown },
  projects: { data: undefined as unknown },
  consultants: { data: undefined as unknown },
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => portfolio.session }))
vi.mock('@/features/projects/hooks/usePipeline', () => ({ usePipeline: () => portfolio.pipeline }))
vi.mock('@/features/projects/hooks/useProjects', () => ({ useProjects: () => portfolio.projects }))
vi.mock('@/features/consultants/hooks', () => ({ useConsultants: () => portfolio.consultants }))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/features/laura/bubble/page-context-store', () => ({
  useLauraContext: () => {},
  useCurrentLauraContext: () => null,
}))
// ⚠️ Le faux TRANSMET les attributs restants, comme le vrai `Link`. Sans ça, un
// `data-testid` posé sur un lien disparaîtrait du DOM et le test chercherait un
// élément que seul le FAUX a fait disparaître — un rouge qui n'apprend rien.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string }) => (
    <a href={to ?? '#'} {...rest}>
      {children}
    </a>
  ),
  // #2097 (correctif du 26/09) — BriefingPage monte désormais ActivationChecklist,
  // qui appelle useNavigate() sans condition.
  useNavigate: () => vi.fn(),
}))

const { BriefingPage } = await import('./BriefingPage')

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

const THREAD = {
  threadId: 't-1',
  subject: 'Renouvellement',
  counterpart: 'Sophie Martin',
  lastMessageAt: new Date(Date.now() - 9 * 86_400_000).toISOString(),
  daysSinceLastMessage: 9,
}

function payload(over: Partial<DailyBriefing> = {}): DailyBriefing {
  return {
    date: IN_TWO_HOURS.toISOString().slice(0, 10),
    timeZone: 'Europe/Paris',
    firstName: 'Théo',
    agenda: { state: 'ready', reason: null, events: [EVENT], conflicts: [], needsPreparation: [] },
    mail: { state: 'ready', reason: null, awaitingReply: [THREAD], positiveReplies: [], unread: [] },
    tasks: { state: 'ready', reason: null, tasks: [], overdueCount: 0, todayCount: 0 },
    accountsToWatch: [],
    chainBlockers: [],
    discoverAlerts: [],
    discoverAlertsLastEventAt: null,
    actions: [],
    generatedAt: new Date().toISOString(),
    ...over,
  } as unknown as DailyBriefing
}

function serve(over: Partial<DailyBriefing> = {}) {
  briefing.mockReturnValue({
    data: payload(over),
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    isFetching: false,
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  avatarProps.length = 0
  await i18n.changeLanguage('fr')
  serve()
})

describe('l’en-tête de l’écran — le contrat éditorial (#2113.7 à #2113.10)', () => {
  // Louis 23/10 — « Ma journée » remplace « Aujourd'hui » : le niveau 1 dit « Ta journée » comme la maquette Théo,
  // la phrase personnalisée passe JUSTE SOUS le titre (#2113.7) — elle reste montée, elle ne monte plus en h1.
  it('est MONTÉ dans la page : « Ta journée » en niveau 1, la phrase personnalisée juste sous lui', () => {
    render(<BriefingPage />)
    const title = screen.getByRole('heading', { level: 1 })
    expect(title).toHaveTextContent(/^Ta journée$/)
    const greeting = screen.getByText(/^Bonjour Théo\./)
    expect(title.compareDocumentPosition(greeting) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  // F2-FIX #4332 (intégration PR n°2) — le titre de page vient du RÔLE `TYPE_SCALE.pageTitle` (une valeur pour tous
  // les écrans, GA-31) : il remplace la fourchette 28-36 px de #2097.16, qui faisait du Briefing le seul écran à 30 px.
  it('le titre de page vient du rôle typographique `pageTitle` (#4332, GA-31)', () => {
    render(<BriefingPage />)
    const title = screen.getByRole('heading', { level: 1 })
    for (const token of TYPE_SCALE.pageTitle.split(/\s+/)) expect(title.className).toContain(token)
  })

  it('porte une phrase de bénéfice — la page dit à quoi elle sert', () => {
    render(<BriefingPage />)
    expect(screen.getByText(/ce que .* te recommande de faire ensuite/)).toBeInTheDocument()
  })

  // #2113.12 — le titre porte le NOM et la promesse de la page, pas seulement
  // une salutation : « Bonjour Théo. » seul ne dit rien de ce qu'on vient
  // faire ici.
  it('la phrase sous le titre dit aussi ce qu’on vient faire ici (#2113.12)', () => {
    render(<BriefingPage />)
    expect(screen.getByText('Bonjour Théo. Voici où investir ton temps aujourd’hui.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent('Bonjour')
  })

  // #2113.13 — sans sujet à compter, le sous-titre générique reste (pas de
  // décompte inventé). Avec des priorités RÉELLES, il les nomme : dynamique,
  // jamais un texte recopié pour tout le monde (#2113.33).
  it('le sous-titre devient dynamique dès qu’il y a une décision réelle à nommer (#2113.13)', () => {
    serve({
      actions: [
        {
          id: 'follow-up:t-1',
          labelKey: 'briefing.actions.followUp',
          labelVars: { counterpart: 'Sophie Martin', days: 9, subject: 'Renouvellement' },
          href: '/mailbox?intent=no_reply&thread=t-1',
          kind: 'follow_up',
          priority: 4,
          fact: null,
          context: null,
          preparedArtifacts: [],
          expiresAt: null,
          businessObject: null,
          verdict: null,
          consequence: null,
          confidence: 'verified',
          estimatedMinutes: null,
          owner: null,
          permission: null,
          rankingAxes: [],
          processingState: 'suggested',
        },
      ],
    } as Partial<DailyBriefing>)
    render(<BriefingPage />)
    expect(screen.getByText('1 sujet mérite une décision aujourd’hui.')).toBeInTheDocument()
  })

  it('#3470 — le nombre de priorités n’est dit qu’UNE fois : le résumé ne le répète pas', () => {
    serve({
      actions: [
        {
          id: 'follow-up:t-1',
          labelKey: 'briefing.actions.followUp',
          labelVars: { counterpart: 'Sophie Martin', days: 9, subject: 'Renouvellement' },
          href: '/mailbox?intent=no_reply&thread=t-1',
          kind: 'follow_up',
          priority: 4,
          fact: null,
          context: null,
          preparedArtifacts: [],
          expiresAt: null,
          businessObject: null,
          verdict: null,
          consequence: null,
          confidence: 'verified',
          estimatedMinutes: null,
          owner: null,
          permission: null,
          rankingAxes: [],
          processingState: 'suggested',
        },
      ],
    } as Partial<DailyBriefing>)
    render(<BriefingPage />)
    expect(screen.getByText('1 sujet mérite une décision aujourd’hui.')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-hero-summary').textContent).not.toMatch(/priorité/)
  })

  it('résume la journée avec ce qu’il a, et ne compte JAMAIS un zéro (GA-18)', () => {
    render(<BriefingPage />)
    const summary = screen.getByTestId('briefing-hero-summary')
    // Un rendez-vous, une relance : deux segments, et deux seulement.
    expect(summary).toHaveTextContent('1 rendez-vous')
    expect(summary).toHaveTextContent('1 relance')
    // Aucune priorité, aucune tâche en retard, aucun blocage : AUCUNE ligne.
    // « 0 priorité » se lirait comme une mesure, et c'est une absence.
    expect(summary.textContent).not.toMatch(/\b0\b/)
    expect(summary.textContent).not.toMatch(/priorité/)
  })

  it('une source MUETTE ne compte pas zéro — elle ne compte pas du tout', () => {
    serve({
      mail: { state: 'unavailable', reason: null, readAt: null, awaitingReply: [], positiveReplies: [], unread: [] },
    } as Partial<DailyBriefing>)
    render(<BriefingPage />)
    const summary = screen.getByTestId('briefing-hero-summary')
    expect(summary.textContent).not.toMatch(/relance/)
    expect(summary).toHaveTextContent('1 rendez-vous')
  })

  it('sans rien à compter, il le DIT au lieu d’afficher un résumé vide (#2113.37)', () => {
    serve({
      agenda: { state: 'not_connected', reason: null, readAt: null, events: [], conflicts: [], needsPreparation: [] },
      mail: { state: 'not_connected', reason: null, readAt: null, awaitingReply: [], positiveReplies: [], unread: [] },
    } as Partial<DailyBriefing>)
    render(<BriefingPage />)
    expect(screen.getByTestId('briefing-hero-summary')).toHaveTextContent(/Je peux encore mieux/)
  })
})

describe('le geste principal suit l’étape qui MANQUE (#2113.10, #2111.49)', () => {
  it('rien de branché : le geste est de brancher, et il mène quelque part', () => {
    serve({
      agenda: { state: 'not_connected', reason: null, readAt: null, events: [], conflicts: [], needsPreparation: [] },
      mail: { state: 'not_connected', reason: null, readAt: null, awaitingReply: [], positiveReplies: [], unread: [] },
    } as Partial<DailyBriefing>)
    render(<BriefingPage />)
    const cta = screen.getByTestId('briefing-hero-cta')
    expect(cta).toHaveTextContent('Connecter mes outils')
    expect(cta.closest('a')).toHaveAttribute('href', '/integrations')
  })

  it('tout est servi et il y a des priorités : le geste est de COMMENCER (#2113.14)', () => {
    serve({
      actions: [
        {
          id: 'follow-up:t-1',
          labelKey: 'briefing.actions.followUp',
          labelVars: { counterpart: 'Sophie Martin', days: 9, subject: 'Renouvellement' },
          href: '/mailbox?intent=no_reply&thread=t-1',
          kind: 'follow_up',
          priority: 4,
          fact: null,
          context: null,
          preparedArtifacts: [],
          expiresAt: null,
          businessObject: null,
          verdict: null,
          consequence: null,
          confidence: 'verified',
          estimatedMinutes: null,
          rankingAxes: [],
          processingState: 'suggested',
          owner: null,
          permission: null,
        },
      ],
    } as Partial<DailyBriefing>)
    render(<BriefingPage />)
    const cta = screen.getByTestId('briefing-hero-cta')
    // Refonte Théo (`.v18-callout`) — « Commencer ici » : le geste fait avancer la tête de la file.
    expect(cta).toHaveTextContent('Faire avancer cette action')
    expect(cta.closest('a')).toHaveAttribute('href', '/mailbox?intent=no_reply&thread=t-1')
  })

  it('sait dire NON : une première priorité SANS destination ne se propose pas comme un départ', () => {
    serve({
      actions: [
        {
          id: 'conflict:a:b',
          labelKey: 'briefing.actions.conflict',
          labelVars: { first: 'A', second: 'B', minutes: 30 },
          href: null,
          kind: 'conflict',
          priority: 1,
          fact: null,
          context: null,
          preparedArtifacts: [],
          expiresAt: null,
          businessObject: null,
          verdict: null,
          consequence: null,
          confidence: 'verified',
          estimatedMinutes: null,
          rankingAxes: [],
          processingState: 'suggested',
          owner: null,
          permission: null,
        },
      ],
    } as Partial<DailyBriefing>)
    render(<BriefingPage />)
    // La carte existe, elle est même la première — mais elle ne mène nulle
    // part. L'en-tête ne promet donc PAS « commencer par elle » : il retombe
    // sur un geste qui, lui, atterrit vraiment.
    const cta = screen.getByTestId('briefing-hero-cta')
    expect(cta.textContent).not.toMatch(/Commencer par la priorité/)
    expect(cta.closest('a')?.getAttribute('href')).toMatch(/^\/\w/)
  })

  it('n’ouvre PAS une seconde porte vers le copilote — il y en a déjà une sous les priorités', () => {
    render(<BriefingPage />)
    const text = document.body.textContent ?? ''
    expect(text.split('prioriser ma journée').length - 1).toBe(1)
  })
})

/** Un évènement d'agenda daté par rapport à MAINTENANT — jamais en dur. */
function event(over: Record<string, unknown> = {}) {
  const start = new Date(Date.now() + 3 * 3_600_000)
  return {
    ...EVENT,
    id: `evt-${Math.random().toString(36).slice(2)}`,
    start: start.toISOString(),
    end: new Date(start.getTime() + 3_600_000).toISOString(),
    ...over,
  }
}

describe('l’agenda COMPACT du jour (#2101)', () => {
  it('est MONTÉ, et distingue le client de l’interne (#2101.5 / #2101.6)', () => {
    const base = Date.now() + 3 * 3_600_000
    serve({
      agenda: {
        state: 'ready',
        reason: null,
        events: [
          event({ start: new Date(base).toISOString(), end: new Date(base + 3_600_000).toISOString() }),
          event({
            isExternal: false,
            start: new Date(base + 7_200_000).toISOString(),
            end: new Date(base + 9_000_000).toISOString(),
          }),
        ],
        conflicts: [],
        needsPreparation: [],
      },
    } as unknown as Partial<DailyBriefing>)
    render(<BriefingPage />)
    const compact = screen.getByTestId('briefing-agenda-compact')
    expect(compact).toHaveTextContent('1 client')
    expect(compact).toHaveTextContent('1 interne')
  })

  it('compte à part ce qui est PROPOSÉ et pas encore accepté (#2101.9 / #2101.20)', () => {
    const base = Date.now() + 3 * 3_600_000
    serve({
      agenda: {
        state: 'ready',
        reason: null,
        events: [
          event({ start: new Date(base).toISOString(), end: new Date(base + 3_600_000).toISOString() }),
          event({
            status: 'tentative',
            start: new Date(base + 7_200_000).toISOString(),
            end: new Date(base + 9_000_000).toISOString(),
          }),
        ],
        conflicts: [],
        needsPreparation: [],
      },
    } as unknown as Partial<DailyBriefing>)
    render(<BriefingPage />)
    const compact = screen.getByTestId('briefing-agenda-compact')
    // Un créneau proposé n'est PAS un rendez-vous : il se compte à part, et il
    // ne gonfle jamais le nombre de clients.
    expect(compact).toHaveTextContent('1 proposé')
    expect(compact).toHaveTextContent('1 client')
    expect(compact.textContent).not.toMatch(/2 client/)
  })

  it('dit les créneaux libres SIGNIFICATIFS entre deux rendez-vous (#2101.8)', () => {
    const base = Date.now() + 3 * 3_600_000
    serve({
      agenda: {
        state: 'ready',
        reason: null,
        events: [
          event({ start: new Date(base).toISOString(), end: new Date(base + 3_600_000).toISOString() }),
          // Deux heures de trou : un créneau, et un seul.
          event({
            start: new Date(base + 3 * 3_600_000).toISOString(),
            end: new Date(base + 4 * 3_600_000).toISOString(),
          }),
        ],
        conflicts: [],
        needsPreparation: [],
      },
    } as unknown as Partial<DailyBriefing>)
    render(<BriefingPage />)
    expect(screen.getByTestId('briefing-agenda-compact')).toHaveTextContent('1 créneau libre')
  })

  it('sait dire NON : rien à compter ne fait AUCUN segment, jamais un « 0 »', () => {
    const base = Date.now() + 3 * 3_600_000
    serve({
      agenda: {
        state: 'ready',
        reason: null,
        // Un seul rendez-vous client : ni interne, ni proposé, ni trou entre
        // deux créneaux. Trois segments doivent DISPARAÎTRE.
        events: [event({ start: new Date(base).toISOString(), end: new Date(base + 3_600_000).toISOString() })],
        conflicts: [],
        needsPreparation: [],
      },
    } as unknown as Partial<DailyBriefing>)
    render(<BriefingPage />)
    const compact = screen.getByTestId('briefing-agenda-compact')
    expect(compact).toHaveTextContent('1 client')
    expect(compact.textContent).not.toMatch(/interne/)
    expect(compact.textContent).not.toMatch(/proposé/)
    expect(compact.textContent).not.toMatch(/créneau/)
    expect(compact.textContent).not.toMatch(/\b0\b/)
  })

  it('une source qui n’a PAS répondu ne rend pas un agenda compact vide', () => {
    serve({
      agenda: { state: 'not_connected', reason: null, readAt: null, events: [], conflicts: [], needsPreparation: [] },
    } as unknown as Partial<DailyBriefing>)
    render(<BriefingPage />)
    expect(screen.queryByTestId('briefing-agenda-compact')).not.toBeInTheDocument()
  })
})

/** Une carte servie telle que l'API l'écrit, avec les facettes qu'on lui passe. */
function card(over: Record<string, unknown> = {}) {
  return {
    id: 'account:acc-1',
    labelKey: 'briefing.actions.freshSignal',
    labelVars: { company: 'Damaris Industries' },
    href: '/accounts/acc-1',
    kind: 'account',
    priority: 5,
    fact: null,
    context: null,
    preparedArtifacts: [],
    expiresAt: null,
    businessObject: null,
    verdict: null,
    consequence: null,
    confidence: null,
    estimatedMinutes: null,
    rankingAxes: [],
    processingState: 'suggested',
    ...over,
  }
}

describe('la carte d’une priorité — ses facettes (#2099)', () => {
  it('est MONTÉE par le bloc des priorités, et dit ce qu’elle sait', () => {
    serve({
      actions: [
        card({
          businessObject: { kind: 'account', id: 'acc-1', name: 'Damaris Industries', logoUrl: null },
          verdict: { labelKey: 'briefing.actions.freshSignal', labelVars: { company: 'Damaris Industries' } },
          confidence: 'inferred',
          estimatedMinutes: 15,
          rankingAxes: [
            { axis: 'urgency', evaluated: true },
            { axis: 'effort', evaluated: false },
          ],
        }),
        // #2095.81 / #2993 — « passe devant sur » est une comparaison à la
        // carte SUIVANTE dans le classement, jamais les axes de la carte
        // seule : sans une seconde carte à qui se comparer, il n'y a rien à
        // affirmer (voir « sait dire NON » plus bas). Même priorité, même
        // confiance, aucun axe évalué : c'est CE qui fait que la première
        // passe devant sur `urgency` précisément.
        card({ id: 'account:acc-2', confidence: 'inferred' }),
      ],
    } as unknown as Partial<DailyBriefing>)
    render(<BriefingPage />)
    // #2095.81 — la SECONDE carte partage la même confiance (`inferred`), pour
    // que la comparaison porte sur les axes et non sur la confiance : elle
    // porte donc le même badge, d'où `getAllByText`.
    expect(screen.getAllByText('Déduit — à confirmer').length).toBeGreaterThan(0)
    expect(screen.getByText('15 min')).toBeInTheDocument()
    // #2099.43-47 / #2095.81 — le rang s'explique par des axes NOMMÉS, en
    // comparaison à la carte suivante, jamais par un chiffre : aucun poids,
    // aucun score, aucune probabilité.
    expect(screen.getByText(/Passe devant sur : urgence/)).toBeInTheDocument()
  })

  // #2097.21 — le logo (ou son repli) du compte mentionné, sur la carte.
  it('transmet le logo du compte mentionné à CompanyAvatar, sans rien inventer', () => {
    serve({
      actions: [
        card({
          businessObject: {
            kind: 'account',
            id: 'acc-1',
            name: 'Damaris Industries',
            logoUrl: 'https://cdn.example/d.png',
          },
        }),
      ],
    } as unknown as Partial<DailyBriefing>)
    render(<BriefingPage />)
    expect(avatarProps).toContainEqual({ name: 'Damaris Industries', logoUrl: 'https://cdn.example/d.png' })
  })

  it('ne monte AUCUN avatar quand l’objet mentionné n’est pas un compte', () => {
    serve({
      actions: [
        card({ businessObject: { kind: 'mission', id: 'mission-1', name: 'Damaris Industries', logoUrl: null } }),
      ],
    } as unknown as Partial<DailyBriefing>)
    render(<BriefingPage />)
    // `CompanyAvatar` n'est jamais monté ; le nom seul (« Damaris Industries »,
    // via `ObjectMention`) reste présent.
    expect(avatarProps).toHaveLength(0)
    expect(screen.getByText('Damaris Industries')).toBeInTheDocument()
  })

  it('un axe NON ÉVALUABLE reste NOMMÉ — l’autre moitié de la doctrine', () => {
    serve({
      actions: [
        card({
          rankingAxes: [
            { axis: 'urgency', evaluated: true },
            { axis: 'effort', evaluated: false },
          ],
        }),
      ],
    } as unknown as Partial<DailyBriefing>)
    render(<BriefingPage />)
    // Sous un SCORE, ce qui n'a pas pu être évalué se dit. Le taire ferait
    // passer « un axe sur sept » pour « un axe sur un ».
    // #2097 (correctif du 26/09) — le nom de l'axe est derrière un dépli
    // (`UnevaluableAxesDisclosure`), replié par défaut sur 375px.
    fireEvent.click(screen.getByRole('button', { name: /axe non évaluable/ }))
    expect(screen.getByText(/Non évaluable : effort/)).toBeInTheDocument()
  })

  it('sait dire NON : une facette absente ne fait AUCUNE ligne (GA-18)', () => {
    serve({ actions: [card()] } as unknown as Partial<DailyBriefing>)
    render(<BriefingPage />)
    const text = document.body.textContent ?? ''
    // Ni « 0 min », ni « confiance inconnue », ni « non évaluable » sur une
    // carte qui ne porte aucun axe : dans une LISTE, une absence ne fait rien.
    expect(text).not.toMatch(/0 min/)
    expect(text).not.toMatch(/Non évaluable/)
    expect(text).not.toMatch(/Passe devant sur/)
    expect(text).not.toMatch(/à confirmer/)
  })
})

describe('le portefeuille de « Ta journée » — ramené de la vue jour PR11 (Louis 23/10)', () => {
  beforeEach(() => {
    portfolio.session.user = { id: 'me' }
    portfolio.pipeline.data = { total_count: 2, total_amount_cents: 9_600_000, total_without_amount: 0 }
    portfolio.projects.data = [
      {
        id: 'p1',
        label: 'Renfort plateforme cloud',
        company_name: 'Société Générale',
        stage: 'qualified',
        stage_entered_at: '2026-10-01T00:00:00Z',
        owner_id: 'me',
        owner_name: null,
        amount_cents: 9_600_000,
        currency: 'EUR',
        next_action: null,
      },
    ]
    portfolio.consultants.data = [
      {
        id: 'c1',
        full_name: 'Salomé Dufour',
        title: 'Data',
        stack: ['Python'],
        owner_user_id: 'me',
        available_from: '2026-10-27',
      },
    ]
  })

  it('MONTE la tuile « Affaires en cours », « Les affaires à faire avancer » et « Les profils suivis »', () => {
    render(<BriefingPage />)
    expect(screen.getByRole('link', { name: /Affaires en cours/ })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Les affaires à faire avancer' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Les profils suivis' })).toBeInTheDocument()
  })

  it('sait dire NON : sans session lue, aucun de ces blocs n’affirme quoi que ce soit', () => {
    portfolio.session.user = null
    render(<BriefingPage />)
    expect(screen.queryByRole('region', { name: 'Les affaires à faire avancer' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Les profils suivis' })).toBeNull()
  })
})
