import type { AgendaEvent, BriefingAction, PersonalCockpitResponse } from '@bellum/contracts'
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

/**
 * #4297.2 — le Cockpit commercial répond d'abord à « où j'en suis » : tâches,
 * actions, planning, brouillons, collègues, VISIBLES sans défilement à
 * 1440×900. Rien n'est retiré (le rôle et la place changent l'ORDRE, jamais le
 * CONTENU) : ces cinq lectures montent AVANT le recul (verdict, sections
 * repliées), et les brouillons sortent du repli « depuis ta dernière visite »
 * où il fallait un clic pour les voir.
 */
const DRAFT: BriefingAction = {
  id: 'a1',
  kind: 'account',
  labelKey: 'briefing.actions.followUp',
  labelVars: {},
  href: null,
  priority: 1,
  fact: null,
  context: null,
  preparedArtifacts: [
    {
      id: 'd1',
      kind: 'draft_message',
      labelKey: 'briefing.artifacts.draft',
      labelVars: {},
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

describe('PersonalCockpit — #4297.2, ma journée avant le recul', () => {
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
    const inOneHour = new Date(Date.now() + 60 * 60_000)
    const fixture = agendaFixture([
      event({
        id: '1',
        start: inOneHour.toISOString(),
        end: new Date(inOneHour.getTime() + 30 * 60_000).toISOString(),
      }),
    ])
    dailyBriefing.mockReturnValue(
      ok({ ...fixture, tasks: { ...fixture.tasks, tasks: [{ id: 't1' }, { id: 't2' }] }, actions: [DRAFT] }),
    )
  })

  it('compte les tâches ouvertes parmi les compteurs, avec leur portée', async () => {
    await mount()
    const list = screen.getByRole('list', { name: 'Mes chiffres' })
    // Grammaire Théo « stat » : le libellé au-dessus, le chiffre dessous.
    expect(list.textContent).toMatch(/Tâches ouvertes\s*2/)
  })

  it('les brouillons préparés se lisent SANS ouvrir de repli', async () => {
    await mount()
    // Un `CollapsedSection` fermé ne monte pas son contenu : présent = lisible
    // sans clic (avant #4297.2, ce texte était introuvable ici).
    expect(screen.getByText('1 brouillon prêt à relire')).toBeInTheDocument()
  })

  it('ordre : compteurs → planning → brouillons, puis le recul', async () => {
    await mount()
    const kpis = screen.getByRole('list', { name: 'Mes chiffres' })
    const agenda = screen.getByTestId('briefing-agenda-compact')
    const drafts = screen.getByText('1 brouillon prêt à relire')
    const recul = screen.getByText('Mes prochaines étapes')
    const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(follows(kpis, agenda)).toBe(true)
    expect(follows(agenda, drafts)).toBe(true)
    expect(follows(drafts, recul)).toBe(true)
  })

  it('refonte Théo (`.v18-grid`) : la journée en colonne d’appoint à droite, le recul dans la colonne de travail', async () => {
    await mount()
    const dayColumn = screen.getByTestId('briefing-agenda-compact').closest('.lg\\:col-start-2')
    const reculColumn = screen.getByText('Mes prochaines étapes').closest('.lg\\:col-start-1')
    expect(dayColumn).not.toBeNull()
    expect(reculColumn).not.toBeNull()
    // NON : les deux colonnes sont sœurs dans la MÊME grille 1fr / 310 px, jamais empilées.
    expect(dayColumn!.parentElement).toBe(reculColumn!.parentElement)
    expect(dayColumn!.parentElement!.className).toContain('lg:grid-cols-[minmax(0,1fr)_19.5rem]')
    expect(dayColumn).toContainElement(screen.getByText('1 brouillon prêt à relire'))
    expect(screen.getByRole('link', { name: 'Ouvrir l’agenda du jour' })).toHaveAttribute('href', '/briefing')
  })
})
