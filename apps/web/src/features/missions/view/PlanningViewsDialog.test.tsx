import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyPlanningFilters, planningViewToSavedRecord, type PlanningView } from '../planning-views'

const create = vi.fn()
const remove = vi.fn()
const saved = vi.hoisted(() => ({ items: [] as unknown[], locked: false }))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/features/plan-features/usePlanFeature', () => ({
  usePlanFeature: () => ({ known: true, allowed: !saved.locked }),
}))
vi.mock('@/features/governance/api', () => ({
  useSavedViews: () => ({ data: saved.items, isLoading: false, isError: false }),
  useCreateSavedView: () => ({ mutate: create, isPending: false }),
  useRemoveSavedView: () => ({ mutate: remove, isPending: false }),
}))

const { PlanningViewsDialog } = await import('./PlanningViewsDialog')

const CURRENT: PlanningView = {
  filters: { ...emptyPlanningFilters(), account: ['SNCF'] },
  chips: ['ending'],
  anchor: '2026-09',
  scale: 6,
  groupBy: 'account',
  withFinished: false,
}

afterEach(() => {
  cleanup()
  create.mockReset()
  remove.mockReset()
  saved.items = []
  saved.locked = false
})

// Théo missions-planning.R7 — « Mes vues » : les filtres ET la fenêtre de dates.
describe('PlanningViewsDialog', () => {
  it('enregistre la vue courante — filtres, pastilles et fenêtre — sous le nom donné', async () => {
    render(<PlanningViewsDialog open onOpenChange={() => undefined} current={CURRENT} onApply={() => undefined} />)
    const save = screen.getByRole('button', { name: 'Enregistrer la vue courante' })
    expect(save).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Nom de la vue'), 'Fins de l’automne')
    await userEvent.click(save)
    expect(create).toHaveBeenCalledWith(
      { scope: 'missions', name: 'Fins de l’automne', filters: planningViewToSavedRecord(CURRENT), shared: false },
      expect.anything(),
    )
  })

  it('liste seulement les vues du PLANNING, et en applique une au clic', async () => {
    saved.items = [
      { id: 'v1', name: 'Mes fins', ownerId: 'u1', shared: false, filters: planningViewToSavedRecord(CURRENT) },
      { id: 'v2', name: 'Vue de la liste', ownerId: 'u1', shared: false, filters: { query: 'zenith' } },
    ]
    const onApply = vi.fn()
    const onOpenChange = vi.fn()
    render(<PlanningViewsDialog open onOpenChange={onOpenChange} current={CURRENT} onApply={onApply} />)
    const list = screen.getByRole('list', { name: 'Mes vues du planning' })
    expect(within(list).getByRole('button', { name: 'Mes fins' })).toBeInTheDocument()
    expect(screen.queryByText('Vue de la liste')).not.toBeInTheDocument()
    await userEvent.click(within(list).getByRole('button', { name: 'Mes fins' }))
    expect(onApply).toHaveBeenCalledWith(CURRENT)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('dit qu’aucune vue n’est enregistrée plutôt que de rendre une liste vide muette', () => {
    render(<PlanningViewsDialog open onOpenChange={() => undefined} current={CURRENT} onApply={() => undefined} />)
    expect(screen.getByText('Aucune vue enregistrée pour le planning.')).toBeInTheDocument()
  })

  it('une vue qu’on possède se supprime ; celle d’un autre ne se supprime pas', async () => {
    saved.items = [
      { id: 'v1', name: 'La mienne', ownerId: 'u1', shared: false, filters: planningViewToSavedRecord(CURRENT) },
      { id: 'v2', name: 'La sienne', ownerId: 'u2', shared: true, filters: planningViewToSavedRecord(CURRENT) },
    ]
    render(<PlanningViewsDialog open onOpenChange={() => undefined} current={CURRENT} onApply={() => undefined} />)
    // Seule la vue qu'on possède porte un bouton de suppression (nommé), celle d'un autre n'en porte pas.
    expect(screen.getAllByRole('button', { name: /^supprimer/i })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: /^supprimer la vue « la mienne »/i }))
    expect(remove).toHaveBeenCalledWith({ id: 'v1' }, expect.anything())
  })

  it('un plan sans CRM natif voit le verrou, pas un formulaire qui échouerait', () => {
    saved.locked = true
    render(<PlanningViewsDialog open onOpenChange={() => undefined} current={CURRENT} onApply={() => undefined} />)
    expect(screen.queryByLabelText('Nom de la vue')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enregistrer la vue courante' })).not.toBeInTheDocument()
  })
})
