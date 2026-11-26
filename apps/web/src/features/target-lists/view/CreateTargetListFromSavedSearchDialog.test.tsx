import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyUnifiedFilters } from '@/features/discover/lib/discover-filters'
import type { SavedSearch } from '@/features/discover/lib/discover-saved-searches'
import { renderWithRouter, resetTestQueryClient } from '@/test-utils/renderWithRouter'

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { CreateTargetListFromSavedSearchDialog } = await import('./CreateTargetListFromSavedSearchDialog')

// #2157.57 — recherche enregistrée : chercher → APERÇU (retenus, écartés, données manquantes, retrait)
// → verser. Rien ne s'écrit avant le clic « Créer » de l'aperçu.
const STAMP = '2026-11-01T00:00:00.000Z'

function savedSearch(): SavedSearch {
  return {
    id: 's1',
    label: 'ETI industrielles 69',
    filters: { ...emptyUnifiedFilters(), department: '69' },
    savedAt: Date.parse(STAMP),
    objective: 'Ouvrir 3 comptes',
    alertFrequency: 'manual',
    alertChannel: null,
    resultType: null,
    newItems: null,
    sourceKinds: [],
    lastRunAt: null,
    ownerId: 'u1',
    ownerName: null,
    shared: false,
  }
}

type FetchArgs = { path: string; method?: string; body?: unknown }

function mockApi() {
  apiFetch.mockImplementation(async (args?: FetchArgs) => {
    const { path, method } = args ?? { path: '' }
    if (path.includes('/discover/')) {
      return {
        candidates: [
          { name: 'Acme', siren: '552100554', sector: 'Industrie', accountId: 'acc-1' },
          { name: 'Globex', siren: '732829320', sector: null, accountId: null },
          { name: 'Initech', siren: '404833048', sector: 'Services', accountId: 'acc-3' },
        ],
      }
    }
    if (path === '/target-lists' && method === 'POST') {
      return {
        id: 'list-1',
        name: 'ETI industrielles 69',
        objective: null,
        type: null,
        owner_user_id: null,
        team: null,
        visibility: 'workspace',
        source: 'saved_search',
        source_query: null,
        status: 'draft',
        counts: { measured: true, total: 0, ready_to_work: 0, to_review: 0 },
        next_action: null,
        sequence_id: null,
        prospecting_session_id: null,
        created_by: 'u1',
        created_at: STAMP,
        updated_at: STAMP,
        items: [],
      }
    }
    if (path === '/accounts/portfolio') return { id: 'acc-2' }
    return {}
  })
}

const writes = () =>
  (apiFetch.mock.calls as [FetchArgs][])
    .map(([a]) => a)
    .filter(a => a.method === 'POST' && !a.path.includes('/discover/'))

function renderDialog() {
  const onOpenChange = vi.fn()
  const utils = renderWithRouter(
    <CreateTargetListFromSavedSearchDialog search={savedSearch()} onOpenChange={onOpenChange} />,
  )
  return { ...utils, onOpenChange }
}

beforeEach(() => {
  apiFetch.mockReset()
  resetTestQueryClient()
  mockApi()
})

describe('CreateTargetListFromSavedSearchDialog — #2157.57', () => {
  it("montre l'aperçu des candidats trouvés SANS rien écrire avant le clic", async () => {
    renderDialog()
    expect(await screen.findByText('Acme')).toBeTruthy()
    expect(screen.getByText('Globex')).toBeTruthy()
    expect(screen.getByText('Initech')).toBeTruthy()
    expect(writes()).toHaveLength(0)
  })

  it('nomme la donnée manquante (secteur) sans jamais écrire « 0 »', async () => {
    renderDialog()
    await screen.findByText('Acme')
    expect(screen.getByText(/Globex/, { selector: '[data-missing]' })).toBeTruthy()
  })

  it('retirer un candidat le nomme parmi les écartés, et il ne part pas au versement', async () => {
    renderDialog()
    await screen.findByText('Acme')
    fireEvent.click(screen.getByRole('button', { name: /Retirer Initech/ }))
    expect(screen.getByTestId('saved-search-excluded').textContent).toContain('Initech')
    expect(writes()).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: /Créer la cible/ }))
    await waitFor(() => expect(writes().some(w => w.path === '/target-lists')).toBe(true))
    await waitFor(() => expect(writes().filter(w => w.path.includes('/items'))).toHaveLength(2))
    const refs = writes()
      .filter(w => w.path.includes('/items'))
      .map(w => (w.body as { ref_id: string }).ref_id)
    expect(refs.sort()).toEqual(['acc-1', 'acc-2'])
  })

  it('tout retiré = création désactivée, aucune liste créée', async () => {
    renderDialog()
    await screen.findByText('Acme')
    for (const name of ['Acme', 'Globex', 'Initech']) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`Retirer ${name}`) }))
    }
    expect((screen.getByRole('button', { name: /Créer la cible/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(writes()).toHaveLength(0)
  })

  it('une recherche sans résultat ne propose pas de créer une cible vide à l’aveugle', async () => {
    apiFetch.mockImplementation(async () => ({ candidates: [] }))
    renderDialog()
    await waitFor(() => expect(screen.getByText(/aucun résultat/i)).toBeTruthy())
    expect((screen.getByRole('button', { name: /Créer la cible/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})
