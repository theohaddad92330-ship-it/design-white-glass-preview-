import type { Task } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TaskList } from './TaskList'

const tasks = vi.fn()
const create = vi.fn()
const update = vi.fn()
const remove = vi.fn()

vi.mock('../hooks/useTasks', () => ({
  useTasks: (...args: unknown[]) => tasks(...args),
  useCreateTask: () => ({ mutate: create, isPending: false }),
  useUpdateTask: () => ({ mutate: update, isPending: false }),
  useDeleteTask: () => ({ mutate: remove, isPending: false }),
}))

// #2108.54 — le double de `trackTaskCompleted` : le GESTE, jamais le libellé
// de la tâche (voir `product-tracker.test.ts` pour le contrat complet).
const trackTaskCompleted = vi.fn()
vi.mock('@/lib/product-tracker', () => ({ trackTaskCompleted: (...args: unknown[]) => trackTaskCompleted(...args) }))

const NOW = new Date('2026-08-17T09:00:00.000Z')

function day(offset: number): string {
  const date = new Date(NOW)
  date.setDate(date.getDate() + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function task(dueOn: string, overrides: Partial<Task> = {}): Task {
  const { completedById = null, completedByName = null, resultNote = null, ...rest } = overrides
  return {
    id: `task-${dueOn}-${overrides.title ?? ''}`,
    title: 'Rappeler le DSI',
    details: null,
    status: 'todo',
    priority: 'normal',
    dueOn,
    source: 'manual',
    type: 'personal',
    relatedActionRunId: null,
    sourceLabelKey: null,
    ownerId: null,
    ownerName: null,
    createdById: null,
    createdByName: null,
    expectedResult: null,
    accountId: null,
    accountName: null,
    contactId: null,
    contactName: null,
    projectId: null,
    projectLabel: null,
    completedAt: null,
    completedById,
    completedByName,
    resultNote,
    channel: null,
    objective: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
    ...rest,
  }
}

function renderList(props: { screen?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TaskList scope="mine" {...props} />
    </QueryClientProvider>,
  )
}

describe('TaskList', () => {
  beforeEach(() => {
    // Les paniers dépendent de « maintenant » : sans horloge figée, la suite
    // tombe au passage de minuit et personne ne comprend pourquoi.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(NOW)
    tasks.mockReset()
    create.mockReset()
    update.mockReset()
    remove.mockReset()
    trackTaskCompleted.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // #4134 — cibles tactiles ≥ 44 px (min-h-11 / min-w-11 = 2,75 rem) sur les icônes
  // de report et la case « faite », sans grossir l'icône.
  it('donne une cible de 44 px aux boutons de report et à la case « faite »', () => {
    tasks.mockReturnValue({ data: [task(day(0), { title: 'Tâche du jour' })], isLoading: false, isError: false })
    renderList()
    for (const name of ['Reporter à demain', 'Reporter à la semaine prochaine']) {
      const cls = screen.getByRole('button', { name }).className
      expect(cls).toContain('min-h-11')
      expect(cls).toContain('min-w-11')
    }
    const box = screen.getByRole('checkbox')
    expect(box.closest('label')?.className ?? '').toContain('min-h-11')
  })

  // #4891 — dans une carte étroite (1280 px), « Ajouter une tâche » passe à la ligne au lieu d'être coupé.
  it('laisse les boutons « Historique » et « Ajouter une tâche » passer à la ligne', () => {
    tasks.mockReturnValue({ data: [task(day(0), { title: 'Tâche du jour' })], isLoading: false, isError: false })
    renderList()
    const bar = screen.getByRole('button', { name: /Historique/ }).parentElement
    expect(bar?.className).toContain('flex-wrap')
  })

  it('sépare le RETARD d’aujourd’hui, en tête', () => {
    tasks.mockReturnValue({
      data: [task(day(-3), { title: 'Vieille tâche' }), task(day(0), { title: 'Tâche du jour' })],
      isLoading: false,
      isError: false,
    })
    renderList()
    expect(screen.getByText('En retard')).toBeInTheDocument()
    expect(screen.getByText('Aujourd’hui')).toBeInTheDocument()
    expect(screen.getByText('1 en retard')).toBeInTheDocument()
  })

  it('ne rend PAS un échec de lecture comme une liste vide', () => {
    tasks.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderList()
    expect(screen.getByText(/la lecture qui a échoué/)).toBeInTheDocument()
    expect(screen.queryByText('Aucune tâche ouverte.')).not.toBeInTheDocument()
  })

  it('dit « aucune tâche » quand il n’y en a vraiment aucune', () => {
    tasks.mockReturnValue({ data: [], isLoading: false, isError: false })
    renderList()
    expect(screen.getByText('Aucune tâche ouverte.')).toBeInTheDocument()
    expect(screen.getByText('Rien d’urgent.')).toBeInTheDocument()
  })

  it('marque les tâches prioritaires', () => {
    tasks.mockReturnValue({ data: [task(day(0), { priority: 'high' })], isLoading: false, isError: false })
    renderList()
    expect(screen.getByText('Prioritaire')).toBeInTheDocument()
  })

  it('n’affiche PAS de contexte fabriqué sur une tâche personnelle', () => {
    // Un « — » ou un tiret vide se lit comme un compte dont le nom manque.
    tasks.mockReturnValue({ data: [task(day(0))], isLoading: false, isError: false })
    renderList()
    expect(screen.queryByText(/·/)).not.toBeInTheDocument()
  })

  it('affiche le contexte quand il existe', () => {
    tasks.mockReturnValue({
      data: [task(day(0), { accountName: 'ACME', contactName: 'Marie Dupont' })],
      isLoading: false,
      isError: false,
    })
    renderList()
    expect(screen.getByText(/ACME · Marie Dupont/)).toBeInTheDocument()
  })

  // #2105.55 — le contexte d'une tâche liée n'était que du TEXTE : impossible
  // d'ouvrir le compte ou le contact d'un clic depuis la liste de tâches.
  it('ouvre le COMPTE lié quand la tâche en porte un', async () => {
    tasks.mockReturnValue({
      data: [task(day(0), { accountId: 'acc-1', accountName: 'ACME' })],
      isLoading: false,
      isError: false,
    })
    renderWithRouter(<TaskList scope="mine" />)
    // le contenu n'apparaît qu'une fois la route (TanStack Router, async) résolue.
    const link = await screen.findByRole('link', { name: /ACME/ })
    expect(link).toHaveAttribute('href', '/accounts/acc-1')
  })

  it('ouvre le CONTACT lié quand la tâche n’a pas de compte', async () => {
    tasks.mockReturnValue({
      data: [task(day(0), { contactId: 'cont-1', contactName: 'Marie Dupont' })],
      isLoading: false,
      isError: false,
    })
    renderWithRouter(<TaskList scope="mine" />)
    const link = await screen.findByRole('link', { name: /Marie Dupont/ })
    expect(link).toHaveAttribute('href', '/contacts/cont-1')
  })

  it('cache les tâches faites — la liste est une liste de choses à faire', () => {
    tasks.mockReturnValue({ data: [task(day(0), { status: 'done' })], isLoading: false, isError: false })
    renderList()
    expect(screen.getByText('Aucune tâche ouverte.')).toBeInTheDocument()
  })

  describe('cocher — confirmation et annulation (#2105.17, .18, .19, .22, .52)', () => {
    it('montre une confirmation nommée AVANT de disparaître, avec un bouton Annuler', () => {
      tasks.mockReturnValue({
        data: [task(day(0), { id: 't1', title: 'Rappeler le DSI' })],
        isLoading: false,
        isError: false,
      })
      renderList()
      fireEvent.click(screen.getByRole('checkbox', { name: 'Marquer comme faite' }))

      expect(update).toHaveBeenCalledWith({ id: 't1', status: 'done' })
      // #2105.17 — le libellé EXACT : rien n'a été envoyé.
      expect(screen.getByText('« Rappeler le DSI » marquée terminée · aucun message envoyé')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument()
    })

    it('Annuler rouvre la tâche et retire la confirmation', () => {
      tasks.mockReturnValue({
        data: [task(day(0), { id: 't1', title: 'Rappeler le DSI' })],
        isLoading: false,
        isError: false,
      })
      renderList()
      fireEvent.click(screen.getByRole('checkbox', { name: 'Marquer comme faite' }))
      fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))

      expect(update).toHaveBeenCalledWith({ id: 't1', status: 'todo' })
      expect(screen.queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument()
    })

    it('la confirmation se retire seule après le délai de grâce, sans qu’on la rappelle', () => {
      tasks.mockReturnValue({
        data: [task(day(0), { id: 't1', title: 'Rappeler le DSI' })],
        isLoading: false,
        isError: false,
      })
      renderList()
      fireEvent.click(screen.getByRole('checkbox', { name: 'Marquer comme faite' }))
      expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument()

      act(() => void vi.advanceTimersByTime(10_000))

      expect(screen.queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument()
    })
  })

  describe('#2108.54 (épopée #2767) — task_completed, un écran seul, jamais le libellé', () => {
    it('coche une tâche avec `screen` posé : `trackTaskCompleted` reçoit l’écran, jamais le titre', () => {
      tasks.mockReturnValue({
        data: [task(day(0), { id: 't1', title: 'Rappeler le DSI' })],
        isLoading: false,
        isError: false,
      })
      renderList({ screen: '/briefing/' })
      fireEvent.click(screen.getByRole('checkbox', { name: 'Marquer comme faite' }))

      expect(trackTaskCompleted).toHaveBeenCalledTimes(1)
      expect(trackTaskCompleted).toHaveBeenCalledWith('/briefing/')
    })

    it('sans `screen` (appelant qui ne le passe pas) : coche, mais n’émet rien', () => {
      tasks.mockReturnValue({
        data: [task(day(0), { id: 't1', title: 'Rappeler le DSI' })],
        isLoading: false,
        isError: false,
      })
      renderList()
      fireEvent.click(screen.getByRole('checkbox', { name: 'Marquer comme faite' }))

      expect(update).toHaveBeenCalledWith({ id: 't1', status: 'done' })
      expect(trackTaskCompleted).not.toHaveBeenCalled()
    })

    it('Annuler ne réémet rien — décocher n’est pas un second achèvement', () => {
      tasks.mockReturnValue({
        data: [task(day(0), { id: 't1', title: 'Rappeler le DSI' })],
        isLoading: false,
        isError: false,
      })
      renderList({ screen: '/briefing/' })
      fireEvent.click(screen.getByRole('checkbox', { name: 'Marquer comme faite' }))
      fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))

      expect(trackTaskCompleted).toHaveBeenCalledOnce()
    })
  })

  describe('historique (#2105.20)', () => {
    it('propose un accès à l’historique, replié par défaut', () => {
      tasks.mockReturnValue({ data: [task(day(0))], isLoading: false, isError: false })
      renderList()
      expect(screen.getByRole('button', { name: 'Historique' })).toBeInTheDocument()
    })

    it('affiche les tâches closes seulement une fois l’historique ouvert', () => {
      const closed = task(day(0), { status: 'done', title: 'Déjà faite', completedAt: '2026-08-16T10:00:00.000Z' })
      // Le serveur ne rend l'historique QUE sur demande (`includeDone`) : le
      // mock reflète cette dépendance plutôt que de fixer une donnée figée.
      tasks.mockImplementation((_scope: unknown, _id: unknown, options: { includeDone?: boolean } = {}) => ({
        data: options.includeDone ? [closed] : [],
        isLoading: false,
        isError: false,
      }))
      renderList()
      expect(screen.queryByText('Déjà faite')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Historique' }))

      expect(screen.getByText('Déjà faite')).toBeInTheDocument()
    })
  })

  describe('reporter en un geste (#4134)', () => {
    it('« Demain » repousse l’échéance au lendemain d’AUJOURD’HUI, même pour un retard', () => {
      tasks.mockReturnValue({ data: [task(day(-3), { title: 'Vieille tâche' })], isLoading: false, isError: false })
      renderList()
      fireEvent.click(screen.getByRole('button', { name: 'Reporter à demain' }))
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ id: expect.any(String), dueOn: day(1) }))
    })

    it('« Semaine prochaine » vise le lundi suivant (17/08/2026 est un lundi → 24/08)', () => {
      tasks.mockReturnValue({ data: [task(day(0))], isLoading: false, isError: false })
      renderList()
      fireEvent.click(screen.getByRole('button', { name: 'Reporter à la semaine prochaine' }))
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ dueOn: day(7) }))
    })

    it('la confirmation nomme la tâche et « Annuler » remet l’ancienne échéance', () => {
      const original = day(0)
      tasks.mockReturnValue({ data: [task(original, { title: 'Relancer ACME' })], isLoading: false, isError: false })
      renderList()
      fireEvent.click(screen.getByRole('button', { name: 'Reporter à demain' }))
      expect(screen.getByText(/« Relancer ACME » reportée/)).toBeInTheDocument()
      update.mockClear()
      fireEvent.click(screen.getByRole('button', { name: 'Annuler le report' }))
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ dueOn: original }))
      expect(screen.queryByText(/« Relancer ACME » reportée/)).not.toBeInTheDocument()
    })
  })
})
