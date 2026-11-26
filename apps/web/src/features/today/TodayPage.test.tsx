import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type {
  AtsWriteRequestView,
  BriefingAction,
  CrmWriteRequestView,
  MyPlanAction,
  OutreachMessage,
  PlaybookApproval,
} from '@bellum/contracts'
import { BRIEFING_ACTIONS_SHOWN } from '@bellum/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTodayItems, type TodayItem } from './todayQueue'

vi.mock('@/features/briefing/hooks/useAccountLastOutcome', () => ({ useAccountLastOutcome: vi.fn(() => null) }))
vi.mock('@tanstack/react-router', async () => {
  const { forwardRef } = await import('react')
  return {
    Link: forwardRef<
      HTMLAnchorElement,
      { children: React.ReactNode; to: string; params?: Record<string, string>; search?: Record<string, string> }
    >(({ children, to, params, search, ...rest }, ref) => (
      <a
        {...rest}
        ref={ref}
        href={`${params ? to.replace('$id', params.id ?? '') : to}${search ? `?${new URLSearchParams(search)}` : ''}`}
      >
        {children}
      </a>
    )),
  }
})
// Théo C actions-aujourdhui.N3 — les brouillons de la messagerie : fixture mutable.
const draftsFixture = vi.hoisted(() => ({ total: 0 }))
vi.mock('@/features/mailbox/api', () => ({
  useMyMessageDrafts: () => ({ data: { items: [], total: draftsFixture.total } }),
}))
vi.mock('./HistoryDrawer', () => ({
  HistoryDrawer: ({ open }: { open: boolean }) => (open ? <div data-testid="history-drawer" /> : null),
}))
vi.mock('@/features/crm/view/CrmWriteQueueState', () => ({ CrmWriteQueueState: () => null }))
vi.mock('@/features/actions/components/AwaitingOutcomeQueue', () => ({ AwaitingOutcomeQueue: () => null }))
vi.mock('@/features/actions/components/SendTimingLine', () => ({ SendTimingLine: () => null }))
vi.mock('@/features/actions/components/CallbackDateDialog', () => ({ CallbackDateDialog: () => null }))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))
vi.mock('@/features/briefing/view/TodayAddTaskButton', () => ({
  TodayAddTaskButton: () => <button type="button">Ajouter une tâche</button>,
}))
// #2397.6 / #2107 — le débordement du brief se lit SANS le plafond d'« Aujourd'hui » ; fixture mutable.
const briefingFixture = vi.hoisted(() => ({ actions: [] as BriefingAction[] }))
vi.mock('@/features/briefing/api', () => ({
  useAllBriefingActions: () => ({ data: briefingFixture.actions }),
  useDailyBriefing: () => ({ data: undefined }),
  useSetRoleFit: () => ({ mutate: vi.fn(), isPending: false }),
  useSetCardDisposition: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}))
vi.mock('@/features/actions/hooks/usePlanItems', () => ({ usePlanItems: () => ({ items: [] }) }))
vi.mock('@/lib/product-tracker', () => ({
  trackPriorityViewed: vi.fn(),
  trackPriorityAccepted: vi.fn(),
  trackPrioritySnoozed: vi.fn(),
  trackPriorityRejected: vi.fn(),
  trackPriorityCorrected: vi.fn(),
}))

const gestures = vi.hoisted(() => ({
  validate: vi.fn(async () => true),
  reject: vi.fn(async () => true),
  rejectBatch: vi.fn(async (_items: unknown) => true),
  postpone: vi.fn(async () => true),
  complete: vi.fn(async (_item: unknown, _choice?: unknown) => true),
  saveDraft: vi.fn(async () => true),
  reviseCrm: vi.fn(async (_item: unknown, _changes: unknown) => true),
  assign: vi.fn(async () => true),
  isPending: () => false,
}))
vi.mock('./useTodayGestures', async importOriginal => ({
  // #4666 — `declarableChannel` (lot appelant) est une fonction pure lue par TodayCard : on garde la vraie.
  declarableChannel: (await importOriginal<typeof import('./useTodayGestures')>()).declarableChannel,
  CALL_OUTCOMES: ['completed', 'no_answer', 'callback', 'qualified', 'refused', 'wrong_person'],
  useTodayGestures: () => gestures,
}))

const source = vi.hoisted(() => ({
  items: [] as TodayItem[],
  loading: false,
  unavailable: [] as string[],
  hasMandate: false,
  crmStatus: undefined,
  crmUnread: false,
}))
vi.mock('./useTodaySources', () => ({ useTodaySources: () => source }))

import { TodayPage } from './TodayPage'

/**
 * Refonte Théo (C · actions-aujourdhui) — la file est une liste DENSE : chaque tâche est une rangée
 * qui s'OUVRE (sa carte, brouillon et gestes, dans une fenêtre). Les tests de la carte l'ouvrent
 * d'abord, comme le commercial ; un lot d'écritures CRM reste une carte posée dans la liste.
 */
function renderOpen() {
  const result = render(<TodayPage />)
  const row = document.querySelector<HTMLButtonElement>('[data-slot="today-task-row"]')
  if (row) fireEvent.click(row)
  return result
}

