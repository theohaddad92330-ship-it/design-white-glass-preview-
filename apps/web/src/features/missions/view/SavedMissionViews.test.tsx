import type { SavedView } from '@bellum/contracts'
import { SAVED_VIEWS_MAX_PER_SCOPE } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyMissionFilterState, type MissionFilterState } from '../mission-saved-view-filters'

/**
 * #2408.54 — LES VUES ENREGISTRÉES DE « MISSIONS », même patron que
 * `SavedTalentViews.test.tsx` (#2152.37) : ce que ces tests verrouillent est
 * ce qui se dit AVANT le clic (une vue sans critère est refusée par le
 * serveur), pas seulement ce qui se passe après.
 */

const list = vi.fn()
const create = vi.fn()
const remove = vi.fn()
let planFeature = { known: true, allowed: true }

vi.mock('@/features/governance/api', () => ({
  useSavedViews: () => list(),
  useCreateSavedView: () => ({ mutate: create, isPending: false }),
  useRemoveSavedView: () => ({ mutate: remove, isPending: false }),
}))

vi.mock('@/features/plan-features/usePlanFeature', () => ({
  usePlanFeature: () => planFeature,
}))

vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'me' }, loading: false }),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { SavedMissionViews } = await import('./SavedMissionViews')

function view(over: Partial<SavedView> = {}): SavedView {
  return {
    id: 'v-1',
    scope: 'missions',
    name: 'CRA en retard',
    filters: { facets: ['withRisk'] },
    shared: false,
    objective: null,
    alertFrequency: 'manual' as const,
    alertChannel: null,
    resultType: null,
    newItems: null,
    sourceKinds: [],
    lastRunAt: null,
    ownerId: 'me',
    ownerName: 'Moi',
    createdAt: '2026-08-20T09:00:00.000Z',
    ...over,
  }
}

function loaded(items: SavedView[]) {
  return { data: items, isLoading: false, isError: false }
}

function draw(draft: MissionFilterState, onApply = vi.fn()) {
  render(<SavedMissionViews draft={draft} onApply={onApply} />)
  return onApply
}

beforeEach(() => {
  vi.clearAllMocks()
  planFeature = { known: true, allowed: true }
  list.mockReturnValue(loaded([]))
})

describe('vues enregistrées de missions — l’enregistrement', () => {
  it('REFUSE d’enregistrer sans critère, et dit pourquoi avant le clic', () => {
    draw(emptyMissionFilterState())
    expect(screen.getByRole('button', { name: 'Enregistrer cette vue' })).toBeDisabled()
    expect(screen.getByText(/une vue sans critère est la liste complète/i)).toBeInTheDocument()
  })

  it('enregistre les CRITÈRES sous le nom saisi, en vue personnelle', async () => {
    const user = userEvent.setup()
    draw({ ...emptyMissionFilterState(), facets: ['withRisk'] })

    await user.click(screen.getByRole('button', { name: 'Enregistrer cette vue' }))
    await user.type(screen.getByLabelText('Nom de la vue'), '  CRA en retard  ')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0][0]).toEqual({
      scope: 'missions',
      name: 'CRA en retard',
      filters: { facets: ['withRisk'] },
      shared: false,
    })
  })

  it('REFUSE au-delà du plafond du contrat, et le dit avec le chiffre', () => {
    const mine = Array.from({ length: SAVED_VIEWS_MAX_PER_SCOPE }, (_, index) =>
      view({ id: `v-${index}`, name: `Vue ${index}` }),
    )
    list.mockReturnValue(loaded(mine))
    draw({ ...emptyMissionFilterState(), facets: ['withRisk'] })

    expect(screen.getByRole('button', { name: 'Enregistrer cette vue' })).toBeDisabled()
    expect(screen.getByText(new RegExp(String(SAVED_VIEWS_MAX_PER_SCOPE)))).toBeInTheDocument()
  })
})

describe('vues enregistrées de missions — appliquer et supprimer', () => {
  it('applique les critères de la vue en un clic', async () => {
    const user = userEvent.setup()
    list.mockReturnValue(loaded([view()]))
    const onApply = draw(emptyMissionFilterState())

    await user.click(screen.getByRole('button', { name: 'CRA en retard' }))

    expect(onApply).toHaveBeenCalledWith({ ...emptyMissionFilterState(), facets: ['withRisk'] })
  })

  it('supprime une vue qui M’APPARTIENT', async () => {
    const user = userEvent.setup()
    list.mockReturnValue(loaded([view()]))
    draw(emptyMissionFilterState())

    await user.click(screen.getByRole('button', { name: 'Supprimer la vue « CRA en retard »' }))

    expect(remove.mock.calls[0][0]).toEqual({ id: 'v-1' })
  })
})

describe('vues enregistrées de missions — la capacité manquante DÉGRADE', () => {
  it('cache la fonction et dit pourquoi quand l’offre ne l’ouvre pas', () => {
    planFeature = { known: true, allowed: false }
    draw({ ...emptyMissionFilterState(), facets: ['withRisk'] })

    expect(screen.queryByRole('button', { name: 'Enregistrer cette vue' })).not.toBeInTheDocument()
    expect(screen.getByText(/ton offre/i)).toBeInTheDocument()
  })
})
