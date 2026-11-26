import type { BriefingAction, DailyBriefing } from '@bellum/contracts'
import { BRIEFING_ACTIONS_MAX } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

/**
 * #2387.14 — LES DOUZE SCÉNARIOS DE RECETTE DU COCKPIT « AUJOURD'HUI », EN UN
 * SEUL FICHIER.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER, ALORS QUE CHAQUE BLOC A DÉJÀ SES TESTS
 * ─────────────────────────────────────────────────────────────────────────────
 * #2387 (§RECETTE) nomme douze scénarios : nouvel utilisateur, aucun
 * connecteur, agenda seul, CRM seul, journée vide, journée surchargée,
 * commercial, recruteur, manager, mobile, données partielles, connecteur en
 * panne. Chacun avait sa preuve ÉPARSE (`hero.test.ts`, `BriefingPage.test.tsx`,
 * `briefing-role-order.spec.ts`…) mais AUCUN fichier ne les nommait ensemble —
 * ce qui rend impossible de répondre « la recette est couverte » d'un coup
 * d'œil. Ce fichier ne REFAIT aucune de ces preuves (GA-26, une dérivation vit à
 * un seul endroit) : soit il exerce le scénario ICI parce que `BriefingPage` en
 * décide (les cinq premiers ci-dessous), soit il CITE le fichier qui le prouve
 * déjà, dans le commentaire de son `it`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS SCÉNARIOS QUE CE COMPOSANT NE PEUT PAS PROUVER, PAR CONSTRUCTION
 * ─────────────────────────────────────────────────────────────────────────────
 * « commercial », « recruteur », « manager » : `BriefingPage` ne reçoit AUCUN
 * paramètre de rôle (`hero.ts` : « CE MODULE N'A DONC AUCUN PARAMÈTRE DE
 * RÔLE — ce n'est pas un oubli », doctrine c76, Louis 21/09/2026 — le rôle
 * change l'ORDRE, jamais le CONTENU). L'ordre par rôle est décidé et testé
 * côté API : `apps/api/src/modules/briefing/briefing-role-order.spec.ts:47`
 * (commercial), `:52` (manager), et `briefing-role-order.ts:121`
 * (`recruiter: 'sales'` — le recruteur partage la lecture du commercial, une
 * décision explicite, pas un oubli). Leur écrire un quatrième test ICI, sur un
 * composant qui reçoit déjà l'ordre tout fait, mesurerait le mock et rien
 * d'autre — voir les `vi.mock` ci-dessous : `ActionsBlock` ne reçoit qu'un
 * tableau, jamais un rôle.
 *
 * « mobile » : `BriefingPage.test.tsx` (« l'ordre MOBILE de l'écran ») couvre
 * déjà neuf positions, quatre états (chargement/vide/partiel/bureau) — le
 * refaire ici doublerait un test qui existe et diverge à la première retouche.
 */

const briefing = vi.fn()

