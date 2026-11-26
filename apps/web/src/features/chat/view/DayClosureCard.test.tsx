import userEvent from '@testing-library/user-event'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { DayClosure, DayClosureTask } from '@bellum/contracts'
import { DayClosureCard } from './DayClosureCard'

// #2392 — la carte de clôture de fin de journée : des sections RÉELLES, une
// décision PAR tâche, un diff avant toute écriture, une preuve après.

const update = vi.fn()
vi.mock('@/features/tasks/api', () => ({ tasksApi: { update: (...args: unknown[]) => update(...args) } }))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => ({
    data: [
      { userId: 'me', email: 'moi@example.com', fullName: 'Moi', role: 'owner', isSelf: true },
      { userId: 'lea', email: 'lea@example.com', fullName: 'Léa Martin', role: 'member', isSelf: false },
    ],
  }),
}))
let isDemo = false
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => isDemo }))
vi.mock('@/lib/query-client', () => ({ queryClient: { invalidateQueries: vi.fn() } }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

function task(id: string, title: string, overrides: Partial<DayClosureTask> = {}): DayClosureTask {
  return {
    id,
    title,
    dueOn: '2026-09-21',
    priority: 'normal',
    ownerId: 'me',
    ownerName: null,
    accountName: 'Thales',
    contactName: null,
    resultNote: null,
    ...overrides,
  }
}

function closure(overrides: Partial<DayClosure> = {}): DayClosure {
  return {
    date: '2026-09-23',
    timeZone: 'Europe/Paris',
    tasksState: 'ready',
    tasksReason: null,
    results: [task('r1', 'Envoyer le compte rendu', { resultNote: 'Transmis à l’équipe' })],
    commitments: [],
    waitingOn: { state: 'not_connected', reason: 'mailbox_not_connected', threads: [] },
    blocked: [task('b1', 'Caler un déjeuner', { resultNote: null })],
    toDecide: [task('d1', 'Relancer les profils'), task('d2', 'Obtenir le nom de l’acheteur')],
    toValidate: { state: 'ready', reason: null, cards: [] },
    firstTomorrow: task('f1', 'Préparer l’angle renfort', { dueOn: '2026-09-24' }),
    ...overrides,
  }
}

beforeEach(() => {
  update.mockReset()
  isDemo = false
})

describe('DayClosureCard (#2392)', () => {
  it('affiche les sections remplies, et AUCUNE ligne pour une section vide', () => {
    render(<DayClosureCard closure={closure()} />)
    expect(screen.getByText('Envoyer le compte rendu')).toBeInTheDocument()
    expect(screen.getByText('Transmis à l’équipe')).toBeInTheDocument()
    // Blocage sans raison : on le DIT, on n'en invente pas.
    expect(screen.getByText('Raison non notée')).toBeInTheDocument()
    expect(screen.getByText('Préparer l’angle renfort')).toBeInTheDocument()
    // « Engagements pris » est vide : pas de titre de section du tout.
    expect(screen.queryByText('Engagements pris aujourd’hui')).not.toBeInTheDocument()
    expect(screen.queryByText("Engagements pris aujourd'hui")).not.toBeInTheDocument()
  })

  it('une messagerie non connectée se DIT, elle ne passe pas pour « personne n’attend »', () => {
    render(<DayClosureCard closure={closure()} />)
    expect(screen.getByText(/messagerie n'est pas connectée/)).toBeInTheDocument()
  })

  it('aucune tâche décidée = aucun changement possible, et aucun bouton « tout reporter »', () => {
    render(<DayClosureCard closure={closure()} />)
    expect(screen.queryByRole('button', { name: /tout/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Voir le/ })).toBeDisabled()
  })

  it('décide tâche par tâche, montre le DIFF, puis écrit par PATCH /tasks et prouve chaque ligne', async () => {
    update.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('boom'))
    render(<DayClosureCard closure={closure()} />)

    const first = screen.getByTestId('day-closure-task-d1')
    fireEvent.click(within(first).getByRole('button', { name: 'Reporter' }))
    const second = screen.getByTestId('day-closure-task-d2')
    fireEvent.click(within(second).getByRole('button', { name: 'Abandonner' }))
    fireEvent.change(within(second).getByLabelText(/Raison de l'abandon/), { target: { value: 'Acheteur parti' } })

    // Rien n'est écrit avant le diff ni avant la validation.
    fireEvent.click(screen.getByRole('button', { name: /Voir les 2 changements/ }))
    expect(update).not.toHaveBeenCalled()
    const diff = screen.getByTestId('day-closure-diff')
    expect(within(diff).getByText(/Relancer les profils : échéance/)).toBeInTheDocument()
    expect(within(diff).getByText(/abandonnée \(archivée, pas supprimée\)/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Valider ces 2 changements/ }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2))
    expect(update).toHaveBeenNthCalledWith(1, 'd1', { dueOn: '2026-09-24' })
    expect(update).toHaveBeenNthCalledWith(2, 'd2', { status: 'cancelled', resultNote: 'Acheteur parti' })
    expect(await within(first).findByText('Mise à jour.')).toBeInTheDocument()
    expect(within(second).getByText(/Échec : rien n'a changé/)).toBeInTheDocument()
  })

  // #3761.16 (Louis, 11/10) — le diff et les gestes « valider / modifier » sont composés par le bloc de
  // validation de reply-kit : UN seul patron de validation, et jamais de bouton « envoyer ».
  it('#3761.16 — la revue du diff est un ReplyActionBlock : diff, « Valider ces changements », « Modifier »', () => {
    render(<DayClosureCard closure={closure()} />)
    fireEvent.click(within(screen.getByTestId('day-closure-task-d1')).getByRole('button', { name: 'Reporter' }))
    fireEvent.click(screen.getByRole('button', { name: /Voir le changement/ }))
    const block = document.querySelector('[data-reply-action="pending"]') as HTMLElement
    expect(block).not.toBeNull()
    expect(within(block).getByTestId('day-closure-diff')).toBeInTheDocument()
    expect(within(block).getByRole('button', { name: /Valider ce changement/ })).toBeInTheDocument()
    fireEvent.click(within(block).getByRole('button', { name: 'Modifier' }))
    expect(document.querySelector('[data-reply-action]')).toBeNull()
    expect(screen.queryByRole('button', { name: /envoyer/i })).not.toBeInTheDocument()
  })

  it('déléguer propose les membres de l’espace, jamais le propriétaire actuel', async () => {
    render(<DayClosureCard closure={closure()} />)
    const first = screen.getByTestId('day-closure-task-d1')
    fireEvent.click(within(first).getByRole('button', { name: 'Déléguer' }))
    await userEvent.click(within(first).getByRole('combobox', { name: 'À qui la confier' }))
    expect(await screen.findByRole('option', { name: 'Léa Martin' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Moi' })).not.toBeInTheDocument()
  })

  it('en salle de démonstration, le diff se montre mais RIEN ne s’écrit', () => {
    isDemo = true
    render(<DayClosureCard closure={closure()} />)
    fireEvent.click(within(screen.getByTestId('day-closure-task-d1')).getByRole('button', { name: 'Reporter' }))
    fireEvent.click(screen.getByRole('button', { name: /Voir le changement/ }))
    expect(screen.queryByRole('button', { name: /Valider/ })).not.toBeInTheDocument()
    expect(screen.getByText(/ces changements ne sont pas enregistrés/)).toBeInTheDocument()
    expect(update).not.toHaveBeenCalled()
  })
})
