import { SAVED_VIEWS_MAX_PER_SCOPE, emptyNeedFilters, type NeedFilters, type SavedView } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * La vue enregistrable de l'écran des besoins (I-34).
 *
 * Ce que ces tests verrouillent est ce qui se dit AVANT le clic : une vue sans
 * critère est refusée par le serveur, et un écran qui laisse cliquer pour
 * récolter un 400 affiche une erreur technique à la place d'une phrase.
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

const { SavedNeedViews } = await import('./SavedNeedViews')

function view(over: Partial<SavedView> = {}): SavedView {
  return {
    id: 'v-1',
    scope: 'projects',
    name: 'Java sans shortlist',
    filters: { skill: 'java', without_shortlist: true },
    shared: false,
    objective: null,
    alertFrequency: 'manual' as const,
    alertChannel: null,
    // #2151.5 / .8 / .9 — non qualifié, et « non mesuré » n'est pas 0.
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

function draw(draft: NeedFilters, onApply = vi.fn()) {
  render(<SavedNeedViews draft={draft} onApply={onApply} />)
  return onApply
}

const withCriteria = (): NeedFilters => ({ ...emptyNeedFilters(), skill: 'java' })

beforeEach(() => {
  vi.clearAllMocks()
  planFeature = { known: true, allowed: true }
  list.mockReturnValue(loaded([]))
})

describe('vues enregistrées — l’enregistrement', () => {
  it('REFUSE d’enregistrer sans critère, et dit pourquoi avant le clic', async () => {
    draw(emptyNeedFilters())
    expect(screen.getByRole('button', { name: 'Enregistrer cette vue' })).toBeDisabled()
    expect(screen.getByText(/une vue sans critère est la liste complète/i)).toBeInTheDocument()
  })

  it('enregistre les CRITÈRES sous le nom saisi, en vue personnelle', async () => {
    const user = userEvent.setup()
    draw(withCriteria())

    await user.click(screen.getByRole('button', { name: 'Enregistrer cette vue' }))
    await user.type(screen.getByLabelText('Nom de la vue'), '  Java à staffer  ')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0][0]).toEqual({
      scope: 'projects',
      name: 'Java à staffer',
      filters: { skill: 'java' },
      shared: false,
    })
  })

  it('REFUSE au-delà du plafond du contrat, et le dit avec le chiffre', () => {
    const mine = Array.from({ length: SAVED_VIEWS_MAX_PER_SCOPE }, (_, index) =>
      view({ id: `v-${index}`, name: `Vue ${index}` }),
    )
    list.mockReturnValue(loaded(mine))
    draw(withCriteria())

    expect(screen.getByRole('button', { name: 'Enregistrer cette vue' })).toBeDisabled()
    expect(screen.getByText(new RegExp(String(SAVED_VIEWS_MAX_PER_SCOPE)))).toBeInTheDocument()
  })

  it('ne compte QUE mes vues dans le plafond — une vue partagée par un collègue ne me bloque pas', () => {
    const others = Array.from({ length: SAVED_VIEWS_MAX_PER_SCOPE }, (_, index) =>
      view({ id: `o-${index}`, name: `Vue ${index}`, ownerId: 'collegue', shared: true }),
    )
    list.mockReturnValue(loaded(others))
    draw(withCriteria())

    expect(screen.getByRole('button', { name: 'Enregistrer cette vue' })).toBeEnabled()
  })
})

describe('vues enregistrées — appliquer et supprimer', () => {
  it('applique les critères de la vue en un clic', async () => {
    const user = userEvent.setup()
    list.mockReturnValue(loaded([view()]))
    const onApply = draw(emptyNeedFilters())

    await user.click(screen.getByRole('button', { name: 'Java sans shortlist' }))

    expect(onApply).toHaveBeenCalledWith({ ...emptyNeedFilters(), skill: 'java', without_shortlist: true })
  })

  it('supprime une vue qui M’APPARTIENT', async () => {
    const user = userEvent.setup()
    list.mockReturnValue(loaded([view()]))
    draw(emptyNeedFilters())

    await user.click(screen.getByRole('button', { name: 'Supprimer la vue « Java sans shortlist »' }))

    expect(remove.mock.calls[0][0]).toEqual({ id: 'v-1' })
  })

  it('n’offre PAS de supprimer la vue partagée d’un collègue — le serveur la refuserait', () => {
    list.mockReturnValue(loaded([view({ ownerId: 'collegue', shared: true })]))
    draw(emptyNeedFilters())

    expect(screen.queryByRole('button', { name: /^Supprimer la vue/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Java sans shortlist/ })).toBeInTheDocument()
  })
})

describe('vues enregistrées — la capacité manquante DÉGRADE', () => {
  it('cache la fonction et dit pourquoi quand l’offre ne l’ouvre pas', () => {
    planFeature = { known: true, allowed: false }
    draw(withCriteria())

    expect(screen.queryByRole('button', { name: 'Enregistrer cette vue' })).not.toBeInTheDocument()
    expect(screen.getByText(/ton offre/i)).toBeInTheDocument()
  })

  it('reste OUVERTE tant que l’offre est inconnue — le doute n’interdit pas', () => {
    planFeature = { known: false, allowed: true }
    draw(withCriteria())

    expect(screen.getByRole('button', { name: 'Enregistrer cette vue' })).toBeEnabled()
  })

  it('DIT qu’il n’a pas pu charger plutôt que d’afficher une liste vide', () => {
    list.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    draw(withCriteria())

    expect(screen.getByText(/pas pu charger/i)).toBeInTheDocument()
  })
})