// Refonte Théo — le sélecteur Moi/Équipe lit la session ; ces specs ne montent aucun SessionProvider.
// Louis 23/10 — le portefeuille de « Ta journée » lit le pipe, les affaires et le vivier ; son câblage est gardé par
// `BriefingFoundation.test.tsx` et `TodayPortfolio.test.tsx` : ici, rien n'est lu, il se tait.
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: null }) }))
vi.mock('@/features/projects/hooks/usePipeline', () => ({ usePipeline: () => ({ data: undefined }) }))
vi.mock('@/features/projects/hooks/useProjects', () => ({ useProjects: () => ({ data: undefined }) }))
vi.mock('@/features/consultants/hooks', () => ({ useConsultants: () => ({ data: undefined }) }))
vi.mock('./TodayScopeSwitch', () => ({ TodayScopeSwitch: () => null }))
vi.mock('./TodayAddTaskButton', () => ({ TodayAddTaskButton: () => <button type="button">Ajouter une tâche</button> }))
vi.mock('@/lib/company-logo', () => ({ companyLogoSrc: () => null, contactPhotoSrc: () => null }))
vi.mock('@/features/laura/bubble/laura-intro-store', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/laura/bubble/laura-intro-store')>()),
  useAskLauraIntro: () => false,
}))
vi.mock('./ReadAsPicker', () => ({ ReadAsPicker: () => null }))
vi.mock('../api', () => ({
  useDailyBriefing: () => briefing(),
  useAllBriefingActions: () => ({ data: undefined }),
  useSlotProposalPriorityAccounts: () => ({ data: undefined }),
  // BEL-SC-227 (#3256) — le rôle, faux ici : chaque test d'ordre/écran garde
  // l'ordre par défaut, aucun ne porte sur la variation par rôle (couverte par
  // `daily-decisions.test.ts`).
  useCurrentUserRole: () => ({ data: undefined }),
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
vi.mock('@/features/onboarding/components/ActivationChecklist', () => ({ ActivationChecklist: () => null }))
// #2147.5 / #2145.9 / #2100.9 (intégration de clôture, 26/09) — mêmes doubles
// que le fichier voisin (`BriefingPage.test.tsx`) : `useCancelAnalysis` et
// `useActiveAnalysisRuns` exigent respectivement un `QueryClientProvider` et
// une session que ces scénarios ne montent pas ; leur propre lecture est
// couverte par `RunningJobsBlock.test.tsx` / `ActiveAnalysisBanner.test.tsx`.
vi.mock('./RunningJobsBlock', () => ({ RunningJobsBlock: () => <div>[en cours]</div> }))
vi.mock('./ActiveAnalysisBanner', () => ({ ActiveAnalysisBanner: () => null }))
vi.mock('./QuickModesBlock', () => ({ QuickModesBlock: () => <div>[modes de travail rapides]</div> }))
// ⚠️ Seul écart avec le double du fichier voisin : celui-ci RENDLE le compte
// d'actions reçues — c'est exactement ce que « journée vide »/« journée
// surchargée » et « CRM seul » ont besoin de distinguer, et qu'un marqueur
// muet ne pourrait pas prouver.
vi.mock('./ActionsBlock', () => ({
  ActionsBlock: ({ actions }: { actions: { id: string }[] }) => <div>[à faire maintenant · {actions.length}]</div>,
}))
// BEL-SC-227 (#3256) — même patron que `ActionsBlock` juste au-dessus : le
// CONTENU d'une décision a son propre fichier (`DecisionsSection.test.tsx`),
// ce double-ci ne garde que ce que CE fichier mesure — combien de cartes
// partent dans chaque section, jamais perdues en route.
vi.mock('./DecisionsSection', () => ({
  DecisionsSection: ({ decisions }: { decisions: { action: { id: string } }[] }) => (
    <div>[décisions · {decisions.length}]</div>
  ),
}))
vi.mock('./PreparationsBlock', () => ({
  PreparationsBlock: ({ actions }: { actions: { id: string }[] }) => <div>[préparations · {actions.length}]</div>,
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
  useNavigate: () => vi.fn(),
}))

const { BriefingPage } = await import('./BriefingPage')

const NOW = new Date()

function event(id: string, hoursFromNow: number) {
  const start = new Date(NOW.getTime() + hoursFromNow * 3_600_000)
  return {
    id,
    summary: `Rendez-vous ${id}`,
    description: null,
    location: null,
    start: start.toISOString(),
    end: new Date(start.getTime() + 3_600_000).toISOString(),
    organizer: null,
    attendees: [],
    conferenceUrl: null,
    webUrl: null,
    status: 'confirmed',
    isExternal: true,
    cancelled: false,
  }
}

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
    date: NOW.toISOString().slice(0, 10),
    timeZone: 'Europe/Paris',
    firstName: 'Louis',
    agenda: {
      state: 'not_connected',
      reason: 'Aucun agenda connecté.',
      events: [],
      conflicts: [],
      needsPreparation: [],
    },
    mail: {
      state: 'not_connected',
      reason: 'Aucune messagerie connectée.',
      awaitingReply: [],
      positiveReplies: [],
      unread: [],
    },
    tasks: { state: 'ready', reason: null, tasks: [] },
    accountsToWatch: [],
    actions: [],
    generatedAt: new Date().toISOString(),
    ...over,
  } as DailyBriefing
}

function mount(data: DailyBriefing) {
  briefing.mockReturnValue({ data, isLoading: false, isError: false, refetch: vi.fn(), isFetching: false })
  render(<BriefingPage />)
}

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage('fr')
})

