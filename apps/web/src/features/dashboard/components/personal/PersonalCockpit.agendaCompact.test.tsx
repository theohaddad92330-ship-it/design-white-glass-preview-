import type { AgendaEvent, PersonalCockpitResponse } from '@bellum/contracts'
import { screen } from '@testing-library/react'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/**
 * #2108.36 — « Agenda devient compact » sur /dashboard.
 *
 * `AgendaCompact` (#2101.1/.2) existe déjà, testée isolément
 * (`AgendaCompact.test.tsx`) et montée sur `/briefing` — mais aucun appelant
 * ne la posait ICI, sur `/dashboard`, l'écran nommé par #2108.36 (recette
 * écran du 18/09 : « ABSENT : aucun widget agenda ni calendrier »). Même
 * patron que #2106.21/.22/.23 (`PersonalCockpit.absenceDigest.test.tsx`) :
 * un appelant de plus sur une capacité déjà là, jamais un second calcul
 * (GA-26). `useDailyBriefing` est DÉJÀ lu par `PersonalCockpit` pour le
 * digest de retour d'absence — cette ligne réutilise la MÊME requête.
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
const SINCE = '2026-09-25T08:00:00.000Z'

function event(overrides: Partial<AgendaEvent> & Pick<AgendaEvent, 'id' | 'start' | 'end'>): AgendaEvent {
  return {
    summary: null,
    description: null,
    location: null,
    organizer: null,
    attendees: [],
    conferenceUrl: null,
    webUrl: null,
    status: null,
    isExternal: true,
    cancelled: false,
    ...overrides,
  }
}

function agendaFixture(events: AgendaEvent[]) {
  return {
    tasks: { state: 'ready' as const, reason: null, tasks: [], overdueCount: 0, todayCount: 0 },
    actions: [],
    agenda: {
      state: 'ready' as const,
      reason: null,
      observedAt: SINCE,
      events,
      conflicts: [],
      needsPreparation: [],
      meetingsWithoutFollowup: [],
    },
    protectedTime: null,
    agendaPreferences: {},
  }
}

async function mount() {
  const result = renderWithRouter(<PersonalCockpit />)
  await screen.findByText('Mon portefeuille')
  return result
}

const { PersonalCockpit } = await import('./PersonalCockpit')

describe('PersonalCockpit — agenda compact (#2108.36)', () => {
  beforeEach(() => {
    mockCockpit.mockReturnValue({ loading: false, data: EMPTY_COCKPIT })
    lastSeen.mockReturnValue(ok({ since: SINCE }))
    history.mockReturnValue(
      ok({
        data: [],
        pagination: { currentPage: 1, size: 4, totalItems: 0, totalPages: 1, hasNext: false, hasPrev: false },
      }),
    )
    digest.mockReturnValue(ok(undefined))
  })

  it('monte la ligne compacte d’agenda quand la source a répondu', async () => {
    // Des créneaux futurs, relatifs à l'instant du test (`useNow`, non mocké
    // ici) — une date FIXE passée finirait filtrée par `agendaCompactSummary`
    // (« la fenêtre À VENIR »), quelle que soit la date du dépôt.
    const inOneHour = new Date(Date.now() + 60 * 60_000)
    const inFiveHours = new Date(Date.now() + 5 * 60 * 60_000)
    dailyBriefing.mockReturnValue(
      ok(
        agendaFixture([
          event({
            id: '1',
            start: inOneHour.toISOString(),
            end: new Date(inOneHour.getTime() + 30 * 60_000).toISOString(),
          }),
          event({
            id: '2',
            start: inFiveHours.toISOString(),
            end: new Date(inFiveHours.getTime() + 30 * 60_000).toISOString(),
          }),
        ]),
      ),
    )
    await mount()
    expect(screen.getByTestId('briefing-agenda-compact')).toBeInTheDocument()
  })

  it('F2-FIX — la ligne dit CE QU’ELLE COMPTE : plus de « 1 interne » orphelin sous les chiffres', async () => {
    const inOneHour = new Date(Date.now() + 60 * 60_000)
    dailyBriefing.mockReturnValue(
      ok(
        agendaFixture([
          event({
            id: '1',
            start: inOneHour.toISOString(),
            end: new Date(inOneHour.getTime() + 30 * 60_000).toISOString(),
          }),
        ]),
      ),
    )
    await mount()
    const line = screen.getByTestId('briefing-agenda-compact')
    expect(line.textContent).toMatch(/^Ton agenda du jour : /)
  })

  it('ne montre rien tant que l’agenda n’a pas répondu', async () => {
    dailyBriefing.mockReturnValue(idle)
    await mount()
    expect(screen.queryByTestId('briefing-agenda-compact')).not.toBeInTheDocument()
  })

  it('ne montre rien si la source agenda n’est pas connectée', async () => {
    dailyBriefing.mockReturnValue(
      ok({
        ...agendaFixture([]),
        agenda: { ...agendaFixture([]).agenda, state: 'not_connected' as const },
      }),
    )
    await mount()
    expect(screen.queryByTestId('briefing-agenda-compact')).not.toBeInTheDocument()
  })
})
