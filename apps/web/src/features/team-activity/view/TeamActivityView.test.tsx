import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

const useTeamActivityJournal = vi.fn()
const useTeamComments = vi.fn()
const createMutate = vi.fn()
const resolveMutate = vi.fn()
const useTeam = vi.fn()

vi.mock('@/features/manager/hooks/useTeamActivityJournal', () => ({
  useTeamActivityJournal: (...a: unknown[]) => useTeamActivityJournal(...a),
}))
vi.mock('@/features/manager/hooks/useTeamComments', () => ({
  useTeamComments: () => useTeamComments(),
  useCreateTeamComment: () => ({ mutate: createMutate, isPending: false }),
}))
vi.mock('@/features/team-activity/hooks/useTeamThreads', () => ({
  useResolveTeamTopic: () => ({ mutate: resolveMutate }),
}))
vi.mock('@/features/team/hooks/useTeam', () => ({ useTeam: () => useTeam() }))
vi.mock('@/lib/data-exit', () => ({ useDataExit: () => ({ allowed: true, grant: {} }) }))
const downloadCSV = vi.fn()
vi.mock('@/lib/export-csv', () => ({ downloadCSV: (...a: unknown[]) => downloadCSV(...a) }))

const STATS = {
  members: [
    { user_id: 'u1', name: 'Léa Marchand' },
    { user_id: 'u2', name: 'Maëlle Lorquin' },
  ],
  period_activity: {
    total: 4,
    items: [
      {
        id: 'e1',
        user_id: 'u1',
        action_type: 'analysis_completed',
        account_id: 'acc-1',
        company_name: 'Société Générale',
        created_at: '2026-10-19T09:12:00.000Z',
      },
      {
        id: 'e2',
        user_id: 'u2',
        action_type: 'plan_action_assigned',
        account_id: 'acc-2',
        company_name: 'Airbus',
        created_at: '2026-10-19T11:33:00.000Z',
      },
      {
        id: 'e3',
        user_id: 'u1',
        action_type: 'rdv_obtained',
        account_id: 'acc-1',
        company_name: 'Société Générale',
        created_at: '2026-10-18T09:00:00.000Z',
      },
      {
        id: 'e4',
        user_id: 'u1',
        action_type: 'plan_action_opened',
        account_id: 'acc-1',
        company_name: 'Société Générale',
        created_at: '2026-10-18T08:00:00.000Z',
      },
    ],
  },
}

const ROOT = {
  id: 't1',
  workspace_id: 'ws',
  author_user_id: 'u1',
  author_name: 'Léa Marchand',
  body: 'Maëlle, peux-tu relire les conditions du renfort Data ?',
  account_id: 'acc-1',
  company_name: 'Société Générale',
  conversation_id: null,
  message_id: null,
  mentioned_user_ids: ['u2'],
  parent_comment_id: null,
  resolved_at: null,
  resolved_by: null,
  created_at: '2026-10-19T08:00:00.000Z',
}
const REPLY = {
  ...ROOT,
  id: 't2',
  author_user_id: 'u2',
  author_name: 'Maëlle Lorquin',
  body: 'Je regarde ça demain.',
  mentioned_user_ids: [],
  parent_comment_id: 't1',
  account_id: null,
  company_name: null,
}

async function view() {
  const { TeamActivityView } = await import('./TeamActivityView')
  return renderWithRouter(<TeamActivityView />)
}

// Théo D team-activite — Journal d'activité + Échanges d'équipe.
describe('TeamActivityView — le journal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useTeamActivityJournal.mockReturnValue({
      loaded: true,
      members: STATS.members,
      activity: STATS.period_activity,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    useTeamComments.mockReturnValue({
      data: { items: [ROOT, REPLY] },
      isLoading: false,
      isError: false,
      isSuccess: true,
    })
    useTeam.mockReturnValue({
      team: {
        members: [
          { userId: 'u1', fullName: 'Léa Marchand', email: 'l@x.fr' },
          { userId: 'u2', fullName: 'Maëlle Lorquin', email: 'm@x.fr' },
        ],
      },
    })
  })

  it('ne porte que des faits : une ouverture d’action n’entre pas au journal', async () => {
    await view()
    expect(await screen.findByText(/3 événements accessibles/)).toBeTruthy()
    expect(screen.getAllByTestId('journal-row')).toHaveLength(3)
  })

  it('« Voir la recherche » sur une analyse ; le compte est un lien', async () => {
    await view()
    const rows = await screen.findAllByTestId('journal-row')
    const analysis = rows.find(
      row =>
        within(row).queryByText('Société Générale') && within(row).queryByRole('link', { name: /Voir la recherche/ }),
    )
    expect(analysis).toBeTruthy()
  })

  it('filtre par famille et par membre (A1)', async () => {
    const user = userEvent.setup()
    await view()
    await user.click(await screen.findByRole('combobox', { name: 'Type d’activité' }))
    await user.click(await screen.findByRole('option', { name: 'Suivi commercial' }))
    expect(screen.getAllByTestId('journal-row')).toHaveLength(1)
    await user.click(screen.getByRole('combobox', { name: 'Type d’activité' }))
    await user.click(await screen.findByRole('option', { name: 'Tous les faits enregistrés' }))
    await user.click(screen.getByRole('combobox', { name: 'Membre' }))
    await user.click(await screen.findByRole('option', { name: 'Maëlle Lorquin' }))
    expect(screen.getAllByTestId('journal-row')).toHaveLength(1)
  })

  it('« Exporter cette vue » exporte les lignes affichées par la règle d’espace', async () => {
    const user = userEvent.setup()
    await view()
    await user.click(await screen.findByRole('button', { name: /Exporter cette vue/ }))
    expect(downloadCSV).toHaveBeenCalledTimes(1)
    const csv = downloadCSV.mock.calls[0]?.[0] as string
    expect(csv).toContain('Société Générale')
    expect(csv).not.toContain('plan_action_opened')
  })

  it('renvoie vers le journal d’administration (A2)', async () => {
    await view()
    expect((await screen.findByRole('link', { name: /Journal d’administration/ })).getAttribute('href')).toBe(
      '/settings/activity',
    )
  })

  it('ne dit jamais « consulté » ni ne surveille la présence', async () => {
    await view()
    await screen.findAllByTestId('journal-row')
    expect(screen.queryByText(/consult/i)).toBeNull()
    expect(screen.getByText(/Pas de surveillance de présence/)).toBeTruthy()
  })
})

