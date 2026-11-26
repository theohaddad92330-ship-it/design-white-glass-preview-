import type { SavedView, TalentSearchQuery } from '@bellum/contracts'
import { SAVED_VIEWS_MAX_PER_SCOPE } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2152.37 — LES VUES ENREGISTRÉES DU VIVIER.
 *
 * Même contrat que `open-needs/view/SavedNeedViews.test.tsx` (I-34) : ce que
 * ces tests verrouillent est ce qui se dit AVANT le clic (une vue sans
 * critère est refusée par le serveur), pas seulement ce qui se passe après.
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

const { SavedTalentViews } = await import('./SavedTalentViews')

function view(over: Partial<SavedView> = {}): SavedView {
  return {
    id: 'v-1',
    scope: 'talents',
    name: 'Java disponible',
    filters: { q: 'java', availability: 'immediate' },
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

function draw(draft: Partial<TalentSearchQuery>, onApply = vi.fn()) {
  render(<SavedTalentViews draft={draft} onApply={onApply} />)
  return onApply
}

beforeEach(() => {
  vi.clearAllMocks()
  planFeature = { known: true, allowed: true }
  list.mockReturnValue(loaded([]))
})

describe('vues enregistrées du vivier — l’enregistrement', () => {
  it('REFUSE d’enregistrer sans critère, et dit pourquoi avant le clic', () => {
    draw({})
    expect(screen.getByRole('button', { name: 'Enregistrer cette vue' })).toBeDisabled()
    expect(screen.getByText(/une vue sans critère est la liste complète/i)).toBeInTheDocument()
  })

  it('enregistre les CRITÈRES sous le nom saisi, en vue personnelle, jamais la pagination', async () => {
    const user = userEvent.setup()
    draw({ q: 'java', page: 2, limit: 25 })

    await user.click(screen.getByRole('button', { name: 'Enregistrer cette vue' }))
    await user.type(screen.getByLabelText('Nom de la vue'), '  Java dispo  ')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0][0]).toEqual({
      scope: 'talents',
      name: 'Java dispo',
      filters: { q: 'java' },
      shared: false,
    })
  })

  it('REFUSE au-delà du plafond du contrat, et le dit avec le chiffre', () => {
    const mine = Array.from({ length: SAVED_VIEWS_MAX_PER_SCOPE }, (_, index) =>
      view({ id: `v-${index}`, name: `Vue ${index}` }),
    )
    list.mockReturnValue(loaded(mine))
    draw({ q: 'java' })

    expect(screen.getByRole('button', { name: 'Enregistrer cette vue' })).toBeDisabled()
    expect(screen.getByText(new RegExp(String(SAVED_VIEWS_MAX_PER_SCOPE)))).toBeInTheDocument()
  })
})

describe('vues enregistrées du vivier — appliquer et supprimer', () => {
  it('applique les critères de la vue en un clic', async () => {
    const user = userEvent.setup()
    list.mockReturnValue(loaded([view()]))
    const onApply = draw({})

    await user.click(screen.getByRole('button', { name: 'Java disponible' }))

    expect(onApply).toHaveBeenCalledWith({ q: 'java', availability: 'immediate' })
  })

  it('supprime une vue qui M’APPARTIENT', async () => {
    const user = userEvent.setup()
    list.mockReturnValue(loaded([view()]))
    draw({})

    await user.click(screen.getByRole('button', { name: 'Supprimer la vue « Java disponible »' }))

    expect(remove.mock.calls[0][0]).toEqual({ id: 'v-1' })
  })

  it('n’offre PAS de supprimer la vue partagée d’un collègue — le serveur la refuserait', () => {
    list.mockReturnValue(loaded([view({ ownerId: 'collegue', shared: true })]))
    draw({})

    expect(screen.queryByRole('button', { name: /^Supprimer la vue/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Java disponible/ })).toBeInTheDocument()
  })
})

describe('vues enregistrées du vivier — la capacité manquante DÉGRADE', () => {
  it('cache la fonction et dit pourquoi quand l’offre ne l’ouvre pas', () => {
    planFeature = { known: true, allowed: false }
    draw({ q: 'java' })

    expect(screen.queryByRole('button', { name: 'Enregistrer cette vue' })).not.toBeInTheDocument()
    expect(screen.getByText(/ton offre/i)).toBeInTheDocument()
  })

  it('reste OUVERTE tant que l’offre est inconnue — le doute n’interdit pas', () => {
    planFeature = { known: false, allowed: true }
    draw({ q: 'java' })

    expect(screen.getByRole('button', { name: 'Enregistrer cette vue' })).toBeEnabled()
  })

  it('DIT qu’il n’a pas pu charger plutôt que d’afficher une liste vide', () => {
    list.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    draw({ q: 'java' })

    expect(screen.getByText(/pas pu charger/i)).toBeInTheDocument()
  })
})
