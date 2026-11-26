import { SAVED_VIEWS_MAX_PER_SCOPE, type SavedView } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyPipelineFilters, type PipelineFilters } from '../model/pipeline-saved-view'

/**
 * #2170.52 — LES VUES ENREGISTRÉES DU PIPE.
 *
 * Même patron de test que `SavedNeedViews.test.tsx` (besoins ouverts) : ce
 * qui se dit AVANT le clic compte plus que ce qui se passe après. Différence
 * assumée : le panneau vit dans un `Popover` fermé par défaut (le pipe n'a
 * pas de tiroir de filtres dédié) — chaque test l'ouvre d'abord.
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

const { SavedPipelineViews } = await import('./SavedPipelineViews')

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.scrollIntoView ??= () => {}
})

function view(over: Partial<SavedView> = {}): SavedView {
  return {
    id: 'v-1',
    scope: 'projects_pipe',
    name: 'Mes affaires à signer',
    filters: { toSign: true },
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

async function draw(draft: PipelineFilters, onApply = vi.fn()) {
  const user = userEvent.setup()
  render(<SavedPipelineViews draft={draft} onApply={onApply} />)
  await user.click(screen.getByRole('button', { name: 'Vues enregistrées' }))
  return { user, onApply }
}

const withCriteria = (): PipelineFilters => ({ ...emptyPipelineFilters(), toSign: true })

beforeEach(() => {
  vi.clearAllMocks()
  planFeature = { known: true, allowed: true }
  list.mockReturnValue(loaded([]))
})

describe('vues enregistrées du pipe — l’enregistrement', () => {
  it('REFUSE d’enregistrer sans critère, et dit pourquoi avant le clic', async () => {
    await draw(emptyPipelineFilters())
    expect(screen.getByRole('button', { name: 'Enregistrer cette vue' })).toBeDisabled()
    expect(screen.getByText(/une vue sans critère est la liste complète/i)).toBeInTheDocument()
  })

  it('enregistre les CRITÈRES sous le nom saisi, en vue personnelle', async () => {
    const { user } = await draw(withCriteria())

    await user.click(screen.getByRole('button', { name: 'Enregistrer cette vue' }))
    await user.type(screen.getByLabelText('Nom de la vue'), '  Mes affaires à signer  ')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0][0]).toEqual({
      scope: 'projects_pipe',
      name: 'Mes affaires à signer',
      filters: { toSign: true },
      shared: false,
    })
  })

  it('REFUSE au-delà du plafond du contrat, et le dit avec le chiffre', async () => {
    const mine = Array.from({ length: SAVED_VIEWS_MAX_PER_SCOPE }, (_, index) =>
      view({ id: `v-${index}`, name: `Vue ${index}` }),
    )
    list.mockReturnValue(loaded(mine))
    await draw(withCriteria())

    expect(screen.getByRole('button', { name: 'Enregistrer cette vue' })).toBeDisabled()
    expect(screen.getByText(new RegExp(String(SAVED_VIEWS_MAX_PER_SCOPE)))).toBeInTheDocument()
  })
})

describe('vues enregistrées du pipe — appliquer et supprimer', () => {
  it('applique les critères de la vue en un clic', async () => {
    list.mockReturnValue(loaded([view()]))
    const { user, onApply } = await draw(emptyPipelineFilters())

    await user.click(screen.getByRole('button', { name: 'Mes affaires à signer' }))

    expect(onApply).toHaveBeenCalledWith({ ...emptyPipelineFilters(), toSign: true })
  })

  it('supprime une vue qui M’APPARTIENT', async () => {
    list.mockReturnValue(loaded([view()]))
    const { user } = await draw(emptyPipelineFilters())

    await user.click(screen.getByRole('button', { name: 'Supprimer la vue « Mes affaires à signer »' }))

    expect(remove.mock.calls[0][0]).toEqual({ id: 'v-1' })
  })

  it('n’offre PAS de supprimer la vue partagée d’un collègue — le serveur la refuserait', async () => {
    list.mockReturnValue(loaded([view({ ownerId: 'collegue', shared: true })]))
    await draw(emptyPipelineFilters())

    expect(screen.queryByRole('button', { name: /^Supprimer la vue/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Mes affaires à signer/ })).toBeInTheDocument()
  })
})

describe('vues enregistrées du pipe — la capacité manquante DÉGRADE', () => {
  it('cache le bouton entier quand l’offre ne l’ouvre pas', () => {
    planFeature = { known: true, allowed: false }
    render(<SavedPipelineViews draft={withCriteria()} onApply={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Vues enregistrées' })).not.toBeInTheDocument()
  })

  it('reste OUVERTE tant que l’offre est inconnue — le doute n’interdit pas', async () => {
    planFeature = { known: false, allowed: true }
    await draw(withCriteria())

    expect(screen.getByRole('button', { name: 'Enregistrer cette vue' })).toBeEnabled()
  })
})