// Mercredi 14/10/2026, 10 h.
const NOW = new Date(2026, 9, 14, 10, 0, 0)

const plan = (over: Partial<MyPlanAction>): MyPlanAction =>
  ({
    id: 'p1',
    account_id: 'a1',
    company_name: 'Acme',
    label: 'Relancer le DSI',
    due_date: '2026-10-14',
    channel: 'email',
    reason: null,
    contact_id: null,
    target: null,
    ...over,
  }) as MyPlanAction

const message = (over: Partial<OutreachMessage> = {}): OutreachMessage =>
  ({
    id: 'm1',
    contact_id: 'c1',
    contact_name: 'Marie Dubois',
    account_name: 'Acme',
    channel: 'email',
    subject: 'Bonjour Marie',
    body: 'Bonjour Marie,\nVotre DSI recrute.',
    status: 'needs_review',
    view: 'to_review',
    blockers: [],
    can_approve: true,
    sequence_id: null,
    sequence_step_id: null,
    current_version: 1,
    reason: 'Signal : nouveau DSI',
    ...over,
  }) as OutreachMessage

const EMPTY = {
  approvals: [],
  crm: [],
  erp: [],
  sends: [],
  messages: [],
  plan: [],
  sequences: [],
  calls: [],
  tasks: [],
}
const openMore = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /Autres gestes/ }))
const load = (over: Partial<Parameters<typeof buildTodayItems>[0]>) => {
  source.items = buildTodayItems({ ...EMPTY, ...over }, NOW)
}

