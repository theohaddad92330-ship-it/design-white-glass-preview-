import { SINCE_LAST_VISIT_LINES } from '@bellum/contracts'
import type {
  BriefingAction,
  PersonalCockpitResponse,
  SinceLastVisitDigest,
  SinceLastVisitLine,
} from '@bellum/contracts'
import { fireEvent, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/**
 * #2106.21/.22/.23 — RÉFUTÉS ÉCRAN le 25/09/2026 nuit (prod ccd3ca0b44) :
 * `/dashboard` ne montrait ni le bloc compact « BellumAI a préparé pour toi »
 * ni les lignes cliquables « Nouveaux signaux »/« Réponses reçues ». Les DEUX
 * existaient déjà, testés isolément (`ActionsBlock.test.tsx`,
 * `SinceLastVisitBlock.test.tsx`) — mais seul `BriefingPage` (« Aujourd'hui »)
 * les montait. Ce fichier prouve qu'ils sont désormais montés dans l'écran
 * RÉEL que l'épopée #2106 nomme : `PersonalCockpit` (`/dashboard`).
 *
 * Un fichier séparé de `PersonalCockpit.test.tsx` (même patron que
 * `PersonalCockpit.collapsed.test.tsx`) : les fixtures ici sont celles de
 * `useDailyBriefing`/`useLastSeen`/`useActionHistory`/`useSinceLastVisit`,
 * pas celles de `usePersonalCockpit` que l'autre fichier couvre déjà.
 */

const { mockCockpit } = vi.hoisted(() => ({ mockCockpit: vi.fn() }))
vi.mock('../../hooks/usePersonalCockpit', () => ({ usePersonalCockpit: () => mockCockpit() }))

const lastSeen = vi.fn()
const history = vi.fn()
const digest = vi.fn()
const dailyBriefing = vi.fn()

vi.mock('@/features/action-history/hooks/useActionHistory', () => ({
  useLastSeen: () => lastSeen(),
  useActionHistory: () => history(),
}))
vi.mock('@/features/briefing/api', () => ({
  useSinceLastVisit: () => digest(),
  useDailyBriefing: () => dailyBriefing(),
}))

const EMPTY_COCKPIT: PersonalCockpitResponse = {
  kpis: { my_accounts: 0, relances_open: 0, relances_overdue: 0, messages_this_week: 0 },
  priorities: [],
  relances: [],
  accounts: [],
  messages: [],
}

const idle = { data: undefined, isLoading: false, isError: false }
const ok = <T,>(data: T) => ({ data, isLoading: false, isError: false })
const SINCE = '2026-09-20T08:00:00.000Z'

function lines(...overrides: SinceLastVisitLine[]) {
  const byKind = new Map(overrides.map(line => [line.kind, line]))
  return ok<SinceLastVisitDigest>({
    since: SINCE,
    lines: SINCE_LAST_VISIT_LINES.map(
      kind => byKind.get(kind) ?? { kind, state: 'ready' as const, reason: null, count: 0, scope: null },
    ),
    expiredItemsCount: null,
    treatedByColleagueCount: null,
  })
}

function briefingAction(id: string): BriefingAction {
  return {
    id,
    labelKey: 'briefing.actions.followUp',
    labelVars: {},
    href: '/mailbox?intent=no_reply&thread=t1',
    kind: 'follow_up',
    priority: 4,
    fact: {
      labelKey: null,
      labelVars: {},
      provenance: { source: 'connector', capability: 'mailbox', observedAt: '2026-08-25T09:00:00.000Z' },
    },
    context: null,
    // Un artefact « shortlist », prêt : ce qui doit compter dans le bloc
    // compact « BellumAI a préparé pour toi ».
    preparedArtifacts: [
      {
        id: `shortlist:${id}`,
        kind: 'shortlist',
        labelKey: 'briefing.artifacts.meetingAttendees',
        labelVars: { count: 3 },
        href: null,
        businessObject: null,
        preparedAt: null,
        version: 1,
        source: null,
        status: 'ready',
        preparedBy: 'laura',
        creditsCost: null,
      },
    ],
    expiresAt: null,
    businessObject: null,
    verdict: null,
    consequence: null,
    confidence: null,
    estimatedMinutes: null,
    rankingAxes: [],
    processingState: 'suggested',
    owner: null,
    permission: null,
  }
}

async function mount() {
  const result = renderWithRouter(<PersonalCockpit />)
  await screen.findByText('Mon portefeuille')
  for (const toggle of screen.queryAllByRole('button')) {
    if (toggle.getAttribute('aria-expanded') === 'false') {
      fireEvent.click(toggle)
    }
  }
  return result
}

const { PersonalCockpit } = await import('./PersonalCockpit')

describe('PersonalCockpit — le digest de retour d’absence (#2106.21/.22/.23)', () => {
  beforeEach(() => {
    mockCockpit.mockReturnValue({ loading: false, data: EMPTY_COCKPIT })
    lastSeen.mockReturnValue(ok({ since: SINCE }))
    history.mockReturnValue(
      ok({
        data: [],
        pagination: { currentPage: 1, size: 4, totalItems: 0, totalPages: 1, hasNext: false, hasPrev: false },
      }),
    )
  })

  it('monte le bloc compact « BellumAI a préparé pour toi » avec les actions du jour', async () => {
    dailyBriefing.mockReturnValue(
      ok({
        tasks: { state: 'ready', reason: null, tasks: [], overdueCount: 0, todayCount: 0 },
        actions: [briefingAction('a1')],
      }),
    )
    digest.mockReturnValue(lines())
    await mount()
    expect(screen.getByText(/a préparé/i)).toBeInTheDocument()
    expect(screen.getByText(/1 liste courte prête/i)).toBeInTheDocument()
  })

  it('ne montre AUCUN bloc compact tant que le brief du jour n’a rien à compter', async () => {
    dailyBriefing.mockReturnValue(idle)
    digest.mockReturnValue(lines())
    await mount()
    expect(screen.queryByText(/a préparé/i)).not.toBeInTheDocument()
  })

  it('monte « Nouveaux signaux », cliquable, vers /accounts?headline=newSignals7d', async () => {
    dailyBriefing.mockReturnValue(idle)
    digest.mockReturnValue(lines({ kind: 'account_signals', state: 'ready', reason: null, count: 3, scope: 2 }))
    await mount()
    expect(screen.getByText('3 nouveaux signaux sur 2 comptes')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /3 nouveaux signaux/ })).toHaveAttribute(
      'href',
      '/accounts?headline=newSignals7d',
    )
  })

  it('monte « Réponses reçues », cliquable, vers /mailbox?intent=unread', async () => {
    dailyBriefing.mockReturnValue(idle)
    digest.mockReturnValue(lines({ kind: 'replies_received', state: 'ready', reason: null, count: 2, scope: null }))
    await mount()
    expect(screen.getByText('2 réponses reçues')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /2 réponses reçues/ })).toHaveAttribute('href', '/mailbox?intent=unread')
  })
})
