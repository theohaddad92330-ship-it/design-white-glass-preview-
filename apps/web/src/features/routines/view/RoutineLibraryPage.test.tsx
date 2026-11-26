import type { AutomationRuleView, RoutineView } from '@bellum/contracts'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    ...rest
  }: {
    children: React.ReactNode
    to: string
    params?: Record<string, string>
  }) => {
    const href = Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace(`$${key}`, value), to)
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    )
  },
}))
vi.mock('@/components/page/CustomerPage', () => import('@/features/automations/view/customerPageDouble'))
vi.mock('@/features/playbooks/view/PlaybooksBlock', () => ({ PlaybooksBlock: () => <div>Relances</div> }))
vi.mock('@/features/action-os/view/ApprovalSettingsCard', () => ({ ApprovalSettingsCard: () => null }))
vi.mock('@/components/primitives/AskLaura', () => ({
  AskLaura: ({ label }: { label: string }) => <button type="button">{label}</button>,
}))

const routines = vi.fn()
const runDue = vi.fn()
vi.mock('../api', () => ({
  useRoutines: () => routines(),
  useRunDueRoutines: () => runDue(),
  useUpdateRoutine: () => ({ mutate: vi.fn(), isPending: false }),
  useRoutineRuns: () => ({ data: undefined, isLoading: false }),
  useNoReplyFollowUpDryRun: () => ({ data: undefined, isLoading: false, isError: false }),
}))
const rules = vi.fn()
const trials = vi.fn()
vi.mock('@/features/automations/api', () => ({
  useAutomationRules: () => rules(),
  useAutomationTrials: () => trials(),
  useActivateAutomationTemplate: () => ({ mutate: vi.fn(), isPending: false }),
}))

const { RoutineLibraryPage } = await import('./RoutineLibraryPage')

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})

beforeEach(() => {
  runDue.mockReturnValue({ isPending: false, mutate: vi.fn(), data: undefined })
  rules.mockReturnValue({ data: undefined })
  trials.mockReturnValue({ data: undefined })
})

const user = () => userEvent.setup({ pointerEventsCheck: 0 })

function routine(
  key: RoutineView['definition']['key'],
  name: string,
  description: string,
  requires: RoutineView['definition']['requires'] = [],
  viewOver: Partial<RoutineView> = {},
): RoutineView {
  return {
    definition: {
      key,
      name: { fr: name, en: name },
      description: { fr: description, en: description },
      outcome: { fr: 'Une notification.', en: 'A notification.' },
      cadence: 'daily',
      defaultHour: 8,
      defaultWeekday: null,
      requires,
      defaultChannel: 'in_app',
      automationLevel: 'n1_prepare',
      condition: { fr: 'Quand il y a quelque chose.', en: 'When there is something.' },
      reads: { fr: 'Ton agenda.', en: 'Your calendar.' },
      fallback: { fr: 'Elle se tait et le dit.', en: 'It says so.' },
      acceptance: { fr: 'Une notification.', en: 'A notification.' },
      defaultEnabled: false,
      example: null,
      stopCondition: null,
      version: 1,
      roles: ['general'],
      workspaceProfiles: ['staffing', 'forfait_conseil'],
      scope: 'personal',
      steps: ['read', 'notify'],
      preparedActions: ['notification'],
      validations: ['review_before_acting'],
      budget: 'no_model_call',
    },
    subscription: {
      key,
      status: 'disabled',
      enabled: false,
      hour: 8,
      weekday: null,
      channel: 'in_app',
      timeZone: 'Europe/Paris',
      maxItemsPerRun: null,
      autonomy: null,
      ownerUserId: null,
    },
    blockers: [],
    lastRunAt: null,
    lastOutcome: null,
    nextTriggerAt: null,
    updated: false,
    ...viewOver,
  } as RoutineView
}

const CATALOG = [
  routine('meeting_prep', 'Préparation des rendez-vous', 'La veille au soir, la liste des rendez-vous.', [
    'agenda_read',
  ]),
  routine('mission_ending', 'Fins de mission à trente jours', 'Les missions qui se terminent.', ['ats'], {
    blockers: ['ats_not_connected'],
  }),
  routine('bench_alert', 'Consultants en intercontrat', 'Les talents sans mission.', ['ats']),
  routine('deal_close_date_soon', 'Échéance de décision proche', 'Une affaire à décider.', []),
]

function manyRoutines(count: number): RoutineView[] {
  const keys = [
    'daily_briefing',
    'meeting_prep',
    'no_reply_follow_up',
    'positive_replies',
    'agenda_conflicts',
    'empty_pipeline_alert',
    'weekly_recap',
    'weekly_forecast',
    'mission_ending',
    'bench_alert',
    'crm_followups',
    'stalled_projects',
    'stale_account_plans',
    'needs_without_shortlist',
    'parked_account_signal',
  ] as const
  return keys.slice(0, count).map((key, index) => routine(key, `Routine ${index + 1}`, `Description ${index + 1}`))
}