describe('TeamActivityView — les échanges', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useTeamActivityJournal.mockReturnValue({
      loaded: true,
      members: STATS.members,
      activity: STATS.period_activity,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    useTeamComments.mockReturnValue({
      data: { items: [ROOT, REPLY] },
      isLoading: false,
      isError: false,
      isSuccess: true,
    })
    useTeam.mockReturnValue({
      team: {
        members: [
          { userId: 'u1', fullName: 'Léa Marchand', email: 'l@x.fr' },
          { userId: 'u2', fullName: 'Maëlle Lorquin', email: 'm@x.fr' },
        ],
      },
    })
  })

  it('liste les sujets ouverts avec « À discuter », la mention, le compte lié et la réponse', async () => {
    const user = userEvent.setup()
    await view()
    await user.click(await screen.findByRole('tab', { name: 'Échanges d’équipe' }))
    const topic = (await screen.findByText(/relire les conditions du renfort Data/)).closest('article') as HTMLElement
    expect(within(topic).getByText('À discuter')).toBeTruthy()
    expect(within(topic).getByText('@Maëlle Lorquin')).toBeTruthy()
    expect(within(topic).getByRole('link', { name: 'Société Générale' })).toBeTruthy()
    expect(within(topic).getByText('Je regarde ça demain.')).toBeTruthy()
  })

  it('« Marquer résolu » résout la racine du sujet', async () => {
    const user = userEvent.setup()
    await view()
    await user.click(await screen.findByRole('tab', { name: 'Échanges d’équipe' }))
    await user.click(await screen.findByRole('button', { name: 'Marquer résolu' }))
    expect(resolveMutate).toHaveBeenCalledWith({ id: 't1', resolved: true })
  })

  it('« Répondre » rattache la réponse au sujet', async () => {
    const user = userEvent.setup()
    await view()
    await user.click(await screen.findByRole('tab', { name: 'Échanges d’équipe' }))
    await user.click(await screen.findByRole('button', { name: 'Répondre' }))
    await user.type(screen.getByLabelText('Ta réponse'), 'Merci, c’est noté.')
    await user.click(screen.getByRole('button', { name: 'Envoyer la réponse' }))
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Merci, c’est noté.', parent_comment_id: 't1' }),
      expect.anything(),
    )
  })

  it('« Partager un point » crée un sujet avec @mention et compte lié', async () => {
    const user = userEvent.setup()
    await view()
    await user.click(await screen.findByRole('tab', { name: 'Échanges d’équipe' }))
    await user.click(screen.getByRole('button', { name: 'Partager un point' }))
    await user.type(screen.getByLabelText('Le point à partager'), 'Qui reprend le dossier Airbus ?')
    await user.click(screen.getByRole('combobox', { name: 'Mentionner un collègue' }))
    await user.click(await screen.findByRole('option', { name: 'Maëlle Lorquin' }))
    await user.click(screen.getByRole('button', { name: 'Partager' }))
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Qui reprend le dossier Airbus ?', mentioned_user_ids: ['u2'] }),
      expect.anything(),
    )
  })

  it('les conversations privées ne sont pas agrégées (dit à l’écran)', async () => {
    const user = userEvent.setup()
    await view()
    await user.click(await screen.findByRole('tab', { name: 'Échanges d’équipe' }))
    expect(screen.getByText(/conversations privées ne sont pas agrégées/i)).toBeTruthy()
  })
})
