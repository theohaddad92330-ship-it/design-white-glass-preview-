import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { ActionHistoryItem } from '@bellum/contracts'
import { ActionHistoryDetailPage, CloseCrmTaskAction, RollbackAction } from './ActionHistoryDetailPage'
import { actionsApi } from '@/features/actions/api'

vi.mock('@/features/actions/api', () => ({ actionsApi: { dispatch: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const actionItemQuery = vi.fn()
vi.mock('@/features/action-history/hooks/useActionHistory', () => ({
  useActionHistoryItem: () => actionItemQuery(),
}))
vi.mock('@/features/accounts/hooks/useAccount', () => ({
  useAccount: () => ({ account: null, contacts: [] }),
}))
vi.mock('@/features/accounts/hooks/useAccountRuns', () => ({
  useAccountRuns: () => ({ data: [] }),
}))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ id: '33333333-3333-4333-8333-333333333333' }),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

function baseItem(overrides: Partial<ActionHistoryItem> = {}): ActionHistoryItem {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    action_type: 'plan_action_added',
    category: 'reminder',
    action_label: 'Action ajoutée',
    detail: 'Relance — Decathlon',
    status: 'Programmé',
    channel: null,
    actor: { id: 'u1', name: 'Théo', initials: 'T' },
    target: { account_id: 'a1', contact_id: null, label: 'Decathlon', initials: 'D' },
    created_at: '2026-09-25T08:00:00.000Z',
    rollback: 'cancel_reminder',
    crmTaskClosable: false,
    ...overrides,
  }
}

function renderWithClient(item: ActionHistoryItem) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <RollbackAction item={item} />
    </QueryClientProvider>,
  )
}

function renderCloseCrmTask(item: ActionHistoryItem) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CloseCrmTaskAction item={item} />
    </QueryClientProvider>,
  )
}

/**
 * #2277.33/.35/.36 (épopée #2771) — le bouton d'annulation d'une ligne du
 * Journal n'existe QUE quand le serveur dit qu'il y a quelque chose à
 * annuler (`item.rollback`, jamais deviné côté client) — et dispatche le BON
 * intent, ciblé par l'id de la ligne elle-même.
 */
describe('RollbackAction — épopée #2771', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("n'affiche rien quand le serveur n'offre aucun rollback", () => {
    renderWithClient(baseItem({ rollback: null }))
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('affiche « Annuler le rappel » et dispatche `cancel_reminder` ciblé sur l’id de la ligne', async () => {
    const dispatch = vi.mocked(actionsApi.dispatch).mockResolvedValue({ type: 'cancel_reminder', status: 'done' })
    const item = baseItem({ rollback: 'cancel_reminder' })
    renderWithClient(item)

    fireEvent.click(screen.getByRole('button', { name: 'Annuler le rappel' }))

    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'cancel_reminder', targetId: item.id, idempotencyKey: expect.any(String) }),
      ),
    )
  })

  it('affiche « Retirer la tâche CRM » pour `remove_crm_task`', () => {
    renderWithClient(baseItem({ rollback: 'remove_crm_task' }))
    expect(screen.getByRole('button', { name: 'Retirer la tâche CRM' })).toBeInTheDocument()
  })

  it('affiche « Restaurer le statut précédent » pour `restore_status`', () => {
    renderWithClient(baseItem({ rollback: 'restore_status' }))
    expect(screen.getByRole('button', { name: 'Restaurer le statut précédent' })).toBeInTheDocument()
  })

  it('un rollback SKIPPED se DIT — jamais un succès muet', async () => {
    vi.mocked(actionsApi.dispatch).mockResolvedValue({
      type: 'cancel_reminder',
      status: 'skipped',
      reason: 'Ce rappel est déjà annulé.',
    })
    const { toast } = await import('sonner')
    renderWithClient(baseItem({ rollback: 'cancel_reminder' }))

    fireEvent.click(screen.getByRole('button', { name: 'Annuler le rappel' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Ce rappel est déjà annulé.'))
  })
})

/**
 * #2319.114 (épopée #2985) — le bouton qui CLÔTURE une tâche CRM, distinct du
 * retrait ci-dessus : n'existe QUE quand le serveur dit `crmTaskClosable`
 * (jamais deviné côté client), et dispatche `close_crm_task` ciblé sur l'id
 * de la ligne.
 */
describe('CloseCrmTaskAction — #2319.114', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("n'affiche rien quand le serveur n'offre aucune clôture", () => {
    renderCloseCrmTask(baseItem({ crmTaskClosable: false }))
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('affiche « Marquer la tâche CRM comme faite » et dispatche `close_crm_task` ciblé sur l’id de la ligne', async () => {
    const dispatch = vi.mocked(actionsApi.dispatch).mockResolvedValue({ type: 'close_crm_task', status: 'done' })
    const item = baseItem({ crmTaskClosable: true })
    renderCloseCrmTask(item)

    fireEvent.click(screen.getByRole('button', { name: 'Marquer la tâche CRM comme faite' }))

    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'close_crm_task', targetId: item.id, idempotencyKey: expect.any(String) }),
      ),
    )
  })

  it('une clôture SKIPPED se DIT — jamais un succès muet', async () => {
    vi.mocked(actionsApi.dispatch).mockResolvedValue({
      type: 'close_crm_task',
      status: 'skipped',
      reason: 'Cette tâche a déjà été clôturée.',
    })
    const { toast } = await import('sonner')
    renderCloseCrmTask(baseItem({ crmTaskClosable: true }))

    fireEvent.click(screen.getByRole('button', { name: 'Marquer la tâche CRM comme faite' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Cette tâche a déjà été clôturée.'))
  })
})

function renderDetailPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ActionHistoryDetailPage />
    </QueryClientProvider>,
  )
}