const mockData = (data: RoutineView[]) =>
  routines.mockReturnValue({ data, isLoading: false, isError: false, refetch: vi.fn() })

describe('RoutineLibraryPage — Théo C automations-bibliotheque', () => {
  it('l’en-tête de la maquette, et « Décrire mon besoin » mène à Laura', () => {
    mockData(CATALOG)
    render(<RoutineLibraryPage />)

    expect(screen.getByRole('heading', { level: 1, name: 'Des suivis prêts à adapter' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Décrire mon besoin' })).toBeInTheDocument()
  })

  it('A5 — « Lancer celles qui sont dues » est dans l’en-tête, à côté de « Décrire mon besoin » ; les relances restent repliées', async () => {
    const u = user()
    const mutate = vi.fn()
    runDue.mockReturnValue({ isPending: false, mutate, data: undefined })
    mockData(CATALOG)
    render(<RoutineLibraryPage />)

    const run = screen.getByRole('button', { name: 'Lancer celles qui sont dues' })
    expect(run.closest('details')).toBeNull()
    await u.click(run)
    expect(mutate).toHaveBeenCalled()
    expect(screen.getByText('Relances').closest('details')).not.toHaveAttribute('open')
  })

  it('A6 — les modèles de règle sur signal sont fusionnés dans la bibliothèque', () => {
    mockData(CATALOG)
    render(<RoutineLibraryPage />)
    expect(screen.getByText('Modèles prêts à activer')).toBeInTheDocument()
  })

  it('le guide métier est replié sous l’en-tête', () => {
    mockData(CATALOG)
    render(<RoutineLibraryPage />)
    expect(
      screen.getByText('Ce qu’est une automatisation, et le parcours utile').closest('details'),
    ).not.toHaveAttribute('open')
  })

  it('Théo C automations-bibliotheque — l’en-tête est déclaré à la coque, puis guide, sous-onglets, filtres, catalogue', () => {
    mockData(CATALOG)
    const { container } = render(<RoutineLibraryPage />)
    const head = screen.getByTestId('page-head')
    expect(within(head).getByRole('heading', { level: 1, name: 'Des suivis prêts à adapter' })).toBeInTheDocument()
    expect(within(head).getByRole('button', { name: 'Lancer celles qui sont dues' })).toBeInTheDocument()
    expect(within(head).getByRole('button', { name: 'Décrire mon besoin' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    const order = [
      container.querySelector('details')!,
      screen.getByRole('navigation', { name: 'Automatisations' }),
      container.querySelector('[data-section="filters"]')!,
      container.querySelector('[data-section="catalog"]')!,
    ]
    for (let index = 1; index < order.length; index += 1) {
      expect(Boolean(order[index - 1].compareDocumentPosition(order[index]) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(
        true,
      )
    }
  })

  it('Théo C automations-bibliotheque — une carte : symbole et famille, titre, phrase, outils lus, puis les deux gestes', () => {
    mockData(CATALOG)
    const { container } = render(<RoutineLibraryPage />)
    const card = container.querySelector('[data-routine-card]')!
    const heading = within(card as HTMLElement).getByRole('heading', { level: 3 })
    const see = within(card as HTMLElement).getByRole('button', { name: /^Voir le fonctionnement/ })
    const adapt = within(card as HTMLElement).getByRole('button', { name: /^Adapter/ })
    expect(Boolean(heading.compareDocumentPosition(see) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    expect(Boolean(see.compareDocumentPosition(adapt) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
  })

  it('R1 — le compteur dit « N modèles » et le filtre se fait par FAMILLE métier', async () => {
    const u = user()
    mockData(CATALOG)
    render(<RoutineLibraryPage />)

    expect(screen.getByText('4 modèles')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: /^Missions & factures/ }))

    expect(screen.getByText('1 modèle')).toBeInTheDocument()
    expect(screen.getByText('Fins de mission à trente jours')).toBeInTheDocument()
    expect(screen.queryByText('Consultants en intercontrat')).not.toBeInTheDocument()

    // Multi-sélection : une seconde famille s'ajoute, elle ne remplace pas la première.
    await u.click(screen.getByRole('button', { name: /^Talents & staffing/ }))
    expect(screen.getByText('Fins de mission à trente jours')).toBeInTheDocument()
    expect(screen.getByText('Consultants en intercontrat')).toBeInTheDocument()
  })

  it('la recherche filtre sur le nom et sur la phrase', async () => {
    const u = user()
    mockData(CATALOG)
    render(<RoutineLibraryPage />)

    await u.type(screen.getByRole('searchbox', { name: 'Rechercher une routine' }), 'intercontrat')

    expect(screen.getByText('Consultants en intercontrat')).toBeInTheDocument()
    expect(screen.queryByText('Préparation des rendez-vous')).not.toBeInTheDocument()
  })

  it('aucun résultat : le dit, et rend toute la bibliothèque d’un geste', async () => {
    const u = user()
    mockData(CATALOG)
    render(<RoutineLibraryPage />)

    await u.type(screen.getByRole('searchbox', { name: 'Rechercher une routine' }), 'zzzz')
    expect(screen.getByText('Aucune routine ne correspond à cette recherche.')).toBeInTheDocument()

    await u.click(screen.getByRole('button', { name: 'Tout afficher' }))
    expect(screen.getByText('4 modèles')).toBeInTheDocument()
  })

  it('N5 — douze à la fois, « Afficher les suivants » en donne douze de plus', async () => {
    const u = user()
    mockData(manyRoutines(15))
    render(<RoutineLibraryPage />)

    const list = screen.getByRole('list', { name: 'Routines de la bibliothèque' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(12)

    await u.click(screen.getByRole('button', { name: 'Afficher les suivants' }))
    expect(within(list).getAllByRole('listitem')).toHaveLength(15)
    expect(screen.queryByRole('button', { name: 'Afficher les suivants' })).not.toBeInTheDocument()
  })

  it('N1/N2 — chaque carte nomme les outils LUS ; un outil non branché le dit, pour de vrai', () => {
    mockData(CATALOG)
    render(<RoutineLibraryPage />)

    const cards = within(screen.getByRole('list', { name: 'Routines de la bibliothèque' })).getAllByRole('listitem')
    expect(within(cards[0] as HTMLElement).getByText('Ton agenda')).toBeInTheDocument()
    expect(within(cards[1] as HTMLElement).getByText('Ton ATS · à connecter')).toBeInTheDocument()
    // Un ATS branché ne porte aucune mention.
    expect(within(cards[2] as HTMLElement).getByText('Ton ATS')).toBeInTheDocument()
    // Une routine qui ne lit que l’espace le dit.
    expect(within(cards[3] as HTMLElement).getByText('Ton espace')).toBeInTheDocument()
  })

  it('l’état de la routine se lit sans ouvrir la fenêtre', () => {
    mockData([
      routine('meeting_prep', 'Préparation des rendez-vous', 'Phrase.', ['agenda_read'], {
        subscription: {
          key: 'meeting_prep',
          status: 'active',
          enabled: true,
          hour: 8,
          weekday: null,
          channel: 'in_app',
          timeZone: 'Europe/Paris',
          maxItemsPerRun: null,
          autonomy: null,
          ownerUserId: null,
        },
      }),
    ])
    render(<RoutineLibraryPage />)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('R2/R3 — « Voir le fonctionnement » ouvre la fenêtre, « Adapter » l’ouvre sur les Réglages', async () => {
    const u = user()
    mockData(CATALOG)
    render(<RoutineLibraryPage />)

    await u.click(screen.getByRole('button', { name: /Voir le fonctionnement : Préparation des rendez-vous/ }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Préparation des rendez-vous')
    expect(screen.getByRole('tab', { name: 'Comment ça marche' })).toHaveAttribute('aria-selected', 'true')
    await u.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await u.click(screen.getByRole('button', { name: /Adapter : Préparation des rendez-vous/ }))
    expect(screen.getByRole('tab', { name: 'Réglages' })).toHaveAttribute('aria-selected', 'true')
  })

  it('un lien entrant `?routine=<clé>` rouvre la fenêtre de CETTE routine (ancienne fiche /settings/routines/:key)', () => {
    mockData(CATALOG)
    render(<RoutineLibraryPage openKey="bench_alert" />)
    expect(screen.getByRole('dialog')).toHaveTextContent('Consultants en intercontrat')
  })

  it('N4 — trois sous-onglets ; la bibliothèque est la page courante, le journal ne montre pas de « 0 » inventé', () => {
    mockData(CATALOG)
    rules.mockReturnValue({ data: [{ id: 'r1' }, { id: 'r2' }] as AutomationRuleView[] })
    trials.mockReturnValue({ data: [] })
    render(<RoutineLibraryPage />)

    const nav = screen.getByRole('navigation', { name: 'Automatisations' })
    expect(within(nav).getByRole('link', { name: /Bibliothèque de routines/ })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: /Mes automatisations/ })).toHaveTextContent('2')
    expect(within(nav).getByRole('link', { name: 'Journal des essais' })).toHaveAttribute(
      'href',
      '/actions/automatisations/journal',
    )
  })

  it('une erreur de lecture ne laisse pas une page vide', () => {
    routines.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() })
    render(<RoutineLibraryPage />)
    expect(screen.getByRole('button', { name: /réessayer/i })).toBeInTheDocument()
  })
})
