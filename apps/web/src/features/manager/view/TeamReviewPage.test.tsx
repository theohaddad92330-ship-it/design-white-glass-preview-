/**
 * Théo D team-review — « Le point d'équipe » : trois écrans (les sujets → les
 * décisions → la relecture). Les sujets arrivent COCHÉS avec la raison de
 * Laura (maquette Théo, team-review.A2 : l'humain décoche) ; une action existante est mise à jour, jamais dupliquée ; rien ne
 * part et aucune affaire ne change d'étape.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ManagerTeamStats } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { renderWithRouter, resetTestQueryClient } from '@/test-utils/renderWithRouter'
import { TeamReviewPage } from './TeamReviewPage'

const useManagerStatsMock = vi.fn()
vi.mock('../hooks/useManagerStats', () => ({
  useManagerStats: (period: number) => useManagerStatsMock(period),
}))
const saveMock = vi.fn()
vi.mock('../hooks/useSaveTeamReview', () => ({
  useSaveTeamReview: () => ({ mutate: saveMock, isPending: false, isSuccess: false }),
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' }, loading: false }) }))

const member = (user_id: string, name: string): ManagerTeamStats['members'][number] => ({
  user_id,
  name,
  email: `${user_id}@esn.fr`,
  role: 'sales',
  accounts: 1,
  contacts: 1,
  emails_sent: 0,
  analyses: 0,
  last_activity_at: null,
})

const A1 = '11111111-1111-4111-8111-111111111111'
const A2 = '22222222-2222-4222-8222-222222222222'
const A3 = '33333333-3333-4333-8333-333333333333'
const ITEM = '44444444-4444-4444-8444-444444444444'

const STATS: ManagerTeamStats = {
  workspace: { id: 'w', name: 'Skaizen', member_count: 2 },
  totals: { accounts: 3, contacts: 0, emails_sent: 0, analyses: 0 },
  pipeline: [],
  members: [member('u1', 'Maëlle Lorquin'), member('u2', 'Léa Marchand')],
  shared_actions: {
    open: 4,
    overdue: 1,
    delegated: 0,
    items: [
      {
        id: ITEM,
        label: 'Obtenir le bon de commande avant le démarrage',
        account_id: A1,
        company_name: 'SNCF Voyageurs',
        due_date: '2026-10-10',
        overdue: true,
        owner_user_id: 'u1',
        assigned_to: null,
      },
    ],
  },
  pipeline_review: {
    inactivity_days: 14,
    stuck_days: 21,
    total: 2,
    counts: { no_next_step: 1, no_activity: 0, stuck: 1 },
    items: [
      {
        opportunity_id: 'o1',
        label: 'Valider les conditions de mission',
        account_id: A2,
        company_name: 'Société Générale',
        stage: 'proposal',
        owner_user_id: 'u2',
        reasons: ['stuck'],
        stage_entered_at: '2026-09-01T00:00:00.000Z',
        last_activity_at: null,
      },
      {
        opportunity_id: 'o2',
        label: 'Confirmer le périmètre et le budget',
        account_id: A3,
        company_name: 'EDF',
        stage: 'qualified',
        owner_user_id: 'u1',
        reasons: ['no_next_step'],
        stage_entered_at: '2026-10-01T00:00:00.000Z',
        last_activity_at: null,
      },
    ],
  },
}

const QUIET: ManagerTeamStats = { ...STATS, shared_actions: undefined, pipeline_review: undefined }

async function mount(stats: ManagerTeamStats = STATS) {
  useManagerStatsMock.mockReturnValue({ data: stats, isLoading: false, error: null })
  const view = renderWithRouter(<TeamReviewPage urlStep="1" />, '/team/review/1')
  await screen.findByRole('heading', { level: 2, name: 'Que faut-il débloquer ensemble ?' })
  return view
}

const topicBox = (name: RegExp) => screen.getByRole('checkbox', { name })
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))

beforeEach(async () => {
  useManagerStatsMock.mockReset()
  saveMock.mockReset()
  resetTestQueryClient()
  await i18n.changeLanguage('fr')
})

describe('étape 1 — les sujets', () => {
  it('trois sujets COCHÉS d’emblée, chacun avec la raison de Laura ; on décoche ce qui ne mérite pas le point', async () => {
    await mount()
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(3)
    for (const box of boxes) expect(box).toBeChecked()
    fireEvent.click(boxes[0] as HTMLElement)
    expect(boxes[0]).not.toBeChecked()
    expect(screen.getByText(/Laura a préparé ces 3 sujets/)).toBeInTheDocument()
    expect(screen.getByText(/L’échéance de cette action est dépassée/)).toBeInTheDocument()
    expect(screen.getByText(/La sélection ne modifie aucune action/)).toBeInTheDocument()
  })

  it('nomme chaque sujet par sa société et son action', async () => {
    await mount()
    expect(topicBox(/SNCF Voyageurs/)).toBeInTheDocument()
    expect(topicBox(/Société Générale/)).toBeInTheDocument()
    expect(topicBox(/Une affaire sans action datée/)).toBeInTheDocument()
  })

  it('rien à débloquer : pas de liste, et le point reste possible avec une note', async () => {
    await mount(QUIET)
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.getByText(/Rien ne demande de décision/)).toBeInTheDocument()
    expect(screen.getByLabelText('Un autre point à partager')).toBeInTheDocument()
  })
})

describe('étape 2 — les décisions', () => {
  it('une décision par sujet coché, avec responsable et échéance ; l’action existante est annoncée', async () => {
    await mount()
    fireEvent.click(topicBox(/Société Générale/))
    next()

    expect(await screen.findByRole('heading', { level: 2, name: 'Qui fait quoi, et pour quand ?' })).toBeInTheDocument()
    expect(screen.getByText(/jamais dupliquées/)).toBeInTheDocument()
    const first = screen.getByText('Décision 1 · action existante').closest('section') as HTMLElement
    expect(within(first).getByLabelText('Prochaine action')).toHaveValue(
      'Obtenir le bon de commande avant le démarrage',
    )
    expect(within(first).getByLabelText('Responsable')).toBeInTheDocument()
    expect((within(first).getByLabelText('Échéance') as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(screen.getByText('Décision 2')).toBeInTheDocument()
  })

  it('« Point sans nouvelle action » : aucune décision à remplir, le point se tient quand même', async () => {
    await mount()
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box)
    next()
    expect(await screen.findByText(/Point sans nouvelle action/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Prochaine action')).not.toBeInTheDocument()
  })

  it('« Précédent » revient aux sujets sans perdre la sélection', async () => {
    await mount()
    fireEvent.click(topicBox(/Société Générale/))
    next()
    await screen.findByText('Décision 1 · action existante')
    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }))
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Que faut-il débloquer ensemble ?' }),
    ).toBeInTheDocument()
    expect(topicBox(/Société Générale/)).not.toBeChecked()
    expect(topicBox(/SNCF Voyageurs/)).toBeChecked()
  })
})

describe('étape 3 — la relecture, puis l’enregistrement', () => {
  it('dit ce qui est mis à jour et ce qui est créé, et promet qu’aucun e-mail ne part', async () => {
    await mount()
    fireEvent.click(topicBox(/Société Générale/))
    next()
    await screen.findByText('Décision 1 · action existante')
    next()

    expect(
      await screen.findByRole('heading', { level: 2, name: /Un compte rendu qui mène à l’action/ }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Aucun e-mail ne sera envoyé et aucune affaire ne changera d’étape/)).toBeInTheDocument()
    expect(screen.getByText('Mise à jour de l’action existante')).toBeInTheDocument()
    expect(screen.getByText('Création d’une action dans le plan')).toBeInTheDocument()
  })

  it('« Enregistrer les décisions » envoie les décisions telles que relues — l’action existante par son identifiant', async () => {
    await mount()
    fireEvent.click(topicBox(/Société Générale/))
    fireEvent.change(screen.getByLabelText('Un autre point à partager'), { target: { value: 'Priorité SG.' } })
    next()
    await screen.findByText('Décision 1 · action existante')
    next()
    fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer les décisions' }))

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1))
    const body = saveMock.mock.calls[0]?.[0]
    expect(body.note).toBe('Priorité SG.')
    expect(body.no_new_action).toBe(false)
    expect(body.decisions).toHaveLength(2)
    expect(body.decisions[0]).toMatchObject({
      existing_item_id: ITEM,
      account_id: A1,
      label: 'Obtenir le bon de commande avant le démarrage',
      owner_id: 'u1',
    })
    expect(body.decisions[1]).toMatchObject({ account_id: A3, label: 'Confirmer le périmètre et le budget' })
    expect(body.decisions[1].existing_item_id).toBeUndefined()
  })

  it('un point sans sujet coché s’enregistre « sans nouvelle action »', async () => {
    await mount()
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box)
    fireEvent.change(screen.getByLabelText('Un autre point à partager'), { target: { value: 'On en reparle jeudi.' } })
    next()
    await screen.findByText(/Point sans nouvelle action/)
    next()
    fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer les décisions' }))
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1))
    expect(saveMock.mock.calls[0]?.[0]).toMatchObject({
      decisions: [],
      no_new_action: true,
      note: 'On en reparle jeudi.',
    })
  })
})

// Théo PR12 — la grammaire de `d/team-review` : en-tête (surtitre, titre au point d'accent, qui tient le point),
// étapes 1-2-3, intro, bandeau de Laura, sujets, note, pied — dans cet ordre ; la relecture reprend l'icône du sujet.
describe('Théo PR12 — structure du point d’équipe', () => {
  it('en-tête, étapes, intro, Laura, sujets, note, pied : dans cet ordre', async () => {
    await mount()
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent).toBe('Le point d’équipe.')
    // Le point final est l'accent dessiné, pas un second point écrit dans le texte.
    expect(h1.textContent?.endsWith('..')).toBe(false)
    expect(screen.getByTestId('team-review-actor')).toHaveTextContent('Maëlle Lorquin')
    const steps = screen.getByRole('list', { name: 'Étapes du point d’équipe' })
    expect(
      within(steps)
        .getAllByRole('listitem')
        .map(li => li.textContent),
    ).toEqual(['1Les sujets', '2Les décisions', '3La relecture'])
    const intro = screen.getByRole('heading', { level: 2, name: 'Que faut-il débloquer ensemble ?' })
    const laura = screen.getByText(/Laura a préparé ces 3 sujets/)
    const firstTopic = screen.getAllByRole('checkbox')[0]!
    const note = screen.getByLabelText('Un autre point à partager')
    const leave = screen.getByRole('link', { name: 'Quitter pour le moment' })
    const order = [h1, steps, intro, laura, firstTopic, note, leave]
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('la relecture reprend l’icône de chaque sujet retenu', async () => {
    await mount()
    // Laura propose les sujets DÉJÀ cochés : on en décoche un, les deux autres sont retenus.
    fireEvent.click(topicBox(/Société Générale/))
    next()
    next()
    await screen.findByRole('heading', { level: 2, name: /compte rendu/i })
    expect(screen.getAllByTestId('topic-icon')).toHaveLength(2)
  })
})