/**
 * #3388 (recette 30/09) — Actions ne montrait AUCUNE trace de la machine
 * d'état commerciale commune (#2967), alors que Projets/Besoins/Missions
 * l'écrivent déjà. La fiche détail rattache maintenant le stade du compte visé
 * — dérivé, jamais deviné : absent quand le serveur n'en rend aucun.
 */
describe('ActionHistoryDetailPage — le stade commercial du compte visé (#3388)', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('affiche le stade CANONIQUE quand le serveur le rattache', () => {
    actionItemQuery.mockReturnValue({
      data: baseItem({ target: { ...baseItem().target, commercial_stage: 'besoin_confirme' } }),
      isLoading: false,
    })
    renderDetailPage()

    expect(screen.getByText('Stade commercial')).toBeInTheDocument()
    expect(screen.getByText('Besoin confirmé')).toBeInTheDocument()
  })

  it('aucune ligne quand le compte n’a aucun besoin — jamais un stade deviné', () => {
    actionItemQuery.mockReturnValue({
      data: baseItem({ target: { ...baseItem().target, commercial_stage: null } }),
      isLoading: false,
    })
    renderDetailPage()

    expect(screen.queryByText('Stade commercial')).not.toBeInTheDocument()
  })
})

/**
 * Refonte Théo PR12 — la fiche suit la grammaire du dialogue « tâche » (c/actions-aujourdhui #dlg-task) croisée avec
 * notre panneau validé (maq-actions-19-10 #etat-detail-action) : pastilles → grille de méta → le geste en clair →
 * note de doctrine → pied (Retour à gauche, gestes à droite). Le test sait dire NON sur l'ORDRE, pas seulement la présence.
 */
describe('ActionHistoryDetailPage — structure Théo (PR12)', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('empile pastilles, méta, « Ce qui a été fait », note, puis le pied — dans cet ordre', () => {
    actionItemQuery.mockReturnValue({ data: baseItem({ channel: 'email' }), isLoading: false })
    renderDetailPage()

    const sheet = screen.getByRole('region', { name: 'Fiche de l’action' })
    const pills = screen.getByTestId('action-detail-pills')
    const meta = screen.getByLabelText('Contexte de l’action')
    const what = screen.getByRole('heading', { level: 2, name: 'Ce qui a été fait' })
    const note = screen.getByText(/n’est pas une preuve d’envoi/)
    const footer = screen.getByTestId('action-detail-footer')
    const order = [pills, meta, what, note, footer]
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(sheet).toContainElement(footer)
    // Aucun second h1 dans le corps : le titre vit dans l'en-tête de la coque (GA-347).
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    // Le pied : Retour d'abord, puis les gestes réels de la ligne.
    const buttons = Array.from(footer.querySelectorAll('button, a')).map(el => el.textContent)
    expect(buttons[0]).toBe('Retour')
    expect(buttons).toEqual(expect.arrayContaining(['Copier l’identifiant', 'Ouvrir le compte', 'Annuler le rappel']))
  })

  it('la grille de méta dit compte, utilisateur, date — une absence ne fait aucune ligne', () => {
    actionItemQuery.mockReturnValue({ data: baseItem(), isLoading: false })
    renderDetailPage()
    const meta = screen.getByLabelText('Contexte de l’action')
    const labels = Array.from(meta.querySelectorAll('dt')).map(el => el.textContent)
    expect(labels).toEqual(['Compte', 'Utilisateur', 'Date'])
  })

  it('« Copier l’identifiant » copie l’id de la ligne', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    actionItemQuery.mockReturnValue({ data: baseItem(), isLoading: false })
    renderDetailPage()
    fireEvent.click(screen.getByRole('button', { name: 'Copier l’identifiant' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('33333333-3333-4333-8333-333333333333'))
  })

  it('action introuvable : l’état vide nommé garde un retour', () => {
    actionItemQuery.mockReturnValue({ data: undefined, isLoading: false })
    renderDetailPage()
    expect(screen.getByText('Action introuvable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retour' })).toBeInTheDocument()
  })
})