describe('#2387.14 — nouvel utilisateur / aucun connecteur', () => {
  it('les deux sources qui dépendent d’un connecteur disent « non connecté », rien n’est inventé à la place', () => {
    mount(payload())
    // Agenda ET messagerie — les deux seules capacités du brief qui dépendent
    // réellement d’un connecteur externe (`tasks` ne peut jamais l’être, voir
    // `daily-briefing.ts`). Le bandeau des sources (`SourcesStrip.tsx`) les
    // écrit toujours, sans clic — la maquette « connecter mes outils » suit.
    expect(screen.getByText(/ton agenda · non connecté/)).toBeInTheDocument()
    expect(screen.getByText(/ta messagerie · non connecté/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Connecter mes outils' })).toBeInTheDocument()
    expect(screen.getByText('[à faire maintenant · 0]')).toBeInTheDocument()
  })
})

describe('#2387.14 — agenda seul', () => {
  it('l’agenda se lit « connecté », la messagerie reste « non connecté »', () => {
    mount(
      payload({
        agenda: {
          state: 'ready',
          reason: null,
          readAt: null,
          events: [event('evt-1', 3)],
          conflicts: [],
          needsPreparation: [],
        },
      }),
    )
    expect(screen.getByText(/ton agenda · connecté/)).toBeInTheDocument()
    expect(screen.getByText(/ta messagerie · non connecté/)).toBeInTheDocument()
  })
})

describe('#2387.14 — CRM seul (aucun connecteur, mais des affaires suivies)', () => {
  it('les cartes issues du pipe restent servies même sans agenda ni messagerie connectés', () => {
    mount(
      payload({
        actions: [
          briefingAction({ id: 'a-1', kind: 'project_stale' }),
          briefingAction({ id: 'a-2', kind: 'follow_up' }),
        ],
      }),
    )
    expect(screen.getByText(/ton agenda · non connecté/)).toBeInTheDocument()
    expect(screen.getByText(/ta messagerie · non connecté/)).toBeInTheDocument()
    // Une absence de connecteur ne fait taire QUE les blocs qui en dépendent —
    // les deux cartes venues du pipe (CRM) restent à l’écran.
    // BEL-SC-227 (#3256) — `project_stale` (opportunité) et `follow_up`
    // (important) tombent dans DEUX catégories distinctes : les DEUX partent
    // dans « Tes décisions », aucune ne reste dans « À faire maintenant » —
    // une carte promue ne se repropose pas ailleurs (GA-26).
    expect(screen.getByText('[à faire maintenant · 0]')).toBeInTheDocument()
    expect(screen.getByText('[décisions · 2]')).toBeInTheDocument()
  })
})

describe('#2387.14 — journée vide', () => {
  it('rien à préparer, rien à relancer : le vide est DIT, jamais une carte fabriquée pour "faire complet"', () => {
    mount(
      payload({
        agenda: { state: 'ready', reason: null, readAt: null, events: [], conflicts: [], needsPreparation: [] },
        mail: { state: 'ready', reason: null, readAt: null, awaitingReply: [], positiveReplies: [], unread: [] },
      }),
    )
    expect(screen.getByText('[à faire maintenant · 0]')).toBeInTheDocument()
    // `mail.empty` — le bloc messagerie (réel, non doublé ici) DIT le vide au
    // lieu de rester muet, même règle que l’en-tête (GA-18/19).
    expect(screen.getByText('Aucun fil à traiter.')).toBeInTheDocument()
  })
})

describe('#2387.14 — journée surchargée', () => {
  it('le plafond du serveur (BRIEFING_ACTIONS_MAX) arrive intact, aucune carte perdue en route', () => {
    const events = Array.from({ length: 4 }, (_, i) => event(`evt-${i}`, i + 1))
    const actions = Array.from({ length: BRIEFING_ACTIONS_MAX }, (_, i) =>
      briefingAction({ id: `a-${i}`, kind: i === 0 ? 'meeting_prep' : 'follow_up' }),
    )
    mount(
      payload({
        agenda: {
          state: 'ready',
          reason: null,
          readAt: null,
          events,
          conflicts: [{ first: events[0]!, second: events[1]!, overlapMinutes: 15 }],
          needsPreparation: [events[0]!],
        },
        actions,
      }),
    )
    // Sur bureau, `ActionsBlock` garde TOUTES les cartes, `meeting_prep`
    // compris : `PreparationsBlock` ne les extrait que sous 768px
    // (`BriefingPage.tsx`, « POSITION 4 : SOUS 768PX SEULEMENT ») — non
    // dupliqué ici, déjà couvert par la section mobile de `BriefingPage.test.tsx`.
    // BEL-SC-227 (#3256) — UNE carte part dans « Tes décisions » (toutes de
    // même tonalité `important` ici, une seule catégorie à remplir, la
    // PREMIÈRE de la liste — tri stable, #2095) : le plafond arrive intact
    // au TOTAL des deux sections, jamais une carte perdue, jamais une carte
    // comptée deux fois.
    expect(screen.getByText(`[à faire maintenant · ${BRIEFING_ACTIONS_MAX - 1}]`)).toBeInTheDocument()
    expect(screen.getByText('[décisions · 1]')).toBeInTheDocument()
  })
})

describe('#2387.14 — données partielles', () => {
  it('l’agenda le dit lui-même : « accès incomplet », jamais un silence qui se lit comme « rien »', () => {
    mount(
      payload({
        agenda: {
          state: 'partial',
          reason: 'Un de tes agendas n’a pas répondu.',
          readAt: null,
          events: [event('evt-1', 2)],
          conflicts: [],
          needsPreparation: [],
        },
      }),
    )
    expect(screen.getByText(/ton agenda · accès incomplet/)).toBeInTheDocument()
    // « Brief incomplet », jamais « complet » : `partial` compte comme
    // incomplet (#2098.23, `SourcesStrip.tsx`).
    expect(screen.getByText('Brief incomplet')).toBeInTheDocument()
  })
})

describe('#2387.14 — connecteur en panne', () => {
  it('« lecture en échec », jamais confondu avec « non connecté » ou « rien à faire »', () => {
    mount(
      payload({
        mail: {
          state: 'unavailable',
          reason: 'Ta messagerie n’a pas répondu.',
          readAt: null,
          awaitingReply: [],
          positiveReplies: [],
          unread: [],
        },
      }),
    )
    expect(screen.getByText(/ta messagerie · lecture en échec/)).toBeInTheDocument()
  })
})