beforeEach(() => {
  draftsFixture.total = 0
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  source.items = []
  source.hasMandate = false
  source.unavailable = []
  source.loading = false
  briefingFixture.actions = []
  for (const spy of Object.values(gestures)) if (typeof spy === 'function' && 'mockClear' in spy) spy.mockClear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Aujourd’hui — la file unique', () => {
  it('Théo C actions-aujourdhui.R1 — titre « Tes actions » + phrase fixe, plus de sous-titre chiffré ; jamais de probabilité', () => {
    load({
      plan: [
        plan({ id: 'late', due_date: '2026-10-12', label: 'Retard' }),
        plan({ id: 'now', due_date: '2026-10-14', label: 'Maintenant' }),
        plan({ id: 'wk', due_date: '2026-10-16', label: 'Semaine' }),
      ],
    })
    render(<TodayPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Tes actions' })).toBeInTheDocument()
    expect(screen.getByText(/préparer avec Laura et décider de la suite/)).toBeInTheDocument()
    expect(screen.queryByText(/actions? à traiter aujourd/)).not.toBeInTheDocument()
    expect(screen.queryByText(/geste/)).not.toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  it('Théo C actions-aujourdhui.N5 — la doctrine est dite : ouvrir et préparer ne traitent rien, « Fait » n’est pas une preuve d’envoi', () => {
    load({ plan: [plan({})] })
    render(<TodayPage />)
    expect(screen.getByText(/aucun traitement automatique/)).toBeInTheDocument()
  })

  it('Théo C actions-aujourdhui.R2 / N2 — pastilles d’état : « Toutes » compte la file, un état sans ligne n’existe pas', async () => {
    const user = userEvent.setup()
    load({ plan: [plan({ id: 'p1', label: 'Relance A' }), plan({ id: 'p2', label: 'Relance B' })] })
    render(<TodayPage />)
    const pills = screen.getByRole('group', { name: 'Filtrer par état' })
    expect(within(pills).getByRole('button', { name: /Non commencées/ })).toBeInTheDocument()
    expect(within(pills).queryByRole('button', { name: /En cours/ })).not.toBeInTheDocument()
    expect(within(pills).queryByRole('button', { name: /À valider/ })).not.toBeInTheDocument()
    expect(within(pills).getByRole('button', { name: /Toutes/ })).toHaveTextContent('2')
    await user.click(within(pills).getByRole('button', { name: /Non commencées/ }))
    expect(screen.getByText('Relance A')).toBeInTheDocument()
    await user.click(within(pills).getByRole('button', { name: /Toutes/ }))
    expect(screen.getByText('Relance B')).toBeInTheDocument()
  })

  it('Théo C actions-aujourdhui.R2 — « Terminées » ouvre le tiroir Historique, ce n’est pas un état de la file', async () => {
    const user = userEvent.setup()
    load({ plan: [plan({})] })
    render(<TodayPage />)
    await user.click(
      within(screen.getByRole('group', { name: 'Filtrer par état' })).getByRole('button', { name: /Terminées/ }),
    )
    expect(screen.getByTestId('history-drawer')).toBeInTheDocument()
  })

  it('Théo C actions-aujourdhui.N3 — « N brouillons dans ta messagerie » + lien ; zéro brouillon, aucune ligne', () => {
    load({ plan: [plan({})] })
    draftsFixture.total = 4
    const { unmount } = render(<TodayPage />)
    expect(screen.getByText('4 brouillons dans ta messagerie')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ouvrir les brouillons' })).toHaveAttribute('href', '/mailbox')
    unmount()
    draftsFixture.total = 0
    render(<TodayPage />)
    expect(screen.queryByText(/dans ta messagerie/)).not.toBeInTheDocument()
  })

  it('range en sections par échéance puis en groupes par geste, avec leur compteur', () => {
    load({
      plan: [
        plan({ id: 'late', due_date: '2026-10-12', label: 'Retard mail' }),
        plan({ id: 'now1', due_date: '2026-10-14', label: 'Mail du jour' }),
        plan({ id: 'now2', due_date: '2026-10-14', label: 'Autre mail' }),
        plan({ id: 'li', due_date: '2026-10-14', channel: 'linkedin', label: 'Message LinkedIn' }),
        plan({ id: 'wk', due_date: '2026-10-16', channel: 'phone', label: 'Appel semaine' }),
      ],
      messages: [message()],
    })
    render(<TodayPage />)
    const headings = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
    expect(headings).toEqual(['En retard', 'Aujourd’hui', 'Cette semaine'])
    const today = screen.getByRole('region', { name: 'Aujourd’hui' })
    const groups = within(today)
      .getAllByRole('group')
      .map(group => group.getAttribute('aria-label'))
    expect(groups).toEqual(['À valider', 'E-mails', 'Réseau professionnel'])
    const emails = within(today).getByRole('group', { name: 'E-mails' })
    expect(within(emails).getByRole('heading', { level: 3 })).toHaveTextContent('E-mails2')
    expect(within(emails).getByRole('button', { name: /Traiter E-mails : 2/ })).toHaveTextContent('Traiter (2)')
  })

  it('un groupe ou une section vide n’existe pas : jamais de « 0 »', () => {
    load({ plan: [plan({ channel: 'phone' })] })
    render(<TodayPage />)
    expect(
      screen.getAllByRole('group').filter(group => group.getAttribute('aria-label') !== 'Filtrer par état'),
    ).toHaveLength(1)
    expect(screen.queryByRole('group', { name: 'E-mails' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'En retard' })).not.toBeInTheDocument()
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument()
  })

  it('« Plus tard » est repliée jusqu’à ce qu’on la déplie', async () => {
    const user = userEvent.setup()
    load({ plan: [plan({ id: 'far', due_date: '2026-12-01', label: 'Bien plus tard' })] })
    render(<TodayPage />)
    expect(screen.getByRole('heading', { name: 'Plus tard' })).toBeInTheDocument()
    expect(screen.queryByText('Bien plus tard')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Afficher (1)' }))
    expect(screen.getByText('Bien plus tard')).toBeInTheDocument()
  })

  it('file vide : « Rien à traiter aujourd’hui » et un lien vers les séquences', () => {
    render(<TodayPage />)
    expect(screen.getAllByText('Rien à traiter aujourd’hui').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Voir les séquences' })).toHaveAttribute('href', '/actions/sequences')
  })

  it('une source illisible est NOMMÉE : la file n’est pas présentée comme complète', () => {
    source.unavailable = ['calls']
    render(<TodayPage />)
    expect(screen.getByRole('status')).toHaveTextContent('Lecture impossible : appels')
    // une file amputée n'est jamais annoncée « vide » ni « rien à traiter »
    expect(screen.queryByText('Rien à traiter aujourd’hui')).not.toBeInTheDocument()
  })

  it('arrivée depuis la tuile « En retard » : seule la section en retard est montrée, avec un moyen de tout voir', async () => {
    const onClear = vi.fn()
    load({
      plan: [plan({ id: 'late', due_date: '2026-10-12', label: 'Retard' }), plan({ id: 'now', label: 'Maintenant' })],
    })
    render(<TodayPage overdueOnly onClearOverdue={onClear} />)
    expect(screen.getByText('Retard')).toBeInTheDocument()
    expect(screen.queryByText('Maintenant')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tout afficher' }))
    expect(onClear).toHaveBeenCalled()
  })

  it('le bouton Historique ouvre le tiroir', async () => {
    render(<TodayPage />)
    expect(screen.queryByTestId('history-drawer')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Historique' }))
    expect(screen.getByTestId('history-drawer')).toBeInTheDocument()
  })
})

describe('Aujourd’hui — la carte riche', () => {
  it('compte et contact en liens, « pourquoi maintenant », brouillon sur deux lignes dépliable', async () => {
    const user = userEvent.setup()
    load({
      messages: [message({ account_name: 'Acme', contact_id: 'c1' })],
      sequences: [],
    })
    renderOpen()
    expect(screen.getByRole('link', { name: 'Marie Dubois' })).toHaveAttribute('href', '/contacts/c1')
    expect(screen.getByText('Signal : nouveau DSI')).toBeInTheDocument()
    const draft = screen.getByText(/Votre DSI recrute/)
    expect(draft.className).toMatch(/line-clamp-2/)
    await user.click(screen.getByRole('button', { name: 'Voir tout' }))
    expect(screen.getByText(/Votre DSI recrute/).className).not.toMatch(/line-clamp-2/)
  })

  it('« Reporter » propose demain / dans 3 jours / lundi prochain et passe le jour choisi', async () => {
    const user = userEvent.setup()
    load({ plan: [plan({})] })
    renderOpen()
    await openMore(user)
    await user.click(screen.getByRole('menuitem', { name: /Reporter/ }))
    expect(await screen.findByRole('button', { name: /Demain/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Dans 3 jours/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Lundi prochain/ }))
    await waitFor(() =>
      expect(gestures.postpone).toHaveBeenCalledWith(expect.objectContaining({ id: 'plan_item:p1' }), '2026-10-19'),
    )
  })

  it('« Reporter » accepte une date libre', async () => {
    const user = userEvent.setup()
    load({ plan: [plan({})] })
    renderOpen()
    await openMore(user)
    await user.click(screen.getByRole('menuitem', { name: /Reporter/ }))
    const input = await screen.findByLabelText('Date libre')
    await user.type(input, '2026-11-03')
    await user.click(screen.getByRole('button', { name: 'Reporter à cette date' }))
    await waitFor(() => expect(gestures.postpone).toHaveBeenCalledWith(expect.anything(), '2026-11-03'))
  })

  it('« Passer » retire la carte de la file sans rien écrire', async () => {
    const user = userEvent.setup()
    load({ plan: [plan({ label: 'À passer' })] })
    renderOpen()
    await openMore(user)
    await user.click(screen.getByRole('menuitem', { name: 'Passer' }))
    expect(screen.queryByText('À passer')).not.toBeInTheDocument()
    expect(gestures.complete).not.toHaveBeenCalled()
    expect(gestures.postpone).not.toHaveBeenCalled()
  })

  it('« Valider » un message passe par la maison native — et n’affiche pas « Reporter » sans étape', async () => {
    const user = userEvent.setup()
    load({ messages: [message()] })
    renderOpen()
    await openMore(user)
    expect(screen.queryByRole('menuitem', { name: /Reporter/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Valider' }))
    expect(gestures.validate).toHaveBeenCalledWith(expect.objectContaining({ id: 'message:m1' }))
  })

  it('un message bloqué se lit, il ne se valide pas', () => {
    load({ messages: [message({ view: 'blocked', blockers: ['missing_channel_address'] })] })
    renderOpen()
    expect(screen.queryByRole('button', { name: 'Valider' })).not.toBeInTheDocument()
    expect(screen.getByText(/Bloqué/)).toBeInTheDocument()
  })

  it('« Confier » sans collègue ne répète rien sur la carte', async () => {
    const user = userEvent.setup()
    load({
      approvals: [
        {
          id: 'ap1',
          run_id: 'r',
          required_level: 'N3',
          state: 'pending',
          summary: 'Créer un brouillon',
          estimated_credits: 0,
          expires_at: '2026-10-20T00:00:00.000Z',
          created_at: '2026-10-13T00:00:00.000Z',
        },
      ],
    })
    renderOpen()
    expect(screen.queryByText(/Aucun collègue/)).not.toBeInTheDocument()
    await openMore(user)
    expect(screen.getByRole('menuitem', { name: /Confier/ })).toBeInTheDocument()
  })

  it('filtre par geste depuis le menu, et ne garde que les options présentes', async () => {
    const user = userEvent.setup()
    load({ plan: [plan({ id: 'a', label: 'Mail A' }), plan({ id: 'b', label: 'Appel B', channel: 'phone' })] })
    render(<TodayPage />)
    await user.click(screen.getByRole('button', { name: /Filtres/ }))
    expect(screen.queryByRole('button', { name: 'LinkedIn' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Appels' }))
    expect(screen.queryByText('Mail A')).not.toBeInTheDocument()
    expect(screen.getByText('Appel B')).toBeInTheDocument()
  })
})

describe('Aujourd’hui — les demandes à valider gardent ce que les écrans d’origine disaient', () => {
  const crmRequest = (over: Record<string, unknown> = {}) =>
    ({
      id: 'crm1',
      kind: 'update_deal_stage',
      preview: [
        { field: 'Affaire', value: 'Refonte SI — Globex', key: 'deal' },
        { field: 'Étape', value: 'Proposition', key: 'stage', previous: 'Qualification' },
      ],
      origin: 'system',
      requestedByYou: false,
      createdAt: '2026-10-13T09:00:00.000Z',
      expiresAt: '2026-10-17T09:00:00.000Z',
      target: {
        accountId: null,
        accountName: 'Globex',
        contactId: null,
        contactName: null,
        ownerId: null,
        ownerName: null,
        channel: null,
        risk: 'medium',
        source: null,
      },
      ...over,
    }) as unknown as CrmWriteRequestView

  it('écriture CRM : nature, auteur, ancienne → nouvelle valeur, conséquence, expiration, Approuver / Refuser', async () => {
    const user = userEvent.setup()
    load({ crm: [crmRequest()] })
    renderOpen()
    expect(screen.getByText('Affaire à déplacer dans ton CRM')).toBeInTheDocument()
    expect(screen.getByText('Demandée par une automatisation')).toBeInTheDocument()
    const stage = screen.getByText('Qualification').closest('p')
    expect(stage).toHaveTextContent('Qualification')
    expect(stage).toHaveTextContent('Proposition')
    expect(screen.getByText(/Touche plusieurs envois à venir/)).toBeInTheDocument()
    expect(screen.getAllByText(/expire le/).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Approuver' }))
    expect(gestures.validate).toHaveBeenCalledWith(expect.objectContaining({ id: 'crm_write:crm1' }))
    await openMore(user)
    await user.click(screen.getByRole('menuitem', { name: 'Refuser' }))
    expect(gestures.reject).toHaveBeenCalledWith(expect.objectContaining({ id: 'crm_write:crm1' }))
  })

  it('écritures CRM d’un même lot : UNE carte « N écritures vers ton CRM », détail dépliable, « Rejeter le lot » en un geste', async () => {
    const user = userEvent.setup()
    load({
      crm: [
        crmRequest({ id: 'crm1', batchId: 'lot1' }),
        crmRequest({ id: 'crm2', batchId: 'lot1' }),
        crmRequest({ id: 'crm3', batchId: 'lot1' }),
        crmRequest({ id: 'crm9' }),
      ],
    })
    render(<TodayPage />)
    expect(screen.getByText('3 écritures vers ton CRM')).toBeInTheDocument()
    // Repliée : le lot ne montre aucun geste par écriture ; l'écriture isolée est une rangée fermée.
    expect(screen.queryAllByRole('button', { name: 'Approuver' })).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: /Voir le détail/ }))
    expect(screen.getAllByRole('button', { name: 'Approuver' })).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: 'Rejeter le lot' }))
    expect(gestures.rejectBatch).toHaveBeenCalledTimes(1)
    const rejected = gestures.rejectBatch.mock.calls[0]?.[0] as TodayItem[]
    expect(rejected.map(item => item.nativeId)).toEqual(['crm1', 'crm2', 'crm3'])
    // Une écriture reste derrière sa porte : aucun « Approuver le lot ».
    expect(screen.queryByRole('button', { name: /Approuver le lot/ })).not.toBeInTheDocument()
  })

  it('une écriture CRM seule, même avec un lot d’un élément, n’a pas de carte de lot', () => {
    load({ crm: [crmRequest({ id: 'crm1', batchId: 'lot1' })] })
    renderOpen()
    expect(screen.queryByRole('button', { name: 'Rejeter le lot' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approuver' })).toBeInTheDocument()
  })

  it('écriture CRM : « Modifier » corrige les lignes qui portent leur clé — et rien d’autre', async () => {
    const user = userEvent.setup()
    load({ crm: [crmRequest()] })
    renderOpen()
    await openMore(user)
    await user.click(screen.getByRole('menuitem', { name: 'Modifier' }))
    const input = screen.getByDisplayValue('Proposition')
    await user.clear(input)
    await user.type(input, 'Négociation')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(gestures.reviseCrm).toHaveBeenCalledWith(expect.objectContaining({ id: 'crm_write:crm1' }), {
        stage: 'Négociation',
      }),
    )
  })

  it('approbation : résumé complet, coût annoncé, déclencheur ; jamais une clé technique en « prochaine étape »', () => {
    const approvalOf = (nextStepKey: string) =>
      ({
        id: 'ap1',
        run_id: 'r',
        required_level: 'N3',
        state: 'pending',
        summary: 'Envoyer le récapitulatif — Claire Dubois\nPuis ajouter une note',
        estimated_credits: 2,
        expires_at: '2026-10-20T00:00:00.000Z',
        created_at: '2026-10-13T00:00:00.000Z',
        nextStepKey,
        trace: {
          trigger: 'manual',
          triggeredByName: 'Louis Schlegel',
          approvedByName: null,
          approvedAt: null,
          accountName: 'Acme',
        },
      }) satisfies Parameters<typeof buildTodayItems>[0]['approvals'][number]
    load({ approvals: [approvalOf('append_note')] })
    const { unmount } = renderOpen()
    expect(screen.getByText('Puis ajouter une note')).toBeInTheDocument()
    // #4463 — le coût annoncé (2 crédits) ne se lit plus sur la demande à valider.
    expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument()
    // #2200.13 — la rangée dit désormais la même formule d'auteur : on lit la fenêtre ouverte.
    expect(within(screen.getByRole('dialog')).getByText(/Déclenchée par Louis Schlegel/)).toBeInTheDocument()
    expect(screen.getByText(/prochaine étape : Ajouter la note d.activité/)).toBeInTheDocument()
    unmount()
    load({ approvals: [approvalOf('effect')] })
    renderOpen()
    expect(screen.queryByText(/prochaine étape/)).not.toBeInTheDocument()
  })

  it('envoi de playbook : le geste dit « Envoyer » et le corps exact se lit en entier, sans repli', async () => {
    load({
      sends: [
        {
          id: 's1',
          playbook: 'proposal_no_reply',
          recipient: 'claire@acme.fr',
          subject: 'Votre proposition',
          body: 'Bonjour Claire,\nLigne 2\nLigne 3\nLigne 4',
          requestedAt: '2026-10-13T00:00:00.000Z',
          expiresAt: '2026-10-20T00:00:00.000Z',
        } as PlaybookApproval,
      ],
    })
    renderOpen()
    // Sans mandat vivant, le geste principal est « Copier et ouvrir » (c82) : « Envoyer » vit dans le menu.
    await openMore(userEvent.setup())
    expect(screen.getByRole('menuitem', { name: 'Envoyer' })).toBeInTheDocument()
    expect(screen.getByText(/Ligne 4/).className).not.toMatch(/line-clamp/)
    expect(screen.queryByRole('button', { name: 'Voir tout' })).not.toBeInTheDocument()
  })

  it('écriture ERP que le lecteur ne peut pas trancher : la raison, pas deux boutons qui échoueront', () => {
    load({
      erp: [
        {
          id: 'erp1',
          kind: 'update_tjm',
          preview: 'TJM 600 → 650',
          createdAt: '2026-10-13T00:00:00.000Z',
          expiresAt: '2026-10-20T00:00:00.000Z',
          requestedByYou: true,
          canDecide: false,
          blockedReason: 'Tu es l’auteur de cette demande.',
        } as AtsWriteRequestView,
      ],
    })
    renderOpen()
    expect(screen.getByText("Modification d'un TJM dans l'ERP")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approuver' })).not.toBeInTheDocument()
    expect(screen.getByText(/Tu es l’auteur de cette demande/)).toBeInTheDocument()
  })
})

describe('Aujourd’hui — le mode rafale', () => {
  const open = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /Traiter E-mails/ }))
    return screen.findByRole('dialog')
  }

  beforeEach(() => {
    load({
      plan: [
        plan({ id: 'a', label: 'Mail A', due_date: '2026-10-14' }),
        plan({ id: 'b', label: 'Mail B', due_date: '2026-10-14' }),
        plan({ id: 'c', label: 'Mail C', due_date: '2026-10-14' }),
      ],
    })
  })

  it('« Traiter (n) » ouvre une carte à la fois avec « 1/3 »', async () => {
    const user = userEvent.setup()
    render(<TodayPage />)
    const dialog = await open(user)
    expect(within(dialog).getByText('1/3')).toBeInTheDocument()
    expect(within(dialog).getByText('Mail A')).toBeInTheDocument()
    expect(within(dialog).queryByText('Mail B')).not.toBeInTheDocument()
  })

  it('j / k : suivant et précédent ; Échap quitte', async () => {
    const user = userEvent.setup()
    render(<TodayPage />)
    const dialog = await open(user)
    await user.keyboard('j')
    expect(within(dialog).getByText('2/3')).toBeInTheDocument()
    expect(within(dialog).getByText('Mail B')).toBeInTheDocument()
    await user.keyboard('k')
    expect(within(dialog).getByText('1/3')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('Entrée sur une relance sans brouillon la marque faite puis passe à la suivante', async () => {
    const user = userEvent.setup()
    load({
      plan: [plan({ id: 'a', label: 'Tâche A', channel: null }), plan({ id: 'b', label: 'Tâche B', channel: null })],
    })
    render(<TodayPage />)
    await user.click(screen.getByRole('button', { name: /Traiter Tâches/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('1/2')).toBeInTheDocument()
    // une relance du plan exige une issue choisie : Entrée ouvre le choix, jamais une issue devinée
    await user.keyboard('{Enter}')
    await user.click(await screen.findByRole('menuitem', { name: 'Positif' }))
    await waitFor(() => expect(gestures.complete).toHaveBeenCalled())
    expect(gestures.complete.mock.calls[0]?.[1]).toEqual({ outcome: expect.any(String) })
  })

  it('x passe la carte (sans rien écrire) et avance', async () => {
    const user = userEvent.setup()
    render(<TodayPage />)
    const dialog = await open(user)
    await user.keyboard('x')
    await waitFor(() => expect(within(dialog).getByText('Mail B')).toBeInTheDocument())
    expect(gestures.complete).not.toHaveBeenCalled()
  })

  it('s ouvre le report ; un jour choisi est passé à la maison native', async () => {
    const user = userEvent.setup()
    render(<TodayPage />)
    const dialog = await open(user)
    await user.keyboard('s')
    await user.click(await within(document.body).findByRole('button', { name: /Demain/ }))
    await waitFor(() =>
      expect(gestures.postpone).toHaveBeenCalledWith(expect.objectContaining({ id: 'plan_item:a' }), '2026-10-15'),
    )
    await waitFor(() => expect(within(dialog).getByText('Mail B')).toBeInTheDocument())
  })

  it('les raccourcis ne volent pas les lettres tapées dans le brouillon', async () => {
    const user = userEvent.setup()
    load({ messages: [message()] })
    render(<TodayPage />)
    await user.click(screen.getByRole('button', { name: /Traiter À valider/ }))
    const dialog = await screen.findByRole('dialog')
    await user.keyboard('e')
    const textarea = await within(dialog).findByLabelText('Message')
    await user.type(textarea, 'jxs')
    expect(textarea).toHaveValue('Bonjour Marie,\nVotre DSI recrute.jxs')
    expect(within(dialog).getByText('1/1')).toBeInTheDocument()
    expect(gestures.postpone).not.toHaveBeenCalled()
  })

  it('? ouvre l’aide des raccourcis', async () => {
    const user = userEvent.setup()
    render(<TodayPage />)
    const dialog = await open(user)
    await user.keyboard('?')
    expect(within(dialog).getByText('Carte suivante')).toBeInTheDocument()
  })

  it('#4354.1 — avant de traiter : combien de destinataires, quel canal, quel texte type ; rien ne part sans toi', async () => {
    const user = userEvent.setup()
    load({
      messages: [
        message(),
        message({ id: 'm2', contact_id: 'c2', contact_name: 'Paul Martin', subject: 'Bonjour Paul' }),
      ],
    })
    render(<TodayPage />)
    await user.click(screen.getByRole('button', { name: /Traiter À valider/ }))
    const dialog = await screen.findByRole('dialog')
    const recap = within(dialog).getByRole('region', { name: 'Ce lot' })
    expect(within(recap).getByText('2 actions · 2 destinataires')).toBeInTheDocument()
    expect(within(recap).getByText('E-mail : 2')).toBeInTheDocument()
    // F1-FIX #4354 — QUI reçoit quoi : la liste nominative, groupée par canal.
    expect(within(recap).getByTestId('burst-recipients-email')).toHaveTextContent('Marie Dubois, Paul Martin')
    expect(within(recap).getByText(/Bonjour Marie/)).toBeInTheDocument()
    expect(within(recap).getByText(/Chaque message est rédigé pour son destinataire/)).toBeInTheDocument()
    expect(within(recap).getByText(/Rien ne part tout seul/)).toBeInTheDocument()
  })

  it('#4354.2 — « En faire une automatisation » ouvre le parcours Séquences sur le déclencheur « sur signal »', async () => {
    const user = userEvent.setup()
    load({ messages: [message()] })
    render(<TodayPage />)
    await user.click(screen.getByRole('button', { name: /Traiter À valider/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('link', { name: 'En faire une automatisation' })).toHaveAttribute(
      'href',
      '/actions/sequences?parcours=signal',
    )
  })

  describe('c82 — le geste final n’envoie jamais tout seul', () => {
    beforeEach(() => {
      load({ messages: [message()] })
    })

    it('sans mandat, Entrée copie le brouillon et ouvre la messagerie — et ne valide pas', async () => {
      const user = userEvent.setup()
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
      const openWindow = vi.spyOn(window, 'open').mockReturnValue(null)
      render(<TodayPage />)
      await user.click(screen.getByRole('button', { name: /Traiter À valider/ }))
      await screen.findByRole('dialog')
      await user.keyboard('{Enter}')
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Bonjour Marie')))
      expect(openWindow).toHaveBeenCalledWith(expect.stringMatching(/^mailto:/), '_blank', 'noopener,noreferrer')
      expect(gestures.validate).not.toHaveBeenCalled()
      openWindow.mockRestore()
    })

    it('sous mandat, Entrée valide (la mise en file d’envoi appartient au dispatcher)', async () => {
      const user = userEvent.setup()
      source.hasMandate = true
      render(<TodayPage />)
      await user.click(screen.getByRole('button', { name: /Traiter À valider/ }))
      await screen.findByRole('dialog')
      await user.keyboard('{Enter}')
      await waitFor(() => expect(gestures.validate).toHaveBeenCalledWith(expect.objectContaining({ id: 'message:m1' })))
    })
  })
})

function overflowAction(id: string): BriefingAction {
  return {
    labelKey: 'briefing.actions.followUp',
    labelVars: { counterpart: 'jean@acme.com', days: 9, subject: 'Proposition' },
    href: null,
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
    rankingAxes: [],
    processingState: 'suggested',
    owner: null,
    permission: null,
    id,
  }
}

describe('#2397.6 — le débordement du brief atterrit sur /actions', () => {
  it('rien de plus quand toutes les priorités tiennent déjà dans le top d’Aujourd’hui', () => {
    briefingFixture.actions = Array.from({ length: BRIEFING_ACTIONS_SHOWN }, (_, i) => overflowAction(`a${i}`))
    render(<TodayPage />)
    expect(screen.queryByText(/autres? priorité/)).not.toBeInTheDocument()
  })

  it('les priorités qui débordent du top d’Aujourd’hui se retrouvent ici', () => {
    briefingFixture.actions = Array.from({ length: BRIEFING_ACTIONS_SHOWN + 1 }, (_, i) => overflowAction(`a${i}`))
    render(<TodayPage />)
    expect(screen.getByText('1 autre priorité du jour, restée en attente')).toBeInTheDocument()
  })
})

describe('Aujourd’hui — un seul bouton primaire par carte, le reste dans « Autres gestes » (#4163 LF, point 9)', () => {
  const approvalFixture = {
    id: 'ap1',
    run_id: 'r',
    required_level: 'N3',
    state: 'pending',
    summary: 'Créer un brouillon',
    estimated_credits: 0,
    expires_at: '2026-10-20T00:00:00.000Z',
    created_at: '2026-10-13T00:00:00.000Z',
  } satisfies Parameters<typeof buildTodayItems>[0]['approvals'][number]

  it('une validation montre « Approuver » seul ; Refuser / Reporter / Confier / Passer vivent dans le menu nommé', async () => {
    const user = userEvent.setup()
    load({ approvals: [approvalFixture] })
    renderOpen()
    const card = document.querySelector('[data-slot="today-card"]') as HTMLElement
    const visible = within(card)
      .getAllByRole('button')
      .map(button => button.getAttribute('aria-label') ?? button.textContent)
    expect(visible).toEqual(['Approuver', 'Autres gestes : Créer un brouillon'])
    for (const name of [/Refuser/, /Reporter/, /Confier/, /^Passer$/]) {
      expect(within(card).queryByRole('button', { name })).not.toBeInTheDocument()
    }
    await user.click(within(card).getByRole('button', { name: /Autres gestes/ }))
    for (const name of ['Refuser', /Reporter/, /Confier/, 'Passer']) {
      expect(screen.getByRole('menuitem', { name })).toBeInTheDocument()
    }
  })

  it('le bouton du menu est une cible tactile de 44 px au moins', () => {
    load({ approvals: [approvalFixture] })
    renderOpen()
    const more = screen.getByRole('button', { name: /Autres gestes/ })
    expect(more.className).toMatch(/pointer-coarse:min-h-11/)
    expect(more.className).toMatch(/pointer-coarse:min-w-11/)
  })

  it('une relance du plan montre « Fait » seul ; « Passer » du menu la retire sans rien écrire', async () => {
    const user = userEvent.setup()
    load({ plan: [plan({ label: 'À passer' })] })
    renderOpen()
    const card = document.querySelector('[data-slot="today-card"]') as HTMLElement
    expect(within(card).getAllByRole('button').length).toBe(2)
    await user.click(within(card).getByRole('button', { name: /Autres gestes/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Passer' }))
    expect(screen.queryByText('À passer')).not.toBeInTheDocument()
    expect(gestures.complete).not.toHaveBeenCalled()
  })

  it('« Reporter » du menu ouvre les mêmes choix de date', async () => {
    const user = userEvent.setup()
    load({ plan: [plan({})] })
    renderOpen()
    await user.click(screen.getByRole('button', { name: /Autres gestes/ }))
    await user.click(screen.getByRole('menuitem', { name: /Reporter/ }))
    await user.click(await screen.findByRole('button', { name: /Lundi prochain/ }))
    await waitFor(() =>
      expect(gestures.postpone).toHaveBeenCalledWith(expect.objectContaining({ id: 'plan_item:p1' }), '2026-10-19'),
    )
  })

  it('« Refuser » du menu refuse la demande', async () => {
    const user = userEvent.setup()
    load({ approvals: [approvalFixture] })
    renderOpen()
    await user.click(screen.getByRole('button', { name: /Autres gestes/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Refuser' }))
    expect(gestures.reject).toHaveBeenCalledWith(expect.objectContaining({ id: 'approval:ap1' }))
  })
})

describe('refonte Théo — la file dense (c/actions-aujourdhui)', () => {
  it('chaque tâche est UNE rangée fermée : intitulé, « compte · geste · provenance », sans ses gestes', () => {
    load({ messages: [message({ account_name: 'Acme', contact_id: 'c1' })], sequences: [] })
    render(<TodayPage />)
    const row = screen.getByRole('button', { name: /^Ouvrir la tâche / })
    expect(row).toHaveTextContent('Acme')
    expect(screen.queryByRole('button', { name: 'Voir tout' })).not.toBeInTheDocument()
  })

  it('la rangée OUVRE la tâche : la carte et son brouillon déjà rédigé, dans une fenêtre', async () => {
    const user = userEvent.setup()
    load({ messages: [message({ account_name: 'Acme', contact_id: 'c1' })], sequences: [] })
    render(<TodayPage />)
    await user.click(screen.getByRole('button', { name: /^Ouvrir la tâche / }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Votre DSI recrute/)).toBeInTheDocument()
  })

  it('« Une tâche ou un compte… » filtre la lecture ; sans correspondance, la file le dit', async () => {
    const user = userEvent.setup()
    load({
      messages: [message({ account_name: 'Acme', contact_id: 'c1' })],
      plan: [plan({ label: 'Rappeler Globex' })],
    })
    render(<TodayPage />)
    await user.type(screen.getByRole('searchbox', { name: 'Chercher une tâche ou un compte' }), 'globex')
    expect(screen.getAllByRole('button', { name: /^Ouvrir la tâche / })).toHaveLength(1)
    await user.clear(screen.getByRole('searchbox', { name: 'Chercher une tâche ou un compte' }))
    await user.type(screen.getByRole('searchbox', { name: 'Chercher une tâche ou un compte' }), 'zzz')
    expect(screen.queryByRole('button', { name: /^Ouvrir la tâche / })).not.toBeInTheDocument()
    expect(screen.getByText('Aucun geste ne correspond à ces filtres.')).toBeInTheDocument()
  })

  it('« Traiter (N) » de la barre ouvre la rafale sur toute la file ; file vide, aucun bouton', async () => {
    const user = userEvent.setup()
    load({ messages: [message()], plan: [plan({})] })
    render(<TodayPage />)
    expect(screen.getByText('2 actions')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Traiter (2)' }))
    expect(await screen.findByText('1/2')).toBeInTheDocument()
  })

  it('l’en-tête porte Historique et « Ajouter une tâche »', () => {
    load({})
    render(<TodayPage />)
    expect(screen.getByRole('button', { name: /Historique/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajouter une tâche' })).toBeInTheDocument()
  })
})
